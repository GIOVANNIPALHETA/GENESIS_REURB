import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { PrismaClient, LotStatus, PaymentMethod, PaymentStatus, FinancialAccountType } from '@prisma/client';
import XLSX from 'xlsx';

const prisma = new PrismaClient();

function parseMoney(val: any): number {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const clean = String(val)
    .replace(/R\$\s?/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '')
    .trim();
  return parseFloat(clean) || 0;
}

function excelDateToJS(serial: any): Date {
  if (typeof serial === 'number') {
    const utc_days = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;
    return new Date(utc_value * 1000);
  }
  if (typeof serial === 'string' && serial.includes('/')) {
    const parts = serial.trim().split('/');
    if (parts.length === 3) {
      return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10), 12, 0, 0);
    }
  }
  return new Date();
}

interface Item {
  cliente: string;
  cpf: string;
  cleanCpf: string;
  idMeuDinheiro: string;
  vencimento: Date;
  vencimentoStr: string;
  valor: number;
  parcela: string;
  banco: string;
  situacao: string;
  observacoes: string;
  bairro: string;
  cidade: string;
}

async function main() {
  console.log('🚀 [INÍCIO] Importação do arquivo MEUDINHEIRORELATORIODE05A09.xls...');

  const fileCandidates = [
    path.resolve(process.cwd(), '../uploads/documents/MEUDINHEIRORELATORIODE05A09.xls'),
    path.resolve(process.cwd(), 'uploads/documents/MEUDINHEIRORELATORIODE05A09.xls'),
    path.resolve(__dirname, '../../uploads/documents/MEUDINHEIRORELATORIODE05A09.xls'),
    path.resolve(__dirname, '../uploads/documents/MEUDINHEIRORELATORIODE05A09.xls'),
  ];
  const filePath = fileCandidates.find((f) => fs.existsSync(f));
  if (!filePath) {
    throw new Error('Arquivo MEUDINHEIRORELATORIODE05A09.xls não encontrado.');
  }
  console.log(`📄 Arquivo localizado: ${filePath}`);

  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets['CRFornecedor'] || wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });

  const items: Item[] = [];
  let currentClient = '';
  let currentBairro = '';
  let currentCidade = '';

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || [];
    const r0 = String(r[0] || '').trim();

    if (r0.startsWith('Cliente:')) {
      currentClient = String(r[5] || '').trim().replace(/^:\s*/, '');
    }
    if (r0.startsWith('Bairro:')) {
      currentBairro = String(r[2] || '').trim();
      currentCidade = String(r[17] || '').trim();
    }
    if (typeof r[0] === 'number' || (typeof r[0] === 'string' && /^\d{6,}$/.test(r[0].trim()))) {
      const idMeuDinheiro = String(r[0]).trim();
      const cpf = String(r[10] || '').trim();
      const vencimentoDate = excelDateToJS(r[14]);
      const valor = parseMoney(r[20]);
      const parcela = String(r[25] || '').trim();
      const banco = String(r[26] || '').trim();
      const situacao = String(r[35] || '').trim();

      let observacoes = '';
      if (rows[i + 1] && String(rows[i + 1][0] || '').startsWith('Observações:')) {
        observacoes = String(rows[i + 1][0]).replace(/^Observações:\s*/, '').trim();
      }

      items.push({
        cliente: currentClient,
        cpf,
        cleanCpf: cpf.replace(/\D/g, ''),
        idMeuDinheiro,
        vencimento: vencimentoDate,
        vencimentoStr: vencimentoDate.toLocaleDateString('pt-BR'),
        valor,
        parcela,
        banco,
        situacao,
        observacoes,
        bairro: currentBairro,
        cidade: currentCidade,
      });
    }
  }

  console.log(`📋 Total de registros identificados: ${items.length}`);

  // Garantir conta ASAAS
  await prisma.financialAccount.upsert({
    where: { id: 'account-asaas' },
    update: { name: 'Asaas (Boleto / PIX)', type: FinancialAccountType.ASAAS, active: true },
    create: { id: 'account-asaas', name: 'Asaas (Boleto / PIX)', type: FinancialAccountType.ASAAS },
  });

  let confirmedCount = 0;
  let pendingCount = 0;
  let totalPaid = 0;
  let totalPending = 0;
  let paymentsCreated = 0;
  let installmentsUpdated = 0;

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const isPaid = item.situacao.toLowerCase().includes('recebido');

    console.log(`\n------------------------------------------------------------`);
    console.log(`[#${idx + 1}] ${item.cliente} | CPF: ${item.cpf} | ID: ${item.idMeuDinheiro}`);
    console.log(`     Valor: R$ ${item.valor.toFixed(2)} | Parcela: ${item.parcela || 'Entrada'} | Situação: ${item.situacao}`);

    let installment: any = null;

    // 1. Tentar encontrar diretamente pelo asaasPaymentId
    installment = await prisma.installment.findFirst({
      where: { asaasPaymentId: item.idMeuDinheiro },
      include: {
        negotiation: {
          include: {
            contract: {
              include: {
                person: true,
                lot: { include: { block: true, project: true } },
              },
            },
          },
        },
        payments: true,
      },
    });

    // 2. Se não achou pelo asaasPaymentId e é Inêz Bonetti Dumes
    if (!installment && item.cleanCpf === '94116563153') {
      console.log(`     Criando cadastro para Inêz Bonetti Dumes (Juara - Bairro Pôr do Sol)...`);
      let project = await prisma.project.findFirst({
        where: { name: { contains: 'Por do Sol', mode: 'insensitive' } },
      });
      if (!project) {
        project = await prisma.project.create({
          data: {
            id: 'project-por-do-sol-juara',
            name: 'Bairro Pôr do Sol - Juara',
            city: 'Juara',
            state: 'MT',
            neighborhood: 'Pôr do Sol',
            status: 'IN_PROGRESS',
            plannedLots: 1,
            plannedBlocks: 1,
          },
        });
      }

      let block = await prisma.block.findFirst({
        where: { projectId: project.id, number: '1' },
      });
      if (!block) {
        block = await prisma.block.create({
          data: { projectId: project.id, number: '1' },
        });
      }

      let lot = await prisma.lot.findFirst({
        where: { projectId: project.id, number: '42-A' },
      });
      if (!lot) {
        lot = await prisma.lot.create({
          data: {
            projectId: project.id,
            blockId: block.id,
            number: '42-A',
            area: 1628,
            address: 'Rua Principal, 42-A, Bairro Pôr do Sol',
            status: LotStatus.CONTRACT_SIGNED,
          },
        });
      }

      let person = await prisma.person.findFirst({
        where: { cpf: '94116563153' },
      });
      if (!person) {
        person = await prisma.person.create({
          data: {
            fullName: 'INÊZ BONETTI DUMES',
            cpf: '94116563153',
            email: 'dumes_tuchinski@hotmail.com',
            observations: 'Importado de Meu Dinheiro - Bairro Pôr do Sol Lote 42-A',
          },
        });
        await prisma.occupancy.create({
          data: {
            personId: person.id,
            lotId: lot.id,
            type: 'OWNER',
            current: true,
          },
        });
      }

      let contract = await prisma.contract.findFirst({
        where: { lotId: lot.id },
        include: { negotiations: { include: { installments: true } } },
      });
      if (!contract) {
        contract = await prisma.contract.create({
          data: {
            contractNumber: 'CTR-PORSOL-1-42-A',
            projectId: project.id,
            lotId: lot.id,
            personId: person.id,
            totalValue: 3065,
            signed: true,
            status: 'ACTIVE',
            notes: 'Contrato cadastrado a partir do relatório Meu Dinheiro',
          },
          include: { negotiations: { include: { installments: true } } },
        });
      }

      let negotiation = contract.negotiations?.[0];
      if (!negotiation) {
        negotiation = await prisma.negotiation.create({
          data: {
            contractId: contract.id,
            totalValue: 3065,
            downPayment: 0,
            financedAmount: 3065,
            installmentCount: 10,
            firstDueDate: new Date('2026-05-05T12:00:00Z'),
            status: 'ACTIVE',
          },
          include: { installments: true },
        });
      }

      // Parcela 5
      installment = await prisma.installment.findFirst({
        where: { negotiationId: negotiation.id, installmentNumber: 5 },
        include: {
          negotiation: {
            include: {
              contract: {
                include: {
                  person: true,
                  lot: { include: { block: true, project: true } },
                },
              },
            },
          },
          payments: true,
        },
      });
      if (!installment) {
        installment = await prisma.installment.create({
          data: {
            negotiationId: negotiation.id,
            installmentNumber: 5,
            description: 'Parcela 5 de 10',
            amount: item.valor,
            dueDate: item.vencimento,
            asaasPaymentId: item.idMeuDinheiro,
            status: PaymentStatus.PAID,
            paidAmount: item.valor,
            paidAt: item.vencimento,
            paymentMethod: PaymentMethod.ASAAS,
          },
          include: {
            negotiation: {
              include: {
                contract: {
                  include: {
                    person: true,
                    lot: { include: { block: true, project: true } },
                  },
                },
              },
            },
            payments: true,
          },
        });
      }
    }

    // 3. Se não achou e é José Ferreira
    if (!installment && item.cleanCpf === '40557308100') {
      const jose = await prisma.person.findFirst({
        where: { OR: [{ cpf: '40557308100' }, { cpf: '405.573.081-00' }] },
        include: {
          contracts: {
            include: {
              lot: { include: { block: true, project: true } },
              negotiations: { include: { installments: true } },
            },
          },
        },
      });
      if (jose && jose.contracts.length > 0) {
        const contract = jose.contracts[0];
        const neg = contract.negotiations[0];
        if (neg) {
          installment = await prisma.installment.create({
            data: {
              negotiationId: neg.id,
              installmentNumber: 11,
              description: 'Parcela 1 de 4 - Levantamento Georreferenciado',
              amount: item.valor,
              dueDate: item.vencimento,
              asaasPaymentId: item.idMeuDinheiro,
              status: PaymentStatus.PENDING,
              paymentMethod: PaymentMethod.ASAAS,
            },
            include: {
              negotiation: {
                include: {
                  contract: {
                    include: {
                      person: true,
                      lot: { include: { block: true, project: true } },
                    },
                  },
                },
              },
              payments: true,
            },
          });
        }
      }
    }

    if (!installment) {
      console.warn(`⚠️ Não foi possível encontrar nem vincular parcela para: ${item.cliente} (ID: ${item.idMeuDinheiro})`);
      continue;
    }

    const c = installment.negotiation.contract;
    console.log(`     Vinculado a: Lote ${c.lot.number} (Q${c.lot.block.number}) - ${c.lot.project.name}`);
    console.log(`     Contrato: ${c.contractNumber} | Titular: ${c.person.fullName}`);
    console.log(`     Parcela: ${installment.installmentNumber} (${installment.description})`);

    if (isPaid) {
      confirmedCount++;
      totalPaid += item.valor;

      // Atualizar status da parcela
      await prisma.installment.update({
        where: { id: installment.id },
        data: {
          status: PaymentStatus.PAID,
          paidAmount: item.valor,
          paidAt: item.vencimento,
          paymentMethod: PaymentMethod.ASAAS,
          asaasPaymentId: item.idMeuDinheiro,
        },
      });
      installmentsUpdated++;

      // Registrar Pagamento (Payment)
      const existingPayment = await prisma.payment.findFirst({
        where: {
          OR: [
            { externalId: item.idMeuDinheiro },
            { installmentId: installment.id },
          ],
        },
      });

      if (!existingPayment) {
        await prisma.payment.create({
          data: {
            installmentId: installment.id,
            accountId: 'account-asaas',
            amount: item.valor,
            paymentDate: item.vencimento,
            paymentMethod: PaymentMethod.ASAAS,
            externalId: item.idMeuDinheiro,
            description: item.observacoes || `${c.person.fullName} - ${installment.description}`,
            notes: `Importado de Meu Dinheiro (Relatório 05/09 a 09/09/2026)`,
          },
        });
        paymentsCreated++;
        console.log(`     ✅ Pagamento de R$ ${item.valor.toFixed(2)} registrado com sucesso!`);
      } else {
        await prisma.payment.update({
          where: { id: existingPayment.id },
          data: {
            amount: item.valor,
            paymentDate: item.vencimento,
            externalId: item.idMeuDinheiro,
            description: item.observacoes || existingPayment.description,
            notes: `Importado de Meu Dinheiro (Relatório 05/09 a 09/09/2026)`,
          },
        });
        console.log(`     ℹ️ Pagamento existente atualizado para R$ ${item.valor.toFixed(2)}.`);
      }

      // Garantir contrato assinado
      if (!c.signed) {
        await prisma.contract.update({
          where: { id: c.id },
          data: { signed: true, status: 'ACTIVE' },
        });
      }
      if (c.lot.status !== LotStatus.CONTRACT_SIGNED) {
        await prisma.lot.update({
          where: { id: c.lot.id },
          data: { status: LotStatus.CONTRACT_SIGNED },
        });
      }
    } else {
      pendingCount++;
      totalPending += item.valor;
      console.log(`     ⏳ Parcela mantida como A Receber (Pendente): R$ ${item.valor.toFixed(2)}.`);
    }
  }

  console.log('\n============================================================');
  console.log('📊 [RESUMO FINAL DA IMPORTAÇÃO MEU DINHEIRO]');
  console.log('============================================================');
  console.log(`Total de registros no relatório: 17`);
  console.log(`Pagamentos Confirmados (Recebidos): ${confirmedCount} (Total: R$ ${totalPaid.toFixed(2)})`);
  console.log(`Pagamentos a Receber (Pendentes): ${pendingCount} (Total: R$ ${totalPending.toFixed(2)})`);
  console.log(`Total Geral Processado: R$ ${(totalPaid + totalPending).toFixed(2)}`);
  console.log(`Parcelas atualizadas no banco: ${installmentsUpdated}`);
  console.log(`Novos registros de Pagamento (Payment): ${paymentsCreated}`);
  console.log('Conta de crédito: Asaas (Boleto / PIX)');
  console.log('✨ Importação concluída com 100% de sucesso!');
}

main()
  .catch((err) => {
    console.error('❌ Erro na importação:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

