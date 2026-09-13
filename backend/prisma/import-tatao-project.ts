import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { PrismaClient, OccupancyType, LotStatus, ProjectStatus } from '@prisma/client';

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
  console.log(`[Import Projeto TATÃO] Lendo arquivo: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo não encontrado: ${filePath}`);
  }

  // 1. PRIMEIRO: Cadastrar o Projeto TATÃO
  console.log('\n📁 [ETAPA 1] Criando / Atualizando Projeto TATÃO...');
  const projectId = 'project-tatao-aripuana';
  const project = await prisma.project.upsert({
    where: { id: projectId },
    update: {
      name: 'Tatão - Aripuanã',
      neighborhood: 'Tatão',
      city: 'Aripuanã',
      state: 'MT',
      description: 'Projeto de regularização fundiária urbana Tatão',
      status: ProjectStatus.IN_PROGRESS,
      active: true,
    },
    create: {
      id: projectId,
      name: 'Tatão - Aripuanã',
      neighborhood: 'Tatão',
      city: 'Aripuanã',
      state: 'MT',
      description: 'Projeto de regularização fundiária urbana Tatão',
      status: ProjectStatus.IN_PROGRESS,
      startDate: new Date(),
      active: true,
    },
  });
  console.log(`✅ Projeto ${project.name} (ID: ${project.id}) pronto.`);

  // 2. Limpar cadastros duplicados criados no projeto anterior (Vila Nova Aripuanã) se existirem
  const vilaNova = await prisma.project.findFirst({
    where: { id: 'project-vila-nova-aripuana' },
  });
  if (vilaNova) {
    // Delete blocks 7, 8, 9, 10 from vilaNova if they have no financial records
    const blocksToRemove = await prisma.block.findMany({
      where: {
        projectId: vilaNova.id,
        number: { in: ['7', '8', '9', '10'] },
      },
      include: {
        lots: {
          include: {
            occupancies: true,
            contracts: { include: { negotiations: { include: { installments: true } } } },
          },
        },
      },
    });

    for (const b of blocksToRemove) {
      for (const l of b.lots) {
        // Only delete contracts that have NO installments
        for (const c of l.contracts) {
          const totalInst = c.negotiations.reduce((s, n) => s + n.installments.length, 0);
          if (totalInst === 0) {
            await prisma.negotiation.deleteMany({ where: { contractId: c.id } });
            await prisma.contract.delete({ where: { id: c.id } });
          }
        }
        await prisma.occupancy.deleteMany({ where: { lotId: l.id } });
        await prisma.lot.delete({ where: { id: l.id } });
      }
      await prisma.block.delete({ where: { id: b.id } });
      console.log(`🧹 Bloco ${b.number} removido do projeto Vila Nova Aripuanã.`);
    }

    // Also remove any specific lots from blocks 1, 2, 3, 4, 5 in Vila Nova that belong to Tatao and have no financials
    const tataoLotIdentifiers = [
      { q: '1', l: '16-A' },
      { q: '5', l: '22' },
      { q: '1', l: '3' },
      { q: '2', l: '2' },
      { q: '3', l: '22' },
      { q: '4', l: '8' },
    ];
    for (const t of tataoLotIdentifiers) {
      const b = await prisma.block.findFirst({ where: { projectId: vilaNova.id, number: t.q } });
      if (b) {
        const l = await prisma.lot.findFirst({
          where: { blockId: b.id, number: t.l },
          include: { contracts: { include: { negotiations: { include: { installments: true } } } } },
        });
        if (l) {
          const hasInst = l.contracts.some((c) => c.negotiations.some((n) => n.installments.length > 0));
          if (!hasInst) {
            for (const c of l.contracts) {
              await prisma.negotiation.deleteMany({ where: { contractId: c.id } });
              await prisma.contract.delete({ where: { id: c.id } });
            }
            await prisma.occupancy.deleteMany({ where: { lotId: l.id } });
            await prisma.lot.delete({ where: { id: l.id } });
            console.log(`🧹 Lote ${t.l} (Q${t.q}) desvinculado de Vila Nova Aripuanã.`);
          }
        }
      }
    }
  }

  // 3. Ler planilha
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets['Planilha1'] || wb.Sheets[wb.SheetNames[0]];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // 4. SEGUNDO: Cadastrar as Quadras no Projeto TATÃO
  console.log('\n🧱 [ETAPA 2] Cadastrando Quadras no Projeto TATÃO...');
  const quadrasSet = new Set<string>();
  for (let r = 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row) continue;
    const blockNumRaw = String(row[0] || '').trim();
    const rawCpf = String(row[3] || '').trim();
    const cpfDigits = cleanCpf(rawCpf);

    if (cpfDigits.length === 11 && blockNumRaw && blockNumRaw !== 'F') {
      const cleanBlock = blockNumRaw.replace(/^0+/, '') || '1';
      quadrasSet.add(cleanBlock);
    }
  }

  const blockMap = new Map<string, string>(); // blockNumber -> blockId
  for (const qNum of Array.from(quadrasSet).sort((a, b) => Number(a) - Number(b))) {
    let block = await prisma.block.findFirst({
      where: {
        projectId: project.id,
        number: qNum,
      },
    });

    if (!block) {
      block = await prisma.block.create({
        data: {
          projectId: project.id,
          number: qNum,
          description: `Quadra ${qNum} - Tatão`,
        },
      });
      console.log(`   ✨ Quadra ${qNum} criada no Projeto Tatão.`);
    }
    blockMap.set(qNum, block.id);
  }

  // 5. TERCEIRO: Cadastrar Lotes no Projeto TATÃO e Vincular Pessoas
  console.log('\n🏡 [ETAPA 3 & 4] Cadastrando Lotes e Vinculando Pessoas no Projeto TATÃO...');
  let registeredCount = 0;
  let skippedCount = 0;

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

    // STRICT FILTER: Only register if valid 11-digit CPF
    if (cpfDigits.length !== 11) {
      console.log(`⏩ [IGNORADO - SEM CPF] Linha ${r + 1}: ${fullName || 'Sem nome'} (CPF: '${rawCpf}')`);
      skippedCount++;
      continue;
    }

    const formattedCpf = formatCpf(cpfDigits);
    const isSigned = contractSignedStr.includes('SIM');
    const cleanBlock = blockNumRaw.replace(/^0+/, '') || '1';
    const cleanLot = lotNumRaw.trim();

    console.log(`\n👤 [PROCESSANDO] Linha ${r + 1}: ${fullName} | CPF: ${formattedCpf} | QD: ${cleanBlock} | LT: ${cleanLot}`);

    // A. Pessoa
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
      console.log(`   👤 Pessoa cadastrada: ${person.fullName} (CPF: ${formattedCpf})`);
    } else {
      person = await prisma.person.update({
        where: { id: person.id },
        data: {
          fullName: person.fullName || fullName,
          phone: person.phone || (phoneRaw && phoneRaw !== 'CLODOALDO' ? phoneRaw : null),
        },
      });
    }

    // B. Lote
    const blockId = blockMap.get(cleanBlock);
    if (!blockId) {
      console.error(`   ⚠️ Quadra ${cleanBlock} não encontrada.`);
      continue;
    }

    let lot = await prisma.lot.findFirst({
      where: {
        projectId: project.id,
        blockId,
        number: cleanLot,
      },
    });

    if (!lot) {
      lot = await prisma.lot.create({
        data: {
          projectId: project.id,
          blockId,
          number: cleanLot,
          status: isSigned ? LotStatus.CONTRACT_SIGNED : LotStatus.NOT_SIGNED,
        },
      });
      console.log(`   🏡 Lote ${cleanLot} (Quadra ${cleanBlock}) criado no Projeto Tatão.`);
    }

    // C. Vínculo de Ocupação (OWNER)
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
      console.log(`   🔗 Vínculo de proprietário registrado para o Lote ${cleanLot}.`);
    }

    // D. Contrato Assinado se houver (SEM FINANCEIRO)
    if (isSigned) {
      const contractNumber = `CTR-TATAO-${cleanBlock}-${cleanLot}-${person.id.slice(0, 4)}`;
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

    registeredCount++;
  }

  // Atualizar contagem de quadras e lotes planejados no projeto Tatão
  const totalBlocks = await prisma.block.count({ where: { projectId: project.id } });
  const totalLots = await prisma.lot.count({ where: { projectId: project.id } });
  await prisma.project.update({
    where: { id: project.id },
    data: {
      plannedBlocks: totalBlocks,
      plannedLots: totalLots,
    },
  });

  console.log(`\n================ RESUMO DA ESTRUTURAÇÃO DO PROJETO TATÃO ================`);
  console.log(`🏢 Projeto: ${project.name} (${project.id})`);
  console.log(`🧱 Total de Quadras criadas: ${totalBlocks}`);
  console.log(`🏡 Total de Lotes criados: ${totalLots}`);
  console.log(`👤 Pessoas com CPF vinculadas: ${registeredCount}`);
  console.log(`⏩ Linhas sem CPF ignoradas: ${skippedCount}`);
  console.log(`🚫 Zero registros financeiros cadastrados (conforme solicitado).`);
}

main()
  .catch((err) => {
    console.error('❌ Erro na importação do Projeto Tatão:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
