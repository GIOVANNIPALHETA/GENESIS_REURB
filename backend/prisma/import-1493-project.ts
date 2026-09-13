import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import {
  PrismaClient,
  OccupancyType,
  LotStatus,
  ProjectStatus,
  PaymentMethod,
  PaymentStatus,
} from '@prisma/client';
import { generateAllFoldersAndSync } from '../src/services/googleDriveSync.service';

const prisma = new PrismaClient();

function formatCpf(clean: string): string {
  if (clean.length !== 11) return clean;
  return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9, 11)}`;
}

function cleanCpf(val: unknown): string {
  let digits = String(val || '').replace(/\D/g, '');
  if (digits.length === 10) {
    digits = digits.padStart(11, '0');
  }
  return digits;
}

function parseArea(val: unknown): number | null {
  if (typeof val === 'number') return val;
  const str = String(val || '')
    .replace(/m²/gi, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '')
    .trim();
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

function parsePaymentDate(sit: string, obs: string): Date {
  const combined = `${sit} ${obs}`.toUpperCase();

  const dayMonthMatch = combined.match(/(\d{1,2})[-/](\d{1,2})/);
  const yearMatch = combined.match(/\b(202\d)\b/);

  let year = 2026;
  if (yearMatch) {
    year = parseInt(yearMatch[1], 10);
  }

  if (dayMonthMatch) {
    const day = parseInt(dayMonthMatch[1], 10);
    const month = parseInt(dayMonthMatch[2], 10) - 1;
    return new Date(year, month, day, 12, 0, 0);
  }

  return new Date(year, 5, 10, 12, 0, 0); // 10 de Junho
}

function mapPaymentDetails(sit: string, pag: string): { method: PaymentMethod; accountId: string } {
  const norm = `${sit} ${pag}`.toUpperCase();
  if (norm.includes('DINHEIRO')) {
    return { method: PaymentMethod.CASH, accountId: 'account-cash' };
  }
  if (norm.includes('CARTÃO') || norm.includes('CARTAO')) {
    return { method: PaymentMethod.CARD, accountId: 'account-mercado-pago' };
  }
  if (norm.includes('CLODOALDO')) {
    return { method: PaymentMethod.PIX, accountId: 'account-cash' };
  }
  if (norm.includes('PIX') || norm.includes('CNPJ') || norm.includes('GENESIS')) {
    return { method: PaymentMethod.PIX, accountId: 'account-asaas' };
  }
  return { method: PaymentMethod.ASAAS, accountId: 'account-asaas' };
}

async function main() {
  console.log('🚀 [INÍCIO] Importação do Projeto 1493 - ÁGUA BOA...');

  // 1. Criar / Atualizar o Projeto 1493 - ÁGUA BOA
  console.log('\n📁 [ETAPA 1] Atualizando Projeto 1493 - ÁGUA BOA...');
  const project1493 = await prisma.project.upsert({
    where: { id: 'project-1493-agua-boa' },
    update: {
      name: '1493 - ÁGUA BOA',
      neighborhood: 'Água Boa',
      city: 'Aripuanã',
      state: 'MT',
      description: 'Projeto de regularização fundiária urbana Água Boa - Matrícula 1493',
      status: ProjectStatus.IN_PROGRESS,
      active: true,
    },
    create: {
      id: 'project-1493-agua-boa',
      name: '1493 - ÁGUA BOA',
      neighborhood: 'Água Boa',
      city: 'Aripuanã',
      state: 'MT',
      description: 'Projeto de regularização fundiária urbana Água Boa - Matrícula 1493',
      status: ProjectStatus.IN_PROGRESS,
      startDate: new Date(),
      active: true,
    },
  });
  console.log(`✅ Projeto criado/atualizado: ${project1493.name} (${project1493.id})`);

  // 2. Criar Quadra 1 no Projeto 1493
  console.log('\n🧱 [ETAPA 2] Criando Quadra 1 no Projeto 1493 - ÁGUA BOA...');
  const block = await prisma.block.upsert({
    where: {
      projectId_number: {
        projectId: project1493.id,
        number: '1',
      },
    },
    update: {
      description: 'Quadra 1 - 1493 - ÁGUA BOA',
      active: true,
    },
    create: {
      projectId: project1493.id,
      number: '1',
      description: 'Quadra 1 - 1493 - ÁGUA BOA',
      active: true,
    },
  });
  console.log(`✅ Quadra 1 criada/atualizada (ID: ${block.id})`);

  // 3. Localizar e Ler a Planilha 1493-IMPORTAR.xlsx
  console.log('\n📊 [ETAPA 3] Lendo arquivo 1493-IMPORTAR.xlsx...');
  const fileCandidates = [
    path.resolve(process.cwd(), '../uploads/documents/1493-IMPORTAR.xlsx'),
    path.resolve(process.cwd(), 'uploads/documents/1493-IMPORTAR.xlsx'),
    path.resolve(process.cwd(), '../uploads/1493-IMPORTAR.xlsx'),
  ];
  const filePath = fileCandidates.find((f) => fs.existsSync(f));
  if (!filePath) {
    throw new Error('Arquivo 1493-IMPORTAR.xlsx não foi encontrado.');
  }
  console.log(`📄 Arquivo localizado: ${filePath}`);

  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  console.log(`📋 Total de linhas na planilha: ${rawRows.length}`);

  let lotsImported = 0;
  let peopleImported = 0;
  let contractsImported = 0;
  let paidContracts = 0;
  let parcelContracts = 0;
  let pendingContracts = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const lotNumRaw = String(row.LOTE || row.LT || '').trim();
    if (!lotNumRaw) continue;

    const fullName = String(row.NOME || '').trim() || 'Titular Não Informado';
    const rawCpf = String(row.CPF || '').trim();

    // Extrair CPF válido (inclusive se houver múltiplos CPFs na célula)
    const matchCpfs = rawCpf.match(/\d{3}\.\d{3}\.\d{3}-\d{2}/g);
    let validCpf: string | null = null;
    let cpfClean: string = '';

    if (matchCpfs && matchCpfs.length > 0) {
      validCpf = matchCpfs[0];
      cpfClean = validCpf.replace(/\D/g, '');
    } else {
      cpfClean = cleanCpf(rawCpf);
      if (cpfClean.length === 11) {
        validCpf = formatCpf(cpfClean);
      }
    }

    const phone = row.CONTATO ? String(row.CONTATO).replace(/[^\d+ ()-]/g, '').trim() : null;
    const area = parseArea(row['ÁREA']);
    const matricula = String(row.MATRICULA || '1493').trim();

    const situacao = String(row['SITUAÇÃO'] || '').trim();
    const pagamento = String(row['PAGAMENTO'] || '').trim();
    const parcelasRaw = row['PARCELAS'] || row['QTD DE PARCELA'];
    const obs = String(row['OBSERVAÇÃO'] || '').trim();

    const sitUpper = situacao.toUpperCase();
    const pagUpper = pagamento.toUpperCase();
    const obsUpper = obs.toUpperCase();

    // Classificação financeira
    const isPaid =
      sitUpper.includes('PAGO') ||
      sitUpper.includes('PAGOU') ||
      sitUpper.includes('QUITOU');

    const isParcelado =
      !isPaid &&
      (Boolean(parcelasRaw) ||
        pagUpper.includes('BOLETO') ||
        sitUpper.includes('BOLETO') ||
        sitUpper.includes('RETIROU') ||
        sitUpper.includes('PARCELADO'));

    const isSigned =
      isPaid ||
      isParcelado ||
      sitUpper.includes('ASSINOU') ||
      sitUpper.includes('CONTRATO ASSINADO');

    const observationsCombined = [
      situacao ? `Situação: ${situacao}` : '',
      pagamento ? `Pagamento: ${pagamento}` : '',
      parcelasRaw ? `Parcelas: ${parcelasRaw}` : '',
      obs ? `Obs: ${obs}` : '',
    ]
      .filter(Boolean)
      .join(' | ');

    // A. Cadastrar / Atualizar Pessoa
    let person: any = null;

    if (validCpf) {
      const existingPerson = await prisma.person.findFirst({
        where: {
          OR: [{ cpf: validCpf }, { cpf: cpfClean }],
        },
      });

      if (existingPerson) {
        // Verificar se é o mesmo titular ou se é um CPF digitado duplicado para outra pessoa
        const firstDbName = existingPerson.fullName.trim().split(' ')[0].toUpperCase();
        const firstRowName = fullName.trim().split(' ')[0].toUpperCase();

        if (firstDbName === firstRowName || existingPerson.fullName.toUpperCase().includes(firstRowName)) {
          person = await prisma.person.update({
            where: { id: existingPerson.id },
            data: {
              fullName: existingPerson.fullName || fullName,
              phone: existingPerson.phone || phone,
              whatsapp: existingPerson.whatsapp || phone,
            },
          });
        } else {
          // Nomes completamente diferentes com o mesmo CPF na planilha (ex: Thiago vs Jair)
          console.warn(`⚠️ CPF ${validCpf} já cadastrado para ${existingPerson.fullName}. Cadastrando ${fullName} sem CPF para evitar conflito.`);
          person = await prisma.person.create({
            data: {
              fullName,
              cpf: null,
              phone,
              whatsapp: phone,
              maritalStatus: 'SINGLE',
              observations: `CPF na planilha: ${validCpf} (conflito de titular com ${existingPerson.fullName}). ${observationsCombined}`,
            },
          });
          peopleImported++;
        }
      } else {
        person = await prisma.person.create({
          data: {
            fullName,
            cpf: validCpf,
            phone,
            whatsapp: phone,
            maritalStatus: 'SINGLE',
            observations: observationsCombined,
          },
        });
        peopleImported++;
      }
    } else {
      person = await prisma.person.findFirst({
        where: {
          fullName,
          cpf: null,
        },
      });

      if (!person) {
        person = await prisma.person.create({
          data: {
            fullName,
            cpf: null,
            phone,
            whatsapp: phone,
            maritalStatus: 'SINGLE',
            observations: observationsCombined,
          },
        });
        peopleImported++;
      }
    }

    // B. Cadastrar / Atualizar Lote
    const lotStatus = isSigned ? LotStatus.CONTRACT_SIGNED : LotStatus.NOT_SIGNED;
    const lot = await prisma.lot.upsert({
      where: {
        projectId_blockId_number: {
          projectId: project1493.id,
          blockId: block.id,
          number: lotNumRaw,
        },
      },
      update: {
        area,
        registration: matricula,
        address: 'Água Boa - Matrícula 1493',
        status: lotStatus,
        observations: observationsCombined,
        active: true,
      },
      create: {
        projectId: project1493.id,
        blockId: block.id,
        number: lotNumRaw,
        area,
        registration: matricula,
        address: 'Água Boa - Matrícula 1493',
        status: lotStatus,
        observations: observationsCombined,
        active: true,
      },
    });
    lotsImported++;

    // C. Vincular Ocupação
    const existingOccupancy = await prisma.occupancy.findFirst({
      where: {
        lotId: lot.id,
        personId: person.id,
      },
    });

    if (!existingOccupancy) {
      await prisma.occupancy.create({
        data: {
          lotId: lot.id,
          personId: person.id,
          type: OccupancyType.OWNER,
          current: true,
          observations: observationsCombined,
        },
      });
    }

    // D. Contrato e Financeiro (R$ 1.000,00 por lote combinado para Água Boa)
    const cleanLotSlug = lotNumRaw.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-');
    const contractNumber = `CTR-1493-1-${cleanLotSlug}`;

    let contract: any = await prisma.contract.findFirst({
      where: {
        projectId: project1493.id,
        lotId: lot.id,
      },
      include: {
        negotiations: {
          include: { installments: { include: { payments: true } } },
        },
      },
    });

    const totalVal = 1000; // Valor combinado para os projetos de Água Boa

    if (isPaid) {
      paidContracts++;
      const paymentDate = parsePaymentDate(situacao, obs);
      const { method, accountId } = mapPaymentDetails(situacao, pagamento);

      // Checar se foi pago 900 com desconto ou 1000
      let paidAmount = totalVal;
      if (sitUpper.includes('900') || obsUpper.includes('900')) {
        paidAmount = 900;
      }

      if (!contract) {
        contract = await prisma.contract.create({
          data: {
            contractNumber,
            projectId: project1493.id,
            lotId: lot.id,
            personId: person.id,
            signed: true,
            signedAt: paymentDate,
            status: 'ACTIVE',
            totalValue: totalVal,
            notes: `Quitado conforme controle 1493. ${observationsCombined}`,
          },
          include: {
            negotiations: {
              include: { installments: { include: { payments: true } } },
            },
          },
        });
        contractsImported++;
      } else {
        contract = await prisma.contract.update({
          where: { id: contract.id },
          data: {
            totalValue: totalVal,
            signed: true,
            signedAt: contract.signedAt || paymentDate,
            status: 'ACTIVE',
            notes: `Quitado conforme controle 1493. ${observationsCombined}`,
          },
          include: {
            negotiations: {
              include: { installments: { include: { payments: true } } },
            },
          },
        });
      }

      if (contract.negotiations.length === 0) {
        const negotiation = await prisma.negotiation.create({
          data: {
            contractId: contract.id,
            totalValue: totalVal,
            downPayment: paidAmount,
            financedAmount: 0,
            installmentCount: 1,
            discount: totalVal - paidAmount,
            status: 'ACTIVE',
            firstDueDate: paymentDate,
          },
        });

        const installment = await prisma.installment.create({
          data: {
            negotiationId: negotiation.id,
            installmentNumber: 1,
            description: 'Pagamento à Vista Quitado',
            amount: paidAmount,
            dueDate: paymentDate,
            paidAmount: paidAmount,
            paidAt: paymentDate,
            paymentMethod: method,
            status: PaymentStatus.PAID,
          },
        });

        await prisma.payment.create({
          data: {
            installmentId: installment.id,
            accountId,
            amount: paidAmount,
            paymentDate,
            paymentMethod: method,
            description: 'Pagamento integral à vista',
            notes: observationsCombined,
          },
        });
      }
    } else if (isParcelado) {
      parcelContracts++;

      let numParcels = 10;
      const parcelStr = String(parcelasRaw || '');
      if (parcelStr.includes('6')) {
        numParcels = 6;
      } else if (parcelStr.includes('5')) {
        numParcels = 5;
      } else if (parcelStr.includes('10')) {
        numParcels = 10;
      }

      const installmentAmount = Number((totalVal / numParcels).toFixed(2));
      const firstDueDate = new Date(2026, 6, 10, 12, 0, 0); // 10 de Julho de 2026
      const isCard = sitUpper.includes('CARTÃO') || sitUpper.includes('CARTAO');
      const paymentMethod = isCard ? PaymentMethod.CARD : PaymentMethod.ASAAS;

      if (!contract) {
        contract = await prisma.contract.create({
          data: {
            contractNumber,
            projectId: project1493.id,
            lotId: lot.id,
            personId: person.id,
            signed: isSigned,
            signedAt: isSigned ? new Date(2026, 5, 10, 12, 0, 0) : null,
            status: 'ACTIVE',
            totalValue: totalVal,
            notes: `Parcelado em ${numParcels}x conforme controle 1493. ${observationsCombined}`,
          },
          include: {
            negotiations: {
              include: { installments: { include: { payments: true } } },
            },
          },
        });
        contractsImported++;
      } else {
        contract = await prisma.contract.update({
          where: { id: contract.id },
          data: {
            totalValue: totalVal,
            signed: isSigned,
            status: 'ACTIVE',
            notes: `Parcelado em ${numParcels}x conforme controle 1493. ${observationsCombined}`,
          },
          include: {
            negotiations: {
              include: { installments: { include: { payments: true } } },
            },
          },
        });
      }

      if (contract.negotiations.length === 0) {
        const negotiation = await prisma.negotiation.create({
          data: {
            contractId: contract.id,
            totalValue: totalVal,
            downPayment: 0,
            financedAmount: totalVal,
            installmentCount: numParcels,
            status: 'ACTIVE',
            firstDueDate,
          },
        });

        for (let p = 0; p < numParcels; p++) {
          const parcelNum = p + 1;
          const isLast = p === numParcels - 1;
          const amount = isLast
            ? Number((totalVal - installmentAmount * (numParcels - 1)).toFixed(2))
            : installmentAmount;

          const dueDate = new Date(2026, 6 + p, 10, 12, 0, 0);

          await prisma.installment.create({
            data: {
              negotiationId: negotiation.id,
              installmentNumber: parcelNum,
              description: `Parcela ${parcelNum}/${numParcels}`,
              amount,
              dueDate,
              paidAmount: 0,
              paymentMethod,
              status: PaymentStatus.PENDING,
            },
          });
        }
      }
    } else {
      // Pendente / Aguardando contato
      pendingContracts++;
      if (!contract) {
        contract = await prisma.contract.create({
          data: {
            contractNumber,
            projectId: project1493.id,
            lotId: lot.id,
            personId: person.id,
            signed: false,
            status: 'PENDING',
            totalValue: totalVal,
            notes: `Pendente de regularização conforme controle 1493. ${observationsCombined}`,
          },
        });
        contractsImported++;
      }
    }
  }

  // 4. Atualizar Contagem de Lotes no Projeto 1493
  const totalLots = await prisma.lot.count({ where: { projectId: project1493.id } });
  await prisma.project.update({
    where: { id: project1493.id },
    data: {
      plannedBlocks: 1,
      plannedLots: totalLots,
    },
  });

  console.log('\n📊 [RESUMO DA IMPORTAÇÃO NO BANCO DE DADOS - PROJETO 1493]');
  console.log(`🏢 Projeto 1493 - ÁGUA BOA: 1 Quadra, ${totalLots} Lotes cadastrados.`);
  console.log(`👤 Pessoas novas cadastradas: ${peopleImported}`);
  console.log(`📄 Contratos cadastrados: ${contractsImported}`);
  console.log(`   - Contratos Quitados (À Vista / Pago): ${paidContracts}`);
  console.log(`   - Contratos Parcelados com Boletos: ${parcelContracts}`);
  console.log(`   - Contratos Pendentes de Regularização: ${pendingContracts}`);

  // 5. Sincronizar Pastas no Google Drive
  console.log('\n☁️ [ETAPA 5] Sincronizando Estrutura de Pastas no Google Drive (G:\\Meu Drive\\GENESIS_REURB)...');
  try {
    const driveResult = await generateAllFoldersAndSync();
    console.log(`✅ Google Drive sincronizado com sucesso!`);
    console.log(`   - Total de Projetos no Drive: ${driveResult.projectsCount}`);
    console.log(`   - Total de Quadras no Drive: ${driveResult.blocksCount}`);
    console.log(`   - Total de Lotes com pastas no Drive: ${driveResult.lotsCount}`);
    console.log(`   - Documentos sincronizados: ${driveResult.documentsSynced}`);
  } catch (err: any) {
    console.error('⚠️ Erro ao sincronizar pastas com o Google Drive:', err.message || err);
  }

  console.log('\n🎉 [FINALIZADO COM SUCESSO - PROJETO 1493]');
}

main()
  .catch((err) => {
    console.error('❌ Erro durante a importação:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

