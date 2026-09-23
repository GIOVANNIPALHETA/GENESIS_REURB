import { PrismaClient } from '@prisma/client';
import * as xlsx from 'xlsx';

const prisma = new PrismaClient();

function parseDate(dateStr: string): Date {
  const [d, m, y] = dateStr.trim().split('/').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

async function analyze() {
  const filePath = 'c:/Users/Giovanni/Documents/05-Aplicativo_Desenvolvimento/GENESIS_REURB/uploads/documents/FINANCEIRO/de01062026a23092026.xlsx';
  const wb = xlsx.readFile(filePath, { cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawRows: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  const existingExpenses = await prisma.expense.findMany({ select: { transactionId: true, amount: true, expenseDate: true } });
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

  let totalRows = 0;
  let skippedExpenses = 0;
  let skippedPayments = 0;

  const toCreateExpenses: any[] = [];
  const toCreatePayments: any[] = [];

  for (let r = 3; r < rawRows.length; r++) {
    const row = rawRows[r];
    const dataStr = String(row[0] || '').trim();
    if (!dataStr || dataStr.startsWith('Período') || dataStr.startsWith('Saldo') || dataStr.startsWith('Data')) continue;

    const txId = String(row[1] || '').trim();
    const type = String(row[2] || '').trim();
    const desc = String(row[4] || '').trim();
    const rawVal = typeof row[5] === 'number' ? row[5] : parseFloat(String(row[5] || '0').replace(',', '.'));
    const faturaId = String(row[8] || '').trim();

    totalRows++;

    if (rawVal < 0) {
      const amount = Math.abs(rawVal);
      // Checa duplicidade por txId
      if (txId && existingExpenseTxIds.has(txId)) {
        skippedExpenses++;
        continue;
      }
      toCreateExpenses.push({ data: dataStr, txId, type, desc, valor: amount });
    } else if (rawVal > 0) {
      const amount = rawVal;
      const date = parseDate(dataStr);

      // Checa duplicidade por txId
      if (txId && existingPaymentTxIds.has(txId)) {
        skippedPayments++;
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
        toCreatePayments.push({
          data: dataStr,
          txId,
          desc,
          clientName,
          valor: amount,
          faturaId,
          type: 'AVULSO_DIRETO',
          personName: null,
          targetInstallment: null
        });
        continue;
      }

      // Localizar pessoa no banco
      const nameParts = clientName.split(' ').filter(p => p.length > 2);
      const matched = allPersons.find(p => {
        const u = p.fullName.toUpperCase();
        if (u === clientName) return true;
        if (nameParts.length >= 2) return u.includes(nameParts[0]) && u.includes(nameParts[nameParts.length - 1]);
        return u.includes(clientName);
      });

      if (matched) {
        const allClientInstallments = matched.contracts.flatMap(c =>
          c.negotiations.flatMap(n =>
            n.installments.map(i => ({ ...i, contract: c }))
          )
        );

        // Verificar se já existe pagamento para esta parcela (mesma data aprox e mesmo valor)
        const alreadyPaidMatch = allClientInstallments.find(inst =>
          inst.payments.some(p => {
            const dateDiff = Math.abs(p.paymentDate.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
            const valDiff = Math.abs(p.amount - amount);
            return (p.externalId === txId) || (dateDiff <= 5 && valDiff <= 10.0);
          })
        );

        if (alreadyPaidMatch) {
          skippedPayments++;
          continue;
        }

        // Buscar parcela em aberto
        const openInstallments = allClientInstallments.filter(i => i.status === 'PENDING' || i.status === 'OVERDUE');
        let targetInst: any = null;
        if (openInstallments.length > 0) {
          openInstallments.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
          const exactValMatch = openInstallments.find(i => Math.abs(i.amount - amount) <= 10.0);
          targetInst = exactValMatch || openInstallments[0];
        }

        toCreatePayments.push({
          data: dataStr,
          txId,
          desc,
          clientName,
          valor: amount,
          faturaId,
          type: targetInst ? 'BAIXA_PARCELA' : 'AVULSO_CLIENTE_SEM_PARCELA_ABERTA',
          personName: matched.fullName,
          lotInfo: matched.contracts[0]?.lot ? `Q${matched.contracts[0].lot.block.number}-L${matched.contracts[0].lot.number}` : 'S/L',
          targetInstallment: targetInst ? `Parc. #${targetInst.installmentNumber} (Venc: ${targetInst.dueDate.toISOString().slice(0, 10)})` : null
        });
      } else {
        toCreatePayments.push({
          data: dataStr,
          txId,
          desc,
          clientName,
          valor: amount,
          faturaId,
          type: 'AVULSO_NAO_CADASTRADO',
          personName: null,
          targetInstallment: null
        });
      }
    }
  }

  console.log('================================================================');
  console.log('📊 AUDITORIA DO NOVO EXTRATO FINANCEIRO (de01062026a23092026.xlsx)');
  console.log('================================================================');
  console.log(`Período analisado: 01/06/2026 a 23/09/2026 (Hoje)`);
  console.log(`Total de lançamentos no arquivo: ${totalRows}`);
  console.log(`Lançamentos já existentes no banco (ignorados):`);
  console.log(`  - Débitos (Despesas) já existentes: ${skippedExpenses}`);
  console.log(`  - Créditos (Pagamentos) já existentes: ${skippedPayments}`);
  console.log(`----------------------------------------------------------------`);
  console.log(`NOVOS LANÇAMENTOS A INSERIR NO BANCO:`);
  console.log(`  - Novas Despesas / Taxas (Débitos): ${toCreateExpenses.length} lançamentos`);
  console.log(`  - Novos Recebimentos (Créditos): ${toCreatePayments.length} lançamentos`);

  const totExp = toCreateExpenses.reduce((s, e) => s + e.valor, 0);
  const totPay = toCreatePayments.reduce((s, p) => s + p.valor, 0);
  console.log(`  - Valor total novas Despesas: R$ ${totExp.toFixed(2)}`);
  console.log(`  - Valor total novos Pagamentos: R$ ${totPay.toFixed(2)}`);

  console.log('\n--- 1. NOVAS DESPESAS / DÉBITOS DETALHADOS ---');
  const expByType: Record<string, { count: number; total: number }> = {};
  toCreateExpenses.forEach(e => {
    if (!expByType[e.type]) expByType[e.type] = { count: 0, total: 0 };
    expByType[e.type].count++;
    expByType[e.type].total += e.valor;
  });
  for (const [t, d] of Object.entries(expByType)) {
    console.log(`  • ${t}: ${d.count} lançamentos | R$ ${d.total.toFixed(2)}`);
  }

  const pixExp = toCreateExpenses.filter(e => e.type.includes('Pix'));
  if (pixExp.length > 0) {
    console.log('\n    * Detalhe das Transferências Pix de saída:');
    pixExp.forEach(e => {
      console.log(`      - [${e.data}] R$ ${e.valor.toFixed(2)} (Tx: ${e.txId}) -> ${e.desc}`);
    });
  }

  console.log('\n--- 2. NOVOS RECEBIMENTOS / CRÉDITOS DETALHADOS ---');
  toCreatePayments.forEach(p => {
    if (p.type === 'BAIXA_PARCELA') {
      console.log(`  ✅ [${p.data}] R$ ${p.valor.toFixed(2)} | ${p.clientName} (${p.lotInfo}) -> Baixar ${p.targetInstallment} | Fatura: ${p.faturaId} | Tx: ${p.txId}`);
    } else if (p.type === 'AVULSO_CLIENTE_SEM_PARCELA_ABERTA') {
      console.log(`  ℹ️ [${p.data}] R$ ${p.valor.toFixed(2)} | ${p.clientName} (${p.lotInfo}) -> Todas as parcelas já estavam quitadas (Pagamento avulso em conta) | Tx: ${p.txId}`);
    } else {
      console.log(`  ⚠️ [${p.data}] R$ ${p.valor.toFixed(2)} | ${p.clientName} -> Cliente não cadastrado (Pagamento avulso em conta) | Tx: ${p.txId}`);
    }
  });
}

analyze().catch(console.error).finally(() => prisma.$disconnect());

