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
  const filePath = path.resolve(process.cwd(), '../uploads/documents/PLANILHA_CONTROLE_CONTRATOS_TECO (1).xlsx');
  console.log(`[Import TECO] Lendo arquivo: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo não encontrado: ${filePath}`);
  }

  // 1. PRIMEIRO: Cadastrar o Projeto TECO - FREI CANUTO - DARDANELLOS
  console.log('\n📁 [ETAPA 1] Criando / Atualizando Projeto TECO - FREI CANUTO - DARDANELLOS...');
  const projectId = 'project-teco-frei-canuto-dardanellos';
  const projectName = 'TECO - FREI CANUTO - DARDANELLOS';

  const project = await prisma.project.upsert({
    where: { id: projectId },
    update: {
      name: projectName,
      neighborhood: 'Frei Canuto / Dardanellos',
      city: 'Aripuanã',
      state: 'MT',
      description: 'Projeto de regularização fundiária urbana TECO - FREI CANUTO - DARDANELLOS',
      status: ProjectStatus.IN_PROGRESS,
      active: true,
    },
    create: {
      id: projectId,
      name: projectName,
      neighborhood: 'Frei Canuto / Dardanellos',
      city: 'Aripuanã',
      state: 'MT',
      description: 'Projeto de regularização fundiária urbana TECO - FREI CANUTO - DARDANELLOS',
      status: ProjectStatus.IN_PROGRESS,
      startDate: new Date(),
      active: true,
    },
  });
  console.log(`✅ Projeto ${project.name} (ID: ${project.id}) pronto.`);

  // 2. Ler planilha
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets['Controle'] || wb.Sheets[wb.SheetNames[0]];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // 3. SEGUNDO: Cadastrar as Quadras no Projeto
  console.log('\n🧱 [ETAPA 2] Identificando e Cadastrando Quadras...');
  const quadrasSet = new Set<string>();

  for (let r = 2; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row) continue;
    const blockNumRaw = String(row[0] || '').trim();
    const rawCpf = String(row[3] || '').trim();
    const cpfDigits = cleanCpf(rawCpf);

    if (cpfDigits.length === 11 && blockNumRaw) {
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
          description: `Quadra ${qNum} - ${projectName}`,
        },
      });
      console.log(`   ✨ Quadra ${qNum} criada no Projeto ${projectName}.`);
    }
    blockMap.set(qNum, block.id);
  }

  // 4. TERCEIRO & QUARTO: Cadastrar Lotes e Vincular Pessoas
  console.log('\n🏡 [ETAPA 3 & 4] Cadastrando Lotes e Vinculando Pessoas...');
  let registeredCount = 0;
  let skippedCount = 0;

  for (let r = 2; r < rawRows.length; r++) {
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

    console.log(`👤 [Linha ${r + 1}] ${fullName} | CPF: ${formattedCpf} | QD: ${cleanBlock} | LT: ${cleanLot}`);

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
          phone: phoneRaw && phoneRaw !== 'NÚMERO ERRADO' ? phoneRaw : null,
          maritalStatus: 'SINGLE',
        },
      });
      console.log(`   ✨ Pessoa criada (ID: ${person.id})`);
    } else {
      person = await prisma.person.update({
        where: { id: person.id },
        data: {
          fullName: person.fullName || fullName,
          phone: person.phone || (phoneRaw && phoneRaw !== 'NÚMERO ERRADO' ? phoneRaw : null),
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
      console.log(`   🏡 Lote ${cleanLot} (QD ${cleanBlock}) criado.`);
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
      const contractNumber = `CTR-TECO-${cleanBlock}-${cleanLot}-${person.id.slice(0, 4)}`;
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
            notes: `Contrato assinado conforme controle TECO. ${obs}`,
          },
        });
        console.log(`   📄 Contrato assinado registrado (${contractNumber}) [Sem financeiro].`);
      }
    }

    registeredCount++;
  }

  // Atualizar contagem de quadras e lotes planejados no projeto
  const totalBlocks = await prisma.block.count({ where: { projectId: project.id } });
  const totalLots = await prisma.lot.count({ where: { projectId: project.id } });
  await prisma.project.update({
    where: { id: project.id },
    data: {
      plannedBlocks: totalBlocks,
      plannedLots: totalLots,
    },
  });

  console.log(`\n================ RESUMO DA ESTRUTURAÇÃO DO PROJETO TECO ================`);
  console.log(`🏢 Projeto: ${project.name} (${project.id})`);
  console.log(`🧱 Total de Quadras criadas: ${totalBlocks}`);
  console.log(`🏡 Total de Lotes criados: ${totalLots}`);
  console.log(`👤 Pessoas com CPF vinculadas: ${registeredCount}`);
  console.log(`⏩ Linhas sem CPF ignoradas: ${skippedCount}`);
  console.log(`🚫 Zero registros financeiros cadastrados (conforme solicitado).`);
}

main()
  .catch((err) => {
    console.error('❌ Erro na importação do Projeto TECO:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
