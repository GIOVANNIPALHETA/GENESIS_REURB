import 'dotenv/config';
import path from 'path';
import XLSX from 'xlsx';
import { ExpenseStatus, PaymentMethod, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const filePath = path.resolve(process.cwd(), '../uploads/documents/Transferencias_01.xlsx');

function parseDate(val: any): Date {
  if (!val) return new Date();
  if (val instanceof Date && !isNaN(val.getTime())) return val;
  const str = String(val).trim();
  const parts = str.split('/');
  if (parts.length === 3) {
    return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]), 12, 0, 0);
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? new Date() : d;
}

function parseMoney(val: any): number {
  if (typeof val === 'number') return val;
  const str = String(val || '')
    .replace('R$', '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim();
  return Number(str) || 0;
}

async function importTransferencias() {
  console.log('🚀 Iniciando importação de Transferencias_01.xlsx...');

  const wb = XLSX.readFile(filePath, { cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // 1. Obter Conta Asaas
  const asaasAccount = await prisma.financialAccount.findFirst({
    where: { name: { contains: 'Asaas', mode: 'insensitive' } },
  });

  if (!asaasAccount) {
    throw new Error('Conta Asaas não encontrada no sistema!');
  }

  // 2. Obter Usuário Admin
  const adminUser = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
  });

  if (!adminUser) {
    throw new Error('Usuário administrador não encontrado!');
  }

  // 3. Obter ou Criar Tipos de Despesas
  const types = await prisma.expenseType.findMany();
  const getType = (name: string) => types.find((t) => t.name.toLowerCase().includes(name.toLowerCase()));

  const profitType = getType('Retirada de lucros') || types[0];
  const assessoriaType = getType('Assessoria') || types[0];
  const outrosType = getType('Outros') || types[0];

  // 4. Cadastrar Sócios/Beneficiários que aparecem nas transferências
  const socios = [
    { name: 'Clodoaldo Neves de Oliveira', short: 'Clodoaldo Neves', type: 'INDIVIDUAL', defaultPercentage: 33.33 },
    { name: 'Robertson Ruas Baganha', short: 'Baganha', type: 'INDIVIDUAL', defaultPercentage: 33.33 },
    { name: 'Adriano Aguiar da Silva', short: 'Adriano', type: 'INDIVIDUAL', defaultPercentage: 0 },
    { name: 'DIEGO BARROS CUNHA', short: 'Diego', type: 'INDIVIDUAL', defaultPercentage: 0 },
  ];

  for (const s of socios) {
    const existing = await prisma.profitBeneficiary.findFirst({
      where: { name: { contains: s.short, mode: 'insensitive' } },
    });
    if (!existing) {
      await prisma.profitBeneficiary.create({
        data: {
          name: s.short,
          type: s.type,
          defaultPercentage: s.defaultPercentage,
          notes: `Cadastrado via importação de transferências`,
        },
      });
      console.log(`  ✓ Novo Beneficiário cadastrado: ${s.short}`);
    }
  }

  const allBeneficiaries = await prisma.profitBeneficiary.findMany();

  let importedExpenses = 0;
  let importedWithdrawals = 0;

  // Percorrer linhas da planilha (linha 1 é cabeçalho)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const dataSolicitacao = row[0];
    const dataTransf = row[2] || dataSolicitacao;
    const nomeFavorecido = String(row[3] || '').trim();
    const docFavorecido = String(row[4] || '').trim();
    const banco = String(row[5] || '').trim();
    const valorStr = row[6];
    const situacao = String(row[7] || '').trim().toLowerCase();

    if (!nomeFavorecido) continue;

    const valor = parseMoney(valorStr);
    const expenseDate = parseDate(dataTransf);
    const status = situacao.includes('falhou') ? ExpenseStatus.CANCELED : ExpenseStatus.PAID;

    // Verificar se é retirada de sócio
    const isClodoaldo = /clodoaldo/i.test(nomeFavorecido);
    const isBaganha = /baganha|robertson/i.test(nomeFavorecido);
    const isAdriano = /adriano/i.test(nomeFavorecido);
    const isDiego = /diego/i.test(nomeFavorecido);

    const isSocio = isClodoaldo || isBaganha || isAdriano || isDiego;

    let targetType = outrosType;
    let description = `Transferência Pix - ${nomeFavorecido}`;

    if (isSocio) {
      targetType = profitType;
      description = `Retirada de lucros - ${nomeFavorecido}`;
    } else if (/energisa/i.test(nomeFavorecido)) {
      description = `Energia Elétrica - Energisa MT`;
    } else if (/cinthya|mauricio|bruno|cleuza|marcos|ediney/i.test(nomeFavorecido)) {
      targetType = assessoriaType;
      description = `Prestação de Serviços / Assessoria - ${nomeFavorecido}`;
    }

    // Criar o registro de Despesa
    const expense = await prisma.expense.create({
      data: {
        expenseTypeId: targetType.id,
        accountId: asaasAccount.id,
        userId: adminUser.id,
        beneficiary: nomeFavorecido,
        description,
        amount: valor,
        expenseDate,
        status,
        paymentMethod: PaymentMethod.PIX,
        transactionId: `TRANSF-PIX-${i}`,
        notes: `Banco destino: ${banco} | Doc: ${docFavorecido} | Situação Asaas: ${row[7]}`,
        isRecurring: false,
      },
    });
    importedExpenses++;

    // Se for sócio e a transferência foi efetuada, registra também na Divisão de Lucros
    if (isSocio && status === ExpenseStatus.PAID) {
      let ben = allBeneficiaries.find((b) => {
        if (isClodoaldo) return /clodoaldo/i.test(b.name);
        if (isBaganha) return /baganha/i.test(b.name);
        if (isAdriano) return /adriano/i.test(b.name);
        if (isDiego) return /diego/i.test(b.name);
        return false;
      });

      if (ben) {
        await prisma.profitWithdrawal.create({
          data: {
            beneficiaryId: ben.id,
            accountId: asaasAccount.id,
            userId: adminUser.id,
            amount: valor,
            withdrawalDate: expenseDate,
            paymentMethod: PaymentMethod.PIX,
            notes: `Transferência bancária Asaas - ${banco}`,
          },
        });
        importedWithdrawals++;
      }
    }

    console.log(`  ✓ [Linha ${i + 1}] ${description} | R$ ${valor.toFixed(2)} | ${status}`);
  }

  console.log(`\n🎉 Importação concluída com sucesso!`);
  console.log(`  • Despesas importadas: ${importedExpenses}`);
  console.log(`  • Retiradas de lucros registradas para sócios: ${importedWithdrawals}`);
}

importTransferencias()
  .catch((e) => console.error('Erro na importação:', e))
  .finally(() => prisma.$disconnect());
