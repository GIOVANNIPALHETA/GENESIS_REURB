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
  console.log('🚀 [INÍCIO] Importação dos Projetos ÁGUA BOA e Lotes 3486...');

  // 1. Criar / Atualizar os 2 Projetos
  console.log('\n📁 [ETAPA 1] Criando Projetos 3486 - ÁGUA BOA e 1493 - ÁGUA BOA...');

  const project3486 = await prisma.project.upsert({
    where: { id: 'project-3486-agua-boa' },
    update: {
      name: '3486 - ÁGUA BOA',
      neighborhood: 'Água Boa',
      city: 'Aripuanã',
      state: 'MT',
      description: 'Projeto de regularização fundiária urbana Água Boa - Matrícula 3486',
      status: ProjectStatus.IN_PROGRESS,
      active: true,
    },
    create: {
      id: 'project-3486-agua-boa',
      name: '3486 - ÁGUA BOA',
      neighborhood: 'Água Boa',
      city: 'Aripuanã',
      state: 'MT',
      description: 'Projeto de regularização fundiária urbana Água Boa - Matrícula 3486',
      status: ProjectStatus.IN_PROGRESS,
      startDate: new Date(),
      active: true,
    },
  });
  console.log(`✅ Projeto criado/atualizado: ${project3486.name} (${project3486.id})`);

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

  // 2. Criar Quadra 1 no Projeto 3486
  console.log('\n🧱 [ETAPA 2] Criando Quadra 1 no Projeto 3486 - ÁGUA BOA...');
  const block = await prisma.block.upsert({
    where: {
      projectId_number: {
        projectId: project3486.id,
        number: '1',
      },
    },
    update: {
      description: 'Quadra 1 - 3486 - ÁGUA BOA',
      active: true,
    },
    create: {
      projectId: project3486.id,
      number: '1',
      description: 'Quadra 1 - 3486 - ÁGUA BOA',
      active: true,
    },
  });
  console.log(`✅ Quadra 1 criada/atualizada (ID: ${block.id})`);

  // 3. Localizar e Ler a Planilha
  console.log('\n📊 [ETAPA 3] Lendo arquivo 3486-IMPORTAR.xlsx...');
  const fileCandidates = [
    path.resolve(process.cwd(), '../uploads/documents/3486-IMPORTAR.xlsx'),
    path.resolve(process.cwd(), 'uploads/documents/3486-IMPORTAR.xlsx'),
    path.resolve(process.cwd(), '../uploads/3486-IMPORTAR.xlsx'),
  ];
  const filePath = fileCandidates.find((f) => fs.existsSync(f));
  if (!filePath) {
    throw new Error('Arquivo 3486-IMPORTAR.xlsx não foi encontrado.');
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
    const lotNumRaw = String(row.LT || '').trim();
    if (!lotNumRaw) continue;

    const fullName = String(row.NOME || '').trim() || 'Titular Não Informado';
    const rawCpf = String(row.CPF || '').trim();
    const cpfClean = cleanCpf(rawCpf);
    const validCpf = cpfClean.length === 11 ? formatCpf(cpfClean) : null;
    const phone = row.CONTATO ? String(row.CONTATO).replace(/[^\d+ ()-]/g, '').trim() : null;
    const area = parseArea(row['ÁREA']);
    const matricula = String(row.MATRICULA || '3486').trim();

    const situacao = String(row['SITUAÇÃO'] || '').trim();
    const pagamento = String(row['PAGAMENTO'] || '').trim();
    const qtdParcelaRaw = row['QTD DE PARCELA'];
    const obs = String(row['OBSERVAÇÃO'] || '').trim();
    const situacaoBoleto = String(row['SITUAÇÃO DO BOLETO'] || '').trim();

    const sitUpper = situacao.toUpperCase();
    const sitBolUpper = situacaoBoleto.toUpperCase();
    const pagUpper = pagamento.toUpperCase();
    const obsUpper = obs.toUpperCase();

    // Identificar classificação financeira
    const isPaid =
      sitBolUpper.includes('PAGO') ||
      sitUpper.includes('PAGO') ||
      sitUpper.includes('PAGOU') ||
      sitUpper.includes('PASSOU EM DINHEIRO');

    const isParcelado =
      !isPaid &&
      (Boolean(qtdParcelaRaw) ||
        pagUpper.includes('BOLETO') ||
        sitBolUpper.includes('BOLETO') ||
        sitUpper.includes('BOLETO') ||
        sitUpper.includes('RETIROU'));

    const isSigned =
      isPaid ||
      isParcelado ||
      sitUpper.includes('ASSINOU') ||
      sitUpper.includes('TERMO DE ADESÃO FEITO');

    const observationsCombined = [
      situacao ? `Situação: ${situacao}` : '',
      pagamento ? `Pagamento: ${pagamento}` : '',
      qtdParcelaRaw ? `Parcelas: ${qtdParcelaRaw}` : '',
      obs ? `Obs: ${obs}` : '',
      situacaoBoleto ? `Boleto: ${situacaoBoleto}` : '',
    ]
      .filter(Boolean)
      .join(' | ');

    // A. Cadastrar / Atualizar Pessoa
    let person: any = null;
    if (validCpf) {
      person = await prisma.person.findFirst({
        where: {
          OR: [{ cpf: validCpf }, { cpf: cpfClean }],
        },
      });

      if (!person) {
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
      } else {
        person = await prisma.person.update({
          where: { id: person.id },
          data: {
            fullName: person.fullName || fullName,
            phone: person.phone || phone,
            whatsapp: person.whatsapp || phone,
          },
        });
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
          projectId: project3486.id,
          blockId: block.id,
          number: lotNumRaw,
        },
      },
      update: {
        area,
        registration: matricula,
        address: 'Água Boa - Matrícula 3486',
        status: lotStatus,
        observations: observationsCombined,
        active: true,
      },
      create: {
        projectId: project3486.id,
        blockId: block.id,
        number: lotNumRaw,
        area,
        registration: matricula,
        address: 'Água Boa - Matrícula 3486',
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

    // D. Contrato e Financeiro
    const cleanLotSlug = lotNumRaw.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-');
    const contractNumber = `CTR-3486-1-${cleanLotSlug}`;

    // Verificar se já existe contrato
    let contract: any = await prisma.contract.findFirst({
      where: {
        projectId: project3486.id,
        lotId: lot.id,
      },
      include: {
        negotiations: {
          include: { installments: { include: { payments: true } } },
        },
      },
    });

    if (isPaid) {
      paidContracts++;
      const paymentDate = parsePaymentDate(situacao, obs);
      const { method, accountId } = mapPaymentDetails(situacao, pagamento);
      const totalVal = 1000; // Valor combinado para os projetos Água Boa (R$ 1.000,00)

      if (!contract) {
        contract = await prisma.contract.create({
          data: {
            contractNumber,
            projectId: project3486.id,
            lotId: lot.id,
            personId: person.id,
            signed: true,
            signedAt: paymentDate,
            status: 'ACTIVE',
            totalValue: totalVal,
            notes: `Quitado conforme controle 3486. ${observationsCombined}`,
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
            notes: `Quitado conforme controle 3486. ${observationsCombined}`,
          },
          include: {
            negotiations: {
              include: { installments: { include: { payments: true } } },
            },
          },
        });
      }

      // Negociação e Parcela Paga
      if (contract.negotiations.length === 0) {
        const negotiation = await prisma.negotiation.create({
          data: {
            contractId: contract.id,
            totalValue: totalVal,
            downPayment: totalVal,
            financedAmount: 0,
            installmentCount: 1,
            status: 'ACTIVE',
            firstDueDate: paymentDate,
          },
        });

        const installment = await prisma.installment.create({
          data: {
            negotiationId: negotiation.id,
            installmentNumber: 1,
            description: 'Pagamento à Vista Quitado',
            amount: totalVal,
            dueDate: paymentDate,
            paidAmount: totalVal,
            paidAt: paymentDate,
            paymentMethod: method,
            status: PaymentStatus.PAID,
          },
        });

        await prisma.payment.create({
          data: {
            installmentId: installment.id,
            accountId,
            amount: totalVal,
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
      if (typeof qtdParcelaRaw === 'number' && qtdParcelaRaw > 0) {
        numParcels = qtdParcelaRaw;
      } else if (String(qtdParcelaRaw).match(/^\d+$/)) {
        numParcels = parseInt(String(qtdParcelaRaw), 10);
      }

      const totalVal = 1000; // Valor combinado para os projetos Água Boa (R$ 1.000,00)
      const installmentAmount = Number((totalVal / numParcels).toFixed(2));
      const firstDueDate = new Date(2026, 6, 10, 12, 0, 0); // 10 de Julho de 2026

      if (!contract) {
        contract = await prisma.contract.create({
          data: {
            contractNumber,
            projectId: project3486.id,
            lotId: lot.id,
            personId: person.id,
            signed: isSigned,
            signedAt: isSigned ? new Date(2026, 5, 10, 12, 0, 0) : null,
            status: 'ACTIVE',
            totalValue: totalVal,
            notes: `Parcelado em ${numParcels}x conforme controle 3486. ${observationsCombined}`,
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
            notes: `Parcelado em ${numParcels}x conforme controle 3486. ${observationsCombined}`,
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

        // Caso especial: Lote 28 (Dorival) fez o primeiro pagamento
        const isFirstPaid = obsUpper.includes('PRIMEIRO PAGAMENTO FEITO');

        for (let p = 0; p < numParcels; p++) {
          const parcelNum = p + 1;
          const isLast = p === numParcels - 1;
          const amount = isLast
            ? Number((totalVal - installmentAmount * (numParcels - 1)).toFixed(2))
            : installmentAmount;

          const dueDate = new Date(2026, 6 + p, 10, 12, 0, 0);
          const paidThis = isFirstPaid && p === 0;

          const inst = await prisma.installment.create({
            data: {
              negotiationId: negotiation.id,
              installmentNumber: parcelNum,
              description: `Parcela ${parcelNum}/${numParcels}`,
              amount,
              dueDate,
              paidAmount: paidThis ? amount : 0,
              paidAt: paidThis ? new Date(2026, 5, 10, 12, 0, 0) : null,
              paymentMethod: PaymentMethod.ASAAS,
              status: paidThis ? PaymentStatus.PAID : PaymentStatus.PENDING,
            },
          });

          if (paidThis) {
            await prisma.payment.create({
              data: {
                installmentId: inst.id,
                accountId: 'account-asaas',
                amount,
                paymentDate: new Date(2026, 5, 10, 12, 0, 0),
                paymentMethod: PaymentMethod.PIX,
                description: 'Primeiro pagamento realizado',
                notes: observationsCombined,
              },
            });
          }
        }
      }
    } else {
      // Pendente / Aguardando definição (7 lotes)
      pendingContracts++;
      if (!contract) {
        contract = await prisma.contract.create({
          data: {
            contractNumber,
            projectId: project3486.id,
            lotId: lot.id,
            personId: person.id,
            signed: false,
            status: 'PENDING',
            totalValue: 1000,
            notes: `Pendente de definição conforme controle 3486. ${observationsCombined}`,
          },
        });
        contractsImported++;
      }
    }
  }

  // 4. Atualizar Contagem de Lotes no Projeto 3486
  const totalLots = await prisma.lot.count({ where: { projectId: project3486.id } });
  await prisma.project.update({
    where: { id: project3486.id },
    data: {
      plannedBlocks: 1,
      plannedLots: totalLots,
    },
  });

  console.log('\n📊 [RESUMO DA IMPORTAÇÃO NO BANCO DE DADOS]');
  console.log(`🏢 Projeto 3486 - ÁGUA BOA: 1 Quadra, ${totalLots} Lotes cadastrados.`);
  console.log(`🏢 Projeto 1493 - ÁGUA BOA: Criado e disponível para futuros lotes.`);
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

  console.log('\n🎉 [FINALIZADO COM SUCESSO]');
}

main()
  .catch((err) => {
    console.error('❌ Erro durante a importação:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
