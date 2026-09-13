import { PrismaClient } from '@prisma/client';
import * as xlsx from 'xlsx';
import * as path from 'path';

const prisma = new PrismaClient();

async function run() {
  const filePath = path.resolve(__dirname, '../../uploads/documents/Extrato_10-09-2026.xlsx');
  const wb = xlsx.readFile(filePath, { cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawRows: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // Map de Clientes de Crédito
  interface ClientCredit {
    clientName: string;
    totalAmount: number;
    transactions: Array<{
      date: string;
      amount: number;
      txId: string;
      faturaId: string;
      parcelamentoId: string;
      desc: string;
    }>;
  }

  const clientCredits = new Map<string, ClientCredit>();
  const debitsList: Array<{
    date: string;
    amount: number;
    type: string;
    desc: string;
  }> = [];

  for (let r = 3; r < rawRows.length; r++) {
    const row = rawRows[r];
    const dataStr = String(row[0] || '').trim();
    if (!dataStr || dataStr.startsWith('Período') || dataStr.startsWith('Saldo') || dataStr.startsWith('Data')) continue;

    const txId = String(row[1] || '').trim();
    const type = String(row[2] || '').trim();
    const desc = String(row[4] || '').trim();
    const value = typeof row[5] === 'number' ? row[5] : parseFloat(String(row[5] || '0').replace(',', '.'));
    const parcelamentoId = String(row[7] || '').trim();
    const faturaId = String(row[8] || '').trim();

    if (value > 0) {
      let clientName = '';
      const matchColon = desc.match(/:\s*([^:]+)$/);
      if (matchColon) {
        clientName = matchColon[1].trim();
      } else {
        const matchFat = desc.match(/fatura nr\.\s*\d+\s+(.*)$/i);
        if (matchFat) clientName = matchFat[1].trim();
        else clientName = desc;
      }

      // Normaliza nome
      clientName = clientName.toUpperCase().replace(/\s+/g, ' ').trim();

      const existing = clientCredits.get(clientName) || {
        clientName,
        totalAmount: 0,
        transactions: [],
      };
      existing.totalAmount += value;
      existing.transactions.push({
        date: dataStr,
        amount: value,
        txId,
        faturaId,
        parcelamentoId,
        desc,
      });
      clientCredits.set(clientName, existing);
    } else if (value < 0) {
      debitsList.push({
        date: dataStr,
        amount: value,
        type,
        desc,
      });
    }
  }

  console.log('===============================================================');
  console.log(`TOTAL DE CLIENTES DISTINTOS COM RECEBIMENTOS: ${clientCredits.size}`);
  console.log('===============================================================');

  const allPeople = await prisma.person.findMany({
    include: {
      occupancies: {
        include: { lot: { include: { block: true, project: true } } },
      },
      contracts: {
        include: {
          lot: { include: { block: true, project: true } },
          negotiations: { include: { installments: { include: { payments: true } } } },
        },
      },
    },
  });

  const knownClients: any[] = [];
  const unknownClients: any[] = [];

  for (const [name, data] of clientCredits.entries()) {
    // Procura pessoa no banco
    const nameParts = name.split(' ').filter(p => p.length > 2);
    const matchedPerson = allPeople.find(p => {
      const pUpper = p.fullName.toUpperCase();
      if (pUpper === name) return true;
      // Match first and last name
      if (nameParts.length >= 2) {
        return pUpper.includes(nameParts[0]) && pUpper.includes(nameParts[nameParts.length - 1]);
      }
      return pUpper.includes(name);
    });

    if (matchedPerson) {
      knownClients.push({
        name,
        totalReceived: data.totalAmount,
        txCount: data.transactions.length,
        transactions: data.transactions,
        person: matchedPerson,
      });
    } else {
      unknownClients.push({
        name,
        totalReceived: data.totalAmount,
        txCount: data.transactions.length,
        transactions: data.transactions,
      });
    }
  }

  console.log(`\n✅ CLIENTES JÁ CADASTRADOS NO SISTEMA: ${knownClients.length}`);
  for (const kc of knownClients) {
    const lots = kc.person.occupancies.map((o: any) => `${o.lot.project.name} (Qd ${o.lot.block.number}, Lt ${o.lot.number})`).join('; ') || 'Sem lote vinculado';
    const contracts = kc.person.contracts.map((c: any) => c.contractNumber).join(', ') || 'Sem contrato';
    console.log(`\n👤 ${kc.name}`);
    console.log(`   Total Recebido no Extrato: R$ ${kc.totalReceived.toFixed(2)} (${kc.txCount} transações)`);
    console.log(`   Cadastro no Banco: ${kc.person.fullName} (CPF: ${kc.person.cpf || 'Sem CPF'})`);
    console.log(`   Lote(s) Vinculado(s): ${lots}`);
    console.log(`   Contrato(s): ${contracts}`);
    kc.transactions.forEach((tx: any) => {
      console.log(`     - [${tx.date}] R$ ${tx.amount.toFixed(2)} | Fatura: ${tx.faturaId} | Parc: ${tx.parcelamentoId}`);
    });
  }

  console.log('\n===============================================================');
  console.log(`⚠️ CLIENTES NÃO ENCONTRADOS NO BANCO DE DADOS: ${unknownClients.length}`);
  console.log('===============================================================');
  for (const uc of unknownClients) {
    console.log(`\n❓ ${uc.name}`);
    console.log(`   Total no Extrato: R$ ${uc.totalReceived.toFixed(2)} (${uc.txCount} transações)`);
    uc.transactions.forEach((tx: any) => {
      console.log(`     - [${tx.date}] R$ ${tx.amount.toFixed(2)} | Fatura: ${tx.faturaId} | Parc: ${tx.parcelamentoId}`);
    });
  }

  // Resumo de despesas
  console.log('\n===============================================================');
  console.log(`📉 TOTAL DE DÉBITOS (DESPESAS): ${debitsList.length}`);
  console.log('===============================================================');
  const sumDebits = debitsList.reduce((s, d) => s + d.amount, 0);
  console.log(`Valor Total Débitos: R$ ${sumDebits.toFixed(2)}`);

  const debitsByType = new Map<string, { count: number; total: number }>();
  debitsList.forEach(d => {
    const cur = debitsByType.get(d.type) || { count: 0, total: 0 };
    cur.count++;
    cur.total += d.amount;
    debitsByType.set(d.type, cur);
  });

  for (const [t, st] of debitsByType.entries()) {
    console.log(`  - ${t}: ${st.count} | R$ ${st.total.toFixed(2)}`);
  }
}

run().finally(() => prisma.$disconnect());
