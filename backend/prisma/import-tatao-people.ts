import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { PrismaClient, OccupancyType, LotStatus } from '@prisma/client';

const prisma = new PrismaClient();

function formatCpf(clean: string): string {
  if (clean.length !== 11) return clean;
  return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9, 11)}`;
}

function cleanCpf(val: unknown): string {
  return String(val || '').replace(/\D/g, '');
}

async function main() {
  const filePath = path.resolve(process.cwd(), '../uploads/documents/TATÃO ARIPUANÃ - CONTROLE (1).xlsx');
  console.log(`[Import TATÃO] Lendo arquivo: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo não encontrado: ${filePath}`);
  }

  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets['Planilha1'] || wb.Sheets[wb.SheetNames[0]];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // Get or verify Project
  let project = await prisma.project.findFirst({
    where: { name: { contains: 'Vila Nova', mode: 'insensitive' } },
  });

  if (!project) {
    project = await prisma.project.findFirst();
  }

  if (!project) {
    throw new Error('Nenhum projeto cadastrado no banco.');
  }

  console.log(`[Import TATÃO] Vinculando ao projeto: ${project.name} (${project.id})`);

  let registeredCount = 0;
  let skippedCount = 0;
  const processedCpfs = new Set<string>();

  for (let r = 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.every((c: any) => String(c).trim() === '')) continue;

    const blockNumRaw = String(row[0] || '').trim();
    const lotNumRaw = String(row[1] || '').trim();
    const fullName = String(row[2] || '').trim();
    const rawCpf = String(row[3] || '').trim();
    const cpfDigits = cleanCpf(rawCpf);
    const phoneRaw = String(row[4] || '').trim();
    const contractSignedStr = String(row[5] || '').trim().toUpperCase();
    const obs = String(row[8] || '').trim();

    // STRICT RULE: If no valid 11-digit CPF, DO NOT REGISTER
    if (cpfDigits.length !== 11) {
      console.log(`⏩ [IGNORADO - SEM CPF] Linha ${r + 1}: ${fullName || 'Sem nome'} (CPF: '${rawCpf}')`);
      skippedCount++;
      continue;
    }

    const formattedCpf = formatCpf(cpfDigits);
    const isSigned = contractSignedStr.includes('SIM');

    console.log(`\n👤 [CADASTRANDO] Linha ${r + 1}: ${fullName} | CPF: ${formattedCpf} | QD: ${blockNumRaw} | LT: ${lotNumRaw}`);

    // 1. Find or create/update Person
    let person = await prisma.person.findFirst({
      where: {
        OR: [
          { cpf: formattedCpf },
          { cpf: cpfDigits },
        ],
      },
    });

    if (!person) {
      person = await prisma.person.create({
        data: {
          fullName,
          cpf: formattedCpf,
          phone: phoneRaw && phoneRaw !== 'CLODOALDO' ? phoneRaw : null,
          maritalStatus: 'SINGLE',
        },
      });
      console.log(`   ✨ Pessoa criada com sucesso (ID: ${person.id})`);
    } else {
      person = await prisma.person.update({
        where: { id: person.id },
        data: {
          fullName: person.fullName || fullName,
          phone: person.phone || (phoneRaw && phoneRaw !== 'CLODOALDO' ? phoneRaw : null),
        },
      });
      console.log(`   🔄 Pessoa já existente atualizada (ID: ${person.id})`);
    }

    // 2. Resolve Block & Lot if present
    if (blockNumRaw && lotNumRaw && blockNumRaw !== 'F' && lotNumRaw !== 'F') {
      const cleanBlock = blockNumRaw.replace(/^0+/, '') || '1';
      const cleanLot = lotNumRaw.trim();

      // Find or create Block
      let block = await prisma.block.findFirst({
        where: {
          projectId: project.id,
          number: cleanBlock,
        },
      });

      if (!block) {
        block = await prisma.block.create({
          data: {
            projectId: project.id,
            number: cleanBlock,
          },
        });
        console.log(`   🧱 Quadra ${cleanBlock} criada.`);
      }

      // Find or create Lot
      let lot = await prisma.lot.findFirst({
        where: {
          blockId: block.id,
          number: cleanLot,
        },
      });

      if (!lot) {
        lot = await prisma.lot.create({
          data: {
            projectId: project.id,
            blockId: block.id,
            number: cleanLot,
            status: isSigned ? LotStatus.CONTRACT_SIGNED : LotStatus.NOT_SIGNED,
          },
        });
        console.log(`   🏡 Lote ${cleanLot} (Quadra ${cleanBlock}) criado.`);
      }

      // 3. Link Person as Occupancy (OWNER)
      const existingOccupancy = await prisma.occupancy.findFirst({
        where: {
          personId: person.id,
          lotId: lot.id,
        },
      });

      if (!existingOccupancy) {
        await prisma.occupancy.create({
          data: {
            personId: person.id,
            lotId: lot.id,
            type: OccupancyType.OWNER,
            current: true,
            observations: obs || null,
          },
        });
        console.log(`   🔗 Vínculo de proprietário estabelecido para o Lote ${cleanLot}.`);
      }

      // 4. Contract if signed (NO FINANCIAL PLAN YET)
      if (isSigned) {
        const contractNumber = `CTR-${cleanBlock}-${cleanLot}-${person.id.slice(0, 4)}`;
        const existingContract = await prisma.contract.findFirst({
          where: {
            personId: person.id,
            lotId: lot.id,
          },
        });

        if (!existingContract) {
          await prisma.contract.create({
            data: {
              personId: person.id,
              lotId: lot.id,
              projectId: project.id,
              contractNumber,
              signed: true,
              signedAt: new Date(),
              status: 'ACTIVE',
              notes: `Contrato assinado conforme controle Tatão. ${obs}`,
            },
          });
          console.log(`   📄 Contrato assinado registrado (${contractNumber}) [Sem financeiro].`);
        }
      }
    }

    registeredCount++;
    processedCpfs.add(cpfDigits);
  }

  console.log(`\n================ RESUMO DO CADASTRO ================`);
  console.log(`✅ Total de pessoas com CPF cadastradas com sucesso: ${registeredCount}`);
  console.log(`⏩ Total de linhas ignoradas (sem CPF): ${skippedCount}`);
  console.log(`🚫 Nenhuma parcela ou registro financeiro foi criado.`);
}

main()
  .catch((err) => {
    console.error('❌ Erro na importação:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
