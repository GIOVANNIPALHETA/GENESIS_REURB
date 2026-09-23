import { PrismaClient, PaymentMethod, PaymentStatus, ExpenseStatus, FinancialAccountType } from '@prisma/client';
import * as xlsx from 'xlsx';
import * as path from 'path';

const prisma = new PrismaClient();

function parseDate(dateStr: string): Date {
  const [d, m, y] = dateStr.trim().split('/').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

export async function reconcileExtrato23092026(isDryRun = false) {
  console.log(`🚀 [${isDryRun ? 'DRY-RUN / SIMULAÇÃO' : 'EXECUÇÃO'}] CONCILIAÇÃO BANCÁRIA DO EXTRATO ASAAS (01/06/2026 A 23/09/2026)...`);

  // 1. Carregar Usuário Administrador
  let user = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!user) user = await prisma.user.findFirst();
  if (!user) throw new Error('Nenhum usuário encontrado no sistema.');

  // 2. Carregar Conta Asaas
  let asaasAccount = await prisma.financialAccount.findFirst({
    where: {
      OR: [
        { name: { contains: 'Asaas', mode: 'insensitive' } },
        { type: FinancialAccountType.ASAAS }
      ]
    }
  });

  if (!asaasAccount) {
    if (!isDryRun) {
      asaasAccount = await prisma.financialAccount.create({
        data: {
          id: 'account-asaas',
          name: 'Asaas (Boleto / PIX)',
          type: FinancialAccountType.ASAAS,
          openingBalance: 1043.43,
          active: true
        }
      });
    } else {
      asaasAccount = { id: 'account-asaas', name: 'Asaas', type: FinancialAccountType.ASAAS } as any;
    }
  }

  // 3. Tipos de Despesa
  const expenseTypes = await prisma.expenseType.findMany();
  const getExpenseTypeId = (name: string) => {
    const found = expenseTypes.find(e => e.name.toLowerCase().includes(name.toLowerCase()));
    return found ? found.id : expenseTypes[0]?.id || 'default-type';
  };

  // 4. Carregar arquivo Excel
  const filePath = path.resolve(__dirname, '../../uploads/documents/FINANCEIRO/de01062026a23092026.xlsx');
  const wb = xlsx.readFile(filePath, { cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawRows: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // 5. Carregar transações já existentes no banco
  const existingExpenses = await prisma.expense.findMany({ select: { transactionId: true } });
  const existingExpenseTxIds = new Set(existingExpenses.map(e => String(e.transactionId || '').trim()).filter(Boolean));

  const existingPayments = await prisma.payment.findMany({ select: { externalId: true, amount: true, paymentDate: true } });
  const existingPaymentTxIds = new Set(existingPayments.map(p => String(p.externalId || '').trim()).filter(Boolean));

  const allPersons = await prisma.person.findMany({
    include: {
      contracts: {
        include: {
          lot: { include: { block: true } },
          negotiations: {
            include: {
              installments: {
                orderBy: { dueDate: 'asc' },
                include: { payments: true }
              }
            }
          }
        }
      }
    }
  });

  const nameAliases: Record<string, string> = {
    'DAVID BATISTA BOTONI': 'DAVI BATISTA BOTONI',
    'CRISTIANE DE CASTRO DO NASCIMENTO': 'CRISTIANE DE CASTRO NASCIMENTO',
    'MARIA DE SOUSA SILVA': 'MARIA DE FATIMA DA SILVA NERIS',
    'VALDIR ROCHA SILVA': 'VALDIR ROCHA DA SILVA'
  };

  let expensesCreated = 0;
  let expensesSkipped = 0;
  let paymentsCreated = 0;
  let installmentsUpdated = 0;
  let unallocatedPaymentsCreated = 0;
  let paymentsSkipped = 0;

  // 6. PROCESSAR DÉBITOS (DESPESAS)
  for (let r = 3; r < rawRows.length; r++) {
    const row = rawRows[r];
    const dataStr = String(row[0] || '').trim();
    if (!dataStr || dataStr.startsWith('Período') || dataStr.startsWith('Saldo') || dataStr.startsWith('Data')) continue;

    const txId = String(row[1] || '').trim();
    const type = String(row[2] || '').trim();
    const desc = String(row[4] || '').trim();
    const rawVal = typeof row[5] === 'number' ? row[5] : parseFloat(String(row[5] || '0').replace(',', '.'));

    if (rawVal < 0) {
      const amount = Math.abs(rawVal);
      const date = parseDate(dataStr);

      if (txId && existingExpenseTxIds.has(txId)) {
        expensesSkipped++;
        continue;
      }

      let expenseTypeName = 'Despesas Operacionais de Campo';
      let category = 'Operacional';
      let beneficiary = 'Fornecedor';
      let paymentMethod: PaymentMethod = PaymentMethod.ASAAS;

      const descUpper = desc.toUpperCase();

      if (type.includes('WhatsApp')) {
        expenseTypeName = 'Tarifas Bancárias';
        category = 'Tarifas Asaas';
        beneficiary = 'Asaas Gestão Financeira';
        paymentMethod = PaymentMethod.ASAAS;
      } else if (type.includes('boleto') || type.includes('cartão') || type.includes('Pix') || type.includes('mensageria') || type.includes('Venda de Cartão')) {
        expenseTypeName = 'Tarifas Bancárias';
        category = 'Tarifas Asaas';
        beneficiary = 'Asaas Gestão Financeira';
        paymentMethod = PaymentMethod.ASAAS;
      } else if (type.includes('Transação via Pix')) {
        paymentMethod = PaymentMethod.PIX;
        const matchPix = desc.match(/para\s+(.*)$/i);
        beneficiary = matchPix ? matchPix[1].trim().toUpperCase() : 'Transferência Pix';

        if (beneficiary.includes('BARAGUI')) {
          expenseTypeName = 'Topografia e Agrimensura';
          category = 'Topografia';
        } else if (beneficiary.includes('GENESIS')) {
          expenseTypeName = 'Engenharia e Projetos';
          category = 'Gestão REURB';
        } else if (beneficiary.includes('SALETE')) {
          expenseTypeName = 'Serviços Profissionais e Honorários';
          category = 'Repasse Operacional';
        } else {
          expenseTypeName = 'Serviços Profissionais e Honorários';
          category = 'Repasse Operacional';
        }
      }

      const expenseTypeId = getExpenseTypeId(expenseTypeName);

      if (!isDryRun) {
        await prisma.expense.create({
          data: {
            accountId: asaasAccount!.id,
            userId: user!.id,
            expenseTypeId,
            category,
            beneficiary,
            description: desc,
            amount,
            expenseDate: date,
            dueDate: date,
            status: ExpenseStatus.PAID,
            paymentMethod,
            transactionId: txId || null,
            notes: `Extrato bancário Asaas ${dataStr}`
          }
        });
      }

      if (txId) existingExpenseTxIds.add(txId);
      expensesCreated++;
    }
  }

  // 7. PROCESSAR CRÉDITOS (RECEITAS / BAIXAS DE PARCELAS)
  for (let r = 3; r < rawRows.length; r++) {
    const row = rawRows[r];
    const dataStr = String(row[0] || '').trim();
    if (!dataStr || dataStr.startsWith('Período') || dataStr.startsWith('Saldo') || dataStr.startsWith('Data')) continue;

    const txId = String(row[1] || '').trim();
    const type = String(row[2] || '').trim();
    const desc = String(row[4] || '').trim();
    const rawVal = typeof row[5] === 'number' ? row[5] : parseFloat(String(row[5] || '0').replace(',', '.'));
    const faturaId = String(row[8] || '').trim();

    if (rawVal > 0) {
      const amount = rawVal;
      const date = parseDate(dataStr);

      if (txId && existingPaymentTxIds.has(txId)) {
        paymentsSkipped++;
        continue;
      }

      let clientName = '';
      const matchColon = desc.match(/:\s*([^:]+)$/);
      if (matchColon) clientName = matchColon[1].trim();
      else {
        const matchFat = desc.match(/fatura nr\.\s*\d+\s+(.*)$/i);
        if (matchFat) clientName = matchFat[1].trim();
        else clientName = desc;
      }
      clientName = clientName.toUpperCase().replace(/\s+/g, ' ').trim();
      if (nameAliases[clientName]) clientName = nameAliases[clientName];

      // Casos especiais avulsos
      if (
        clientName.includes('ESTORNO') ||
        clientName.includes('VENDA DE CARTÃO') ||
        clientName.includes('DANIELLA KEIKO') ||
        clientName.includes('SIMONI DE BRIDA')
      ) {
        if (!isDryRun) {
          await prisma.payment.create({
            data: {
              accountId: asaasAccount!.id,
              amount,
              paymentDate: date,
              paymentMethod: PaymentMethod.ASAAS,
              externalId: txId || null,
              description: desc,
              notes: `Recebimento financeiro avulso Asaas (${dataStr})`
            }
          });
        }
        if (txId) existingPaymentTxIds.add(txId);
        unallocatedPaymentsCreated++;
        continue;
      }

      // Localizar pessoa no banco
      const nameParts = clientName.split(' ').filter(p => p.length > 2);
      const matchedPerson = allPersons.find(p => {
        const u = p.fullName.toUpperCase();
        if (u === clientName) return true;
        if (nameParts.length >= 2) return u.includes(nameParts[0]) && u.includes(nameParts[nameParts.length - 1]);
        return u.includes(clientName);
      });

      if (matchedPerson) {
        const allClientInstallments = matchedPerson.contracts.flatMap(c =>
          c.negotiations.flatMap(n =>
            n.installments.map(i => ({ ...i, contract: c }))
          )
        );

        // Checar se já tem pagamento lançado nesta parcela
        const alreadyPaidMatch = allClientInstallments.find(inst =>
          inst.payments.some(p => {
            const dateDiff = Math.abs(p.paymentDate.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
            const valDiff = Math.abs(p.amount - amount);
            return (p.externalId === txId) || (dateDiff <= 5 && valDiff <= 10.0);
          })
        );

        if (alreadyPaidMatch) {
          paymentsSkipped++;
          continue;
        }

        // Buscar parcela em aberto
        const openInstallments = allClientInstallments.filter(i => i.status === 'PENDING' || i.status === 'OVERDUE');
        let targetInstallment: any = null;

        if (openInstallments.length > 0) {
          openInstallments.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
          const exactValMatch = openInstallments.find(i => Math.abs(i.amount - amount) <= 10.0);
          targetInstallment = exactValMatch || openInstallments[0];
        }

        if (targetInstallment) {
          if (!isDryRun) {
            const newPayment = await prisma.payment.create({
              data: {
                installmentId: targetInstallment.id,
                accountId: asaasAccount!.id,
                amount,
                paymentDate: date,
                paymentMethod: PaymentMethod.ASAAS,
                externalId: txId || null,
                description: desc,
                notes: `Baixa via extrato Asaas 23/09/2026. Fatura: ${faturaId || 'N/A'}`
              }
            });

            await prisma.installment.update({
              where: { id: targetInstallment.id },
              data: {
                status: PaymentStatus.PAID,
                paidAmount: amount,
                paidAt: date,
                paymentMethod: PaymentMethod.ASAAS,
                asaasPaymentId: faturaId || txId || targetInstallment.asaasPaymentId
              }
            });

            targetInstallment.status = PaymentStatus.PAID;
            targetInstallment.payments.push(newPayment);
          }

          if (txId) existingPaymentTxIds.add(txId);
          paymentsCreated++;
          installmentsUpdated++;
        } else {
          // Cliente sem parcelas em aberto
          if (!isDryRun) {
            await prisma.payment.create({
              data: {
                accountId: asaasAccount!.id,
                amount,
                paymentDate: date,
                paymentMethod: PaymentMethod.ASAAS,
                externalId: txId || null,
                description: desc,
                notes: `Recebimento de ${matchedPerson.fullName} sem parcelas abertas no momento.`
              }
            });
          }
          if (txId) existingPaymentTxIds.add(txId);
          unallocatedPaymentsCreated++;
        }
      } else {
        // Pessoa não cadastrada
        if (!isDryRun) {
          await prisma.payment.create({
            data: {
              accountId: asaasAccount!.id,
              amount,
              paymentDate: date,
              paymentMethod: PaymentMethod.ASAAS,
              externalId: txId || null,
              description: desc,
              notes: `Recebimento Asaas de cliente não cadastrado (${clientName})`
            }
          });
        }
        if (txId) existingPaymentTxIds.add(txId);
        unallocatedPaymentsCreated++;
      }
    }
  }

  console.log(`\n===============================================================`);
  console.log(`🎉 CONCILIAÇÃO ${isDryRun ? 'SIMULADA' : 'CONCLUÍDA'}!`);
  console.log(`===============================================================`);
  console.log(`📉 Novas Despesas Lançadas (Débitos): ${expensesCreated}`);
  console.log(`💳 Parcelas Baixadas (Créditos vinculados a Lotes/Contratos): ${installmentsUpdated}`);
  console.log(`💰 Pagamentos Avulsos na Conta: ${unallocatedPaymentsCreated}`);
  console.log(`⏭️ Lançamentos Já Existentes / Ignorados: Despesas (${expensesSkipped}) | Receitas (${paymentsSkipped})`);

  return {
    expensesCreated,
    expensesSkipped,
    installmentsUpdated,
    unallocatedPaymentsCreated,
    paymentsSkipped
  };
}

if (require.main === module) {
  const isDryRun = process.argv.includes('--dry-run');
  reconcileExtrato23092026(isDryRun)
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}

