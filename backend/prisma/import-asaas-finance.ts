import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import {
  FinancialAccountType,
  PaymentMethod,
  PaymentStatus,
  PrismaClient,
  LotStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

const defaultFile = path.resolve(
  process.cwd(),
  '../uploads/documents/FINANCEIRO/5203dbbd-0c87-409e-8b73-c37d9663368a.xlsx'
);

const targetFile =
  process.argv.find((arg) => arg.endsWith('.xlsx')) ||
  (fs.existsSync(defaultFile)
    ? defaultFile
    : path.resolve(
        process.cwd(),
        'uploads/documents/FINANCEIRO/5203dbbd-0c87-409e-8b73-c37d9663368a.xlsx'
      ));

const confirm = process.argv.includes('--confirm');

interface AsaasBillItem {
  id: string;
  cpf: string;
  dueDate: Date;
  amount: number;
  parcelStr: string;
  parcelNumber: number;
  totalParcels: number;
  isEntrada: boolean;
  bank: string;
  paymentMethodStr: string;
  method: PaymentMethod;
  accountId: string;
  projectStr: string;
  situation: string;
  status: PaymentStatus;
  notes: string;
  blockNumber?: string;
  lotNumber?: string;
}

interface AsaasClientBlock {
  clientName: string;
  cpf: string;
  city?: string;
  state?: string;
  items: AsaasBillItem[];
}

function cleanCpf(val: unknown): string {
  return String(val || '').replace(/\D/g, '');
}

function parseMoney(val: unknown): number {
  if (typeof val === 'number') return val;
  const str = String(val || '')
    .replace(/R\$\s?/gi, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');
  return str ? Number(str) || 0 : 0;
}

function parseDate(val: unknown): Date {
  if (val instanceof Date && !isNaN(val.getTime())) return val;
  if (typeof val === 'number') return new Date(Date.UTC(1899, 11, 30 + val));
  const str = String(val || '').trim();
  const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 12);
  }
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

function mapPaymentMethod(bank: string, methodStr: string): { method: PaymentMethod; accountId: string } {
  const norm = `${bank} ${methodStr}`.toUpperCase();
  if (norm.includes('CAIXA INTERNO') || norm.includes('DINHEIRO') || norm.includes('CAIXA DA EMPRESA')) {
    return { method: PaymentMethod.CASH, accountId: 'account-cash' };
  }
  if (norm.includes('MERCADO PAGO') || norm.includes('MERCADOPAGO')) {
    return { method: PaymentMethod.MERCADO_PAGO, accountId: 'account-mercado-pago' };
  }
  // No Asaas, todo boleto pago por PIX ou Boleto entra na Conta Asaas
  if (norm.includes('ASAAS') || norm.includes('BOLETO') || norm.includes('PIX')) {
    return { method: PaymentMethod.ASAAS, accountId: 'account-asaas' };
  }
  return { method: PaymentMethod.ASAAS, accountId: 'account-asaas' };
}

function mapStatus(situation: string, dueDate: Date): PaymentStatus {
  const norm = situation.trim().toUpperCase();
  if (norm.includes('RECEBIDO') || norm.includes('PAGO') || norm.includes('LIQUIDADO')) {
    return PaymentStatus.PAID;
  }
  if (norm.includes('CANCEL')) {
    return PaymentStatus.CANCELED;
  }
  if (norm.includes('VENCIDO')) {
    return PaymentStatus.OVERDUE;
  }
  return PaymentStatus.PENDING;
}

function parseWorkbook(filePath: string): AsaasClientBlock[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo não encontrado: ${filePath}`);
  }

  const wb = XLSX.readFile(filePath, { cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  const clientBlocks: AsaasClientBlock[] = [];
  let currentBlock: AsaasClientBlock | null = null;
  let lastItem: AsaasBillItem | null = null;

  for (let r = 0; r < rawRows.length; r++) {
    const row = rawRows[r];

    // Check for client header: "Cliente:" or "Nome Fantasia:"
    const clientCellIdx = row.findIndex((c) => String(c).trim() === 'Cliente:');
    if (clientCellIdx >= 0) {
      const clientName = String(row[clientCellIdx + 5] || row[clientCellIdx + 1] || '').trim();
      if (clientName) {
        currentBlock = {
          clientName,
          cpf: '',
          items: [],
        };
        clientBlocks.push(currentBlock);
      }
    }

    // Check if row is an Observation row following an item
    if (row[0] && String(row[0]).trim().startsWith('Observações:')) {
      const obsText = String(row[0]).replace(/^Observações:\s*/i, '').trim();
      if (lastItem) {
        lastItem.notes = obsText;
        // Try to extract QD-XX and LT-XX
        const qdMatch = obsText.match(/QD[- ]*(\d+|[A-Za-z]+)/i);
        const ltMatch = obsText.match(/LT[- ]*(\d+)/i) || obsText.match(/LOTE[- ]*(\d+)/i);
        if (qdMatch) {
          lastItem.blockNumber = qdMatch[1].replace(/^0+/, ''); // '01' -> '1'
        }
        if (ltMatch) {
          lastItem.lotNumber = ltMatch[1].replace(/^0+/, ''); // '09' -> '9'
        }
      }
      continue;
    }

    // Check for data row starting with a numeric ID
    const firstCell = row[0];
    const isId =
      (typeof firstCell === 'number' && firstCell > 1000) ||
      (typeof firstCell === 'string' && /^\d{5,}$/.test(firstCell.trim()));

    if (isId && currentBlock) {
      const id = String(firstCell).trim();
      
      // Look for CPF in columns
      const cpfCell = row.find((c) => /\d{3}\.\d{3}\.\d{3}-\d{2}/.test(String(c))) || '';
      const cpf = cleanCpf(cpfCell);
      if (cpf && !currentBlock.cpf) {
        currentBlock.cpf = cpf;
      }

      // Look for Vencimento Date
      const dateCell = row.find((c) => c instanceof Date || /\d{4}-\d{2}-\d{2}/.test(String(c)) || /\d{2}\/\d{2}\/\d{4}/.test(String(c)));
      const dueDate = parseDate(dateCell);

      // Look for Valor a Receber (starts with R$ or numeric > 0)
      const moneyCell = row.find((c) => /R\$\s?[\d.,]+/i.test(String(c))) || row[20] || row[19] || 0;
      const amount = parseMoney(moneyCell);

      // Look for Parc (e.g. "1/1", "1 / 10", "2/10")
      const parcCell = row.find((c) => /^\d+\s*[\/]\s*\d+$/.test(String(c).trim())) || '1/1';
      const parcMatch = String(parcCell).trim().match(/^(\d+)\s*[\/]\s*(\d+)$/);
      const parcelNumber = parcMatch ? Number(parcMatch[1]) : 1;
      const totalParcels = parcMatch ? Number(parcMatch[2]) : 1;
      const isEntrada = totalParcels === 1 || parcelNumber === 0;

      // Look for Banco / Forma Pag / Situação
      const bankCell = row.find((c) => /CAIXA|ASAAS|MERCADO|BANCO/i.test(String(c))) || 'ASAAS';
      const methodCell = row.find((c) => /DINHEIRO|BOLETO|PIX|CART/i.test(String(c))) || '';
      const situationCell = row.find((c) => /Recebidos|A Receber|Vencid|Cancel/i.test(String(c))) || 'A Receber';
      const projectCell = row.find((c) => /VILA NOVA|ARIPUAN/i.test(String(c))) || 'Vila Nova Aripuanã';

      const { method, accountId } = mapPaymentMethod(String(bankCell), String(methodCell));
      const status = mapStatus(String(situationCell), dueDate);

      const item: AsaasBillItem = {
        id,
        cpf: cpf || currentBlock.cpf,
        dueDate,
        amount,
        parcelStr: String(parcCell).trim(),
        parcelNumber: isEntrada ? 0 : parcelNumber,
        totalParcels: isEntrada ? 0 : totalParcels,
        isEntrada,
        bank: String(bankCell).trim(),
        paymentMethodStr: String(methodCell).trim(),
        method,
        accountId,
        projectStr: String(projectCell).trim(),
        situation: String(situationCell).trim(),
        status,
        notes: '',
      };

      currentBlock.items.push(item);
      lastItem = item;
    }
  }

  return clientBlocks;
}

async function main() {
  console.log(`[Import Asaas] Lendo arquivo: ${targetFile}`);
  const blocks = parseWorkbook(targetFile);

  console.log(`[Import Asaas] Total de clientes identificados no relatório: ${blocks.length}`);
  let totalItems = 0;
  let totalPaid = 0;
  let totalAmount = 0;

  for (const block of blocks) {
    totalItems += block.items.length;
    const clientAmount = block.items.reduce((s, i) => s + i.amount, 0);
    const clientPaid = block.items.filter((i) => i.status === PaymentStatus.PAID).reduce((s, i) => s + i.amount, 0);
    totalAmount += clientAmount;
    totalPaid += clientPaid;

    console.log(`\nCliente: ${block.clientName} (CPF: ${block.cpf || 'Não identificado'})`);
    console.log(`  Itens: ${block.items.length} contas`);
    console.log(`  Total: R$ ${clientAmount.toFixed(2)} | Recebido: R$ ${clientPaid.toFixed(2)} | Saldo: R$ ${(clientAmount - clientPaid).toFixed(2)}`);
    block.items.forEach((item) => {
      console.log(`    - ID ${item.id} | ${item.isEntrada ? 'Entrada' : `Parc ${item.parcelNumber}/${item.totalParcels}`} | Venc: ${item.dueDate.toLocaleDateString('pt-BR')} | R$ ${item.amount.toFixed(2)} | ${item.status} (${item.bank}) | Obs: ${item.notes}`);
    });
  }

  console.log(`\n================ RESUMO ================`);
  console.log(`Total geral de contas: ${totalItems}`);
  console.log(`Valor total a receber: R$ ${totalAmount.toFixed(2)}`);
  console.log(`Valor já recebido:     R$ ${totalPaid.toFixed(2)}`);
  console.log(`Dry-run: ${!confirm ? 'SIM (use --confirm para gravar no banco)' : 'NÃO (GRAVANDO NO BANCO)'}`);

  if (!confirm) {
    console.log(`\n💡 Para executar e persistir no banco, execute com a flag --confirm.`);
    return;
  }

  // Ensure default financial accounts exist
  await prisma.financialAccount.upsert({
    where: { id: 'account-cash' },
    update: { name: 'Dinheiro', type: FinancialAccountType.CASH, active: true },
    create: { id: 'account-cash', name: 'Dinheiro', type: FinancialAccountType.CASH },
  });
  await prisma.financialAccount.upsert({
    where: { id: 'account-asaas' },
    update: { name: 'Asaas', type: FinancialAccountType.ASAAS, active: true },
    create: { id: 'account-asaas', name: 'Asaas', type: FinancialAccountType.ASAAS },
  });
  await prisma.financialAccount.upsert({
    where: { id: 'account-mercado-pago' },
    update: { name: 'Mercado Pago', type: FinancialAccountType.MERCADO_PAGO, active: true },
    create: { id: 'account-mercado-pago', name: 'Mercado Pago', type: FinancialAccountType.MERCADO_PAGO },
  });

  // Process each client block
  for (const block of blocks) {
    // 1. Find Person
    let person = null;
    if (block.cpf) {
      person = await prisma.person.findFirst({
        where: { cpf: { contains: block.cpf } },
        include: {
          occupancies: {
            include: {
              lot: {
                include: { block: true, project: true },
              },
            },
          },
          contracts: {
            include: {
              negotiations: {
                include: { installments: true },
              },
            },
          },
        },
      });
    }

    if (!person) {
      person = await prisma.person.findFirst({
        where: { fullName: { equals: block.clientName, mode: 'insensitive' } },
        include: {
          occupancies: {
            include: {
              lot: {
                include: { block: true, project: true },
              },
            },
          },
          contracts: {
            include: {
              negotiations: {
                include: { installments: true },
              },
            },
          },
        },
      });
    }

    if (!person) {
      console.warn(`⚠️ Pessoa não encontrada para ${block.clientName} (${block.cpf}). Criando cadastro...`);
      person = await prisma.person.create({
        data: {
          fullName: block.clientName,
          cpf: block.cpf || null,
        },
        include: {
          occupancies: {
            include: {
              lot: {
                include: { block: true, project: true },
              },
            },
          },
          contracts: {
            include: {
              negotiations: {
                include: { installments: true },
              },
            },
          },
        },
      });
    }

    // 2. Identify Lot & Contract
    const itemWithLot = block.items.find((i) => i.blockNumber && i.lotNumber);
    let targetLot: any = null;

    if (itemWithLot && itemWithLot.blockNumber && itemWithLot.lotNumber) {
      targetLot = await prisma.lot.findFirst({
        where: {
          number: { in: [itemWithLot.lotNumber, `0${itemWithLot.lotNumber}`] },
          block: {
            number: { in: [itemWithLot.blockNumber, `0${itemWithLot.blockNumber}`] },
          },
        },
        include: { block: true, project: true },
      });
    }

    if (!targetLot && person.occupancies.length > 0) {
      targetLot = person.occupancies[0].lot;
    }

    // Find or create Contract
    let contract: any = person.contracts.find((c) => (targetLot ? c.lotId === targetLot.id : true));

    if (!contract) {
      if (!targetLot) {
        console.warn(`⚠️ Não foi possível determinar o lote para ${block.clientName}. O lançamento financeiro será ignorado para evitar vínculos indevidos.`);
        continue;
      }

      const contractNumber = `CTR-${targetLot.block.number}-${targetLot.number}-${Date.now().toString().slice(-4)}`;
      contract = await prisma.contract.create({
        data: {
          personId: person.id,
          lotId: targetLot.id,
          projectId: targetLot.projectId,
          contractNumber,
          signed: true,
          signedAt: new Date(),
          status: 'ACTIVE',
          totalValue: block.items.reduce((s, i) => s + i.amount, 0),
          notes: `Importado de Contas a Receber Asaas`,
        },
        include: {
          negotiations: {
            include: { installments: true },
          },
        },
      });
    }

    if (!contract) {
      console.error(`❌ Não foi possível encontrar contrato para ${block.clientName}. Pulando.`);
      continue;
    }

    // Calculate totals for Negotiation
    const entradaItems = block.items.filter((i) => i.isEntrada);
    const parcelItems = block.items.filter((i) => !i.isEntrada);
    const downPayment = entradaItems.reduce((s, i) => s + i.amount, 0);
    const financedAmount = parcelItems.reduce((s, i) => s + i.amount, 0);
    const totalValue = downPayment + financedAmount;
    const installmentCount = parcelItems.length || 1;

    // Update contract totalValue
    await prisma.contract.update({
      where: { id: contract.id },
      data: {
        totalValue,
        signed: true,
      },
    });

    // Find or create Negotiation
    let negotiation = contract.negotiations[0];
    if (!negotiation) {
      negotiation = await prisma.negotiation.create({
        data: {
          contractId: contract.id,
          totalValue,
          downPayment,
          financedAmount,
          installmentCount,
          status: 'ACTIVE',
          firstDueDate: parcelItems[0]?.dueDate || new Date(),
        },
        include: { installments: true },
      });
    } else {
      negotiation = await prisma.negotiation.update({
        where: { id: negotiation.id },
        data: {
          totalValue,
          downPayment,
          financedAmount,
          installmentCount,
          status: 'ACTIVE',
        },
        include: { installments: true },
      });
    }

    // Process installments and payments
    for (const item of block.items) {
      let installment = await prisma.installment.findFirst({
        where: {
          OR: [
            { asaasPaymentId: item.id },
            {
              negotiationId: negotiation.id,
              installmentNumber: item.parcelNumber,
            },
          ],
        },
      });

      const isPaid = item.status === PaymentStatus.PAID;
      const paidAmount = isPaid ? item.amount : 0;
      const paidAt = isPaid ? item.dueDate : null;
      const description = item.isEntrada
        ? 'Entrada'
        : `Parcela ${item.parcelNumber} de ${item.totalParcels || installmentCount}`;

      if (!installment) {
        installment = await prisma.installment.create({
          data: {
            negotiationId: negotiation.id,
            installmentNumber: item.parcelNumber,
            description,
            amount: item.amount,
            dueDate: item.dueDate,
            paidAmount,
            paidAt,
            paymentMethod: item.method,
            status: item.status,
            asaasPaymentId: item.id,
          },
        });
      } else {
        installment = await prisma.installment.update({
          where: { id: installment.id },
          data: {
            amount: item.amount,
            dueDate: item.dueDate,
            paidAmount,
            paidAt,
            paymentMethod: item.method,
            status: item.status,
            asaasPaymentId: item.id,
            description,
          },
        });
      }

      // If PAID, create or update Payment record
      if (isPaid) {
        const existingPayment = await prisma.payment.findFirst({
          where: {
            OR: [
              { installmentId: installment.id },
              { externalId: item.id },
            ],
          },
        });

        if (!existingPayment) {
          await prisma.payment.create({
            data: {
              installmentId: installment.id,
              accountId: item.accountId,
              amount: item.amount,
              paymentDate: item.dueDate,
              paymentMethod: item.method,
              externalId: item.id,
              notes: item.notes || `Recebido via ${item.bank}`,
            },
          });
        }
      }
    }

    console.log(`✅ Cliente ${block.clientName} processado com sucesso! Contrato: ${contract.contractNumber}, ${block.items.length} parcelas sincronizadas.`);
  }

  console.log(`\n🎉 Importação financeira concluída com sucesso!`);
}

main()
  .catch((err) => {
    console.error('❌ Erro na importação:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
