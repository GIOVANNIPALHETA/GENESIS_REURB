import XLSX from 'xlsx';
import {
  FinancialAccountType,
  PaymentMethod,
  PaymentStatus,
} from '@prisma/client';
import { prisma } from '../prisma/client';

export interface AsaasBillItem {
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

export interface AsaasClientBlock {
  clientName: string;
  cpf: string;
  city?: string;
  state?: string;
  items: AsaasBillItem[];
}

export interface SyncRecordLog {
  asaasId: string;
  clientName: string;
  cpf: string;
  lotInfo: string;
  description: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  status: string;
  action: 'CRIADA' | 'BAIXADA' | 'ATUALIZADA' | 'SEM_ALTERACAO' | 'ALERTA';
  details: string;
}

export interface SyncResult {
  success: boolean;
  dryRun: boolean;
  summary: {
    totalRows: number;
    totalClients: number;
    totalAmount: number;
    totalPaidAmount: number;
    createdCount: number;
    paidCount: number;
    updatedCount: number;
    alertCount: number;
  };
  records: SyncRecordLog[];
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
  if (norm.includes('PIX') || norm.includes('MERCADO PAGO') || norm.includes('MERCADOPAGO')) {
    return { method: PaymentMethod.MERCADO_PAGO, accountId: 'account-mercado-pago' };
  }
  return { method: PaymentMethod.ASAAS, accountId: 'account-asaas' };
}

function mapStatus(situation: string): PaymentStatus {
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

export function parseAsaasWorkbook(bufferOrPath: Buffer | string): AsaasClientBlock[] {
  const wb = typeof bufferOrPath === 'string'
    ? XLSX.readFile(bufferOrPath, { cellDates: true })
    : XLSX.read(bufferOrPath, { type: 'buffer', cellDates: true });

  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  const clientBlocks: AsaasClientBlock[] = [];
  let currentBlock: AsaasClientBlock | null = null;
  let lastItem: AsaasBillItem | null = null;

  for (let r = 0; r < rawRows.length; r++) {
    const row = rawRows[r];

    // Client Header
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

    // Observation row
    if (row[0] && String(row[0]).trim().startsWith('Observações:')) {
      const obsText = String(row[0]).replace(/^Observações:\s*/i, '').trim();
      if (lastItem) {
        lastItem.notes = obsText;
        const qdMatch = obsText.match(/QD[- ]*(\d+|[A-Za-z]+)/i);
        const ltMatch = obsText.match(/LT[- ]*(\d+)/i) || obsText.match(/LOTE[- ]*(\d+)/i);
        if (qdMatch) {
          lastItem.blockNumber = qdMatch[1].replace(/^0+/, '');
        }
        if (ltMatch) {
          lastItem.lotNumber = ltMatch[1].replace(/^0+/, '');
        }
      }
      continue;
    }

    // Numeric ID row (e.g. Asaas invoice document number)
    const firstCell = row[0];
    const isId =
      (typeof firstCell === 'number' && firstCell > 1000) ||
      (typeof firstCell === 'string' && /^\d{4,}$/.test(firstCell.trim()));

    if (isId && currentBlock) {
      const id = String(firstCell).trim();

      const cpfCell = row.find((c) => /\d{3}\.\d{3}\.\d{3}-\d{2}/.test(String(c))) || '';
      const cpf = cleanCpf(cpfCell);
      if (cpf && !currentBlock.cpf) {
        currentBlock.cpf = cpf;
      }

      const dateCell = row.find((c) => c instanceof Date || /\d{4}-\d{2}-\d{2}/.test(String(c)) || /\d{2}\/\d{2}\/\d{4}/.test(String(c)));
      const dueDate = parseDate(dateCell);

      const moneyCell = row.find((c) => /R\$\s?[\d.,]+/i.test(String(c))) || row[20] || row[19] || 0;
      const amount = parseMoney(moneyCell);

      const parcCell = row.find((c) => /^\d+\s*[\/]\s*\d+$/.test(String(c).trim())) || '1/1';
      const parcMatch = String(parcCell).trim().match(/^(\d+)\s*[\/]\s*(\d+)$/);
      const parcelNumber = parcMatch ? Number(parcMatch[1]) : 1;
      const totalParcels = parcMatch ? Number(parcMatch[2]) : 1;
      const isEntrada = totalParcels === 1 || parcelNumber === 0;

      const bankCell = row.find((c) => /CAIXA|ASAAS|MERCADO|BANCO/i.test(String(c))) || 'ASAAS';
      const methodCell = row.find((c) => /DINHEIRO|BOLETO|PIX|CART/i.test(String(c))) || '';
      const situationCell = row.find((c) => /Recebidos|A Receber|Vencid|Cancel/i.test(String(c))) || 'A Receber';
      const projectCell = row.find((c) => /VILA NOVA|ARIPUAN/i.test(String(c))) || 'Vila Nova Aripuanã';

      const { method, accountId } = mapPaymentMethod(String(bankCell), String(methodCell));
      const status = mapStatus(String(situationCell));

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

export async function processAsaasSync(
  clientBlocks: AsaasClientBlock[],
  options: { dryRun?: boolean; userId?: string } = {}
): Promise<SyncResult> {
  const dryRun = Boolean(options.dryRun);
  const records: SyncRecordLog[] = [];

  let totalRows = 0;
  let totalAmount = 0;
  let totalPaidAmount = 0;
  let createdCount = 0;
  let paidCount = 0;
  let updatedCount = 0;
  let alertCount = 0;

  // 1. Ensure financial accounts exist if not in dryRun
  if (!dryRun) {
    await prisma.financialAccount.upsert({
      where: { id: 'account-cash' },
      update: { name: 'Dinheiro (Caixa da Empresa)', type: FinancialAccountType.CASH, active: true },
      create: { id: 'account-cash', name: 'Dinheiro (Caixa da Empresa)', type: FinancialAccountType.CASH },
    });
    await prisma.financialAccount.upsert({
      where: { id: 'account-asaas' },
      update: { name: 'Asaas (Boleto)', type: FinancialAccountType.ASAAS, active: true },
      create: { id: 'account-asaas', name: 'Asaas (Boleto)', type: FinancialAccountType.ASAAS },
    });
    await prisma.financialAccount.upsert({
      where: { id: 'account-mercado-pago' },
      update: { name: 'Mercado Pago (PIX)', type: FinancialAccountType.MERCADO_PAGO, active: true },
      create: { id: 'account-mercado-pago', name: 'Mercado Pago (PIX)', type: FinancialAccountType.MERCADO_PAGO },
    });
  }

  for (const block of clientBlocks) {
    // A. Find Person by CPF or FullName
    let person: any = null;
    if (block.cpf) {
      person = await prisma.person.findFirst({
        where: { cpf: { contains: block.cpf } },
        include: {
          occupancies: { include: { lot: { include: { block: true, project: true } } } },
          contracts: { include: { negotiations: { include: { installments: true } } } },
        },
      });
    }

    if (!person) {
      person = await prisma.person.findFirst({
        where: { fullName: { equals: block.clientName, mode: 'insensitive' } },
        include: {
          occupancies: { include: { lot: { include: { block: true, project: true } } } },
          contracts: { include: { negotiations: { include: { installments: true } } } },
        },
      });
    }

    if (!person && !dryRun) {
      person = await prisma.person.create({
        data: {
          fullName: block.clientName,
          cpf: block.cpf || null,
        },
        include: {
          occupancies: { include: { lot: { include: { block: true, project: true } } } },
          contracts: { include: { negotiations: { include: { installments: true } } } },
        },
      });
    }

    // B. Find Lot
    const itemWithLot = block.items.find((i) => i.blockNumber && i.lotNumber);
    let targetLot: any = null;

    if (itemWithLot && itemWithLot.blockNumber && itemWithLot.lotNumber) {
      targetLot = await prisma.lot.findFirst({
        where: {
          number: { in: [itemWithLot.lotNumber, `0${itemWithLot.lotNumber}`] },
          block: { number: { in: [itemWithLot.blockNumber, `0${itemWithLot.blockNumber}`] } },
        },
        include: { block: true, project: true },
      });
    }

    if (!targetLot && person?.occupancies?.length) {
      targetLot = person.occupancies[0].lot;
    }

    if (!targetLot && !dryRun) {
      targetLot = await prisma.lot.findFirst({ include: { block: true, project: true } });
    }

    // C. Contract and Negotiation
    let contract: any = person?.contracts?.find((c: any) => (targetLot ? c.lotId === targetLot.id : true));

    if (!contract && !dryRun && person && targetLot) {
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
          notes: `Importado do Asaas`,
        },
        include: {
          negotiations: { include: { installments: true } },
        },
      });
    }

    let negotiation: any = contract?.negotiations?.[0];
    if (!negotiation && contract && !dryRun) {
      const entradaItems = block.items.filter((i) => i.isEntrada);
      const parcelItems = block.items.filter((i) => !i.isEntrada);
      const downPayment = entradaItems.reduce((s, i) => s + i.amount, 0);
      const financedAmount = parcelItems.reduce((s, i) => s + i.amount, 0);

      negotiation = await prisma.negotiation.create({
        data: {
          contractId: contract.id,
          totalValue: downPayment + financedAmount,
          downPayment,
          financedAmount,
          installmentCount: parcelItems.length || 1,
          status: 'ACTIVE',
          firstDueDate: parcelItems[0]?.dueDate || new Date(),
        },
        include: { installments: true },
      });
    }

    // D. Process each Bill Item
    for (const item of block.items) {
      totalRows++;
      totalAmount += item.amount;
      const isPaid = item.status === PaymentStatus.PAID;
      if (isPaid) totalPaidAmount += item.amount;

      const lotDesc = targetLot
        ? `Quadra ${targetLot.block?.number || targetLot.blockId} / Lote ${targetLot.number}`
        : item.blockNumber && item.lotNumber
        ? `Quadra ${item.blockNumber} / Lote ${item.lotNumber} (Obs)`
        : 'Lote não vinculado';

      const parcelDesc = item.isEntrada
        ? 'Entrada'
        : `Parcela ${item.parcelNumber} de ${item.totalParcels || block.items.length - 1}`;

      // Check existing installment in DB
      let existingInstallment = await prisma.installment.findFirst({
        where: {
          OR: [
            { asaasPaymentId: item.id },
            ...(negotiation?.id ? [{ negotiationId: negotiation.id, installmentNumber: item.parcelNumber }] : []),
          ],
        },
        include: { payments: true },
      });

      let action: SyncRecordLog['action'] = 'SEM_ALTERACAO';
      let details = '';

      if (!person || !targetLot) {
        action = 'ALERTA';
        details = !person ? 'Cliente / CPF não localizado no sistema' : 'Lote / Quadra não localizado no sistema';
        alertCount++;
      } else if (!existingInstallment) {
        action = isPaid ? 'BAIXADA' : 'CRIADA';
        details = isPaid
          ? `Nova parcela criada com baixa automática via ${item.bank}`
          : `Nova parcela criada com vencimento em ${item.dueDate.toLocaleDateString('pt-BR')}`;
        createdCount++;
        if (isPaid) paidCount++;

        if (!dryRun && negotiation) {
          const newInst = await prisma.installment.create({
            data: {
              negotiationId: negotiation.id,
              installmentNumber: item.parcelNumber,
              description: parcelDesc,
              amount: item.amount,
              dueDate: item.dueDate,
              paidAmount: isPaid ? item.amount : 0,
              paidAt: isPaid ? item.dueDate : null,
              paymentMethod: item.method,
              status: item.status,
              asaasPaymentId: item.id,
            },
          });

          if (isPaid) {
            await prisma.payment.create({
              data: {
                installmentId: newInst.id,
                accountId: item.accountId,
                amount: item.amount,
                paymentDate: item.dueDate,
                paymentMethod: item.method,
                externalId: item.id,
                notes: item.notes || `Baixa automática via ${item.bank}`,
              },
            });
          }
        }
      } else {
        // Installment exists -> check if status changed or baixa needed
        const wasPending = existingInstallment.status !== PaymentStatus.PAID;
        const needsBaixa = isPaid && wasPending;

        if (needsBaixa) {
          action = 'BAIXADA';
          details = `Baixa automática realizada: R$ ${item.amount.toFixed(2)} registrado em ${item.bank}`;
          paidCount++;
        } else if (existingInstallment.amount !== item.amount || existingInstallment.dueDate.getTime() !== item.dueDate.getTime() || !existingInstallment.asaasPaymentId) {
          action = 'ATUALIZADA';
          details = `Dados da parcela atualizados com o Asaas`;
          updatedCount++;
        } else {
          action = 'SEM_ALTERACAO';
          details = `Parcela já sincronizada com o Asaas`;
        }

        if (!dryRun) {
          await prisma.installment.update({
            where: { id: existingInstallment.id },
            data: {
              amount: item.amount,
              dueDate: item.dueDate,
              paidAmount: isPaid ? item.amount : existingInstallment.paidAmount,
              paidAt: isPaid ? (existingInstallment.paidAt || item.dueDate) : existingInstallment.paidAt,
              paymentMethod: item.method,
              status: item.status,
              asaasPaymentId: item.id,
              description: parcelDesc,
            },
          });

          if (needsBaixa) {
            const hasPayment = existingInstallment.payments.some((p: any) => p.externalId === item.id);
            if (!hasPayment) {
              await prisma.payment.create({
                data: {
                  installmentId: existingInstallment.id,
                  accountId: item.accountId,
                  amount: item.amount,
                  paymentDate: item.dueDate,
                  paymentMethod: item.method,
                  externalId: item.id,
                  notes: item.notes || `Baixa automática via ${item.bank}`,
                },
              });
            }
          }
        }
      }

      records.push({
        asaasId: item.id,
        clientName: block.clientName,
        cpf: block.cpf || 'Não informado',
        lotInfo: lotDesc,
        description: parcelDesc,
        dueDate: item.dueDate.toISOString().slice(0, 10),
        amount: item.amount,
        paidAmount: isPaid ? item.amount : 0,
        status: item.status,
        action,
        details,
      });
    }
  }

  return {
    success: true,
    dryRun,
    summary: {
      totalRows,
      totalClients: clientBlocks.length,
      totalAmount,
      totalPaidAmount,
      createdCount,
      paidCount,
      updatedCount,
      alertCount,
    },
    records,
  };
}

/**
 * Direct webhook / single payment handler ready for future Asaas API integrations!
 */
export async function syncSingleAsaasPayment(payload: {
  paymentId: string;
  customerCpf: string;
  customerName?: string;
  amount: number;
  dueDate: Date;
  status: string;
  paymentDate?: Date;
  bankSlipUrl?: string;
  invoiceUrl?: string;
  pixCode?: string;
  notes?: string;
}) {
  const cleanCpfVal = cleanCpf(payload.customerCpf);
  const status = mapStatus(payload.status);
  const isPaid = status === PaymentStatus.PAID;

  let installment = await prisma.installment.findFirst({
    where: { asaasPaymentId: payload.paymentId },
    include: { payments: true, negotiation: { include: { contract: { include: { person: true, lot: true } } } } },
  });

  if (!installment && cleanCpfVal) {
    const person = await prisma.person.findFirst({
      where: { cpf: { contains: cleanCpfVal } },
      include: { contracts: { include: { negotiations: { include: { installments: true } } } } },
    });

    const activeContract = person?.contracts?.[0];
    const negotiation = activeContract?.negotiations?.[0];

    if (negotiation) {
      installment = await prisma.installment.create({
        data: {
          negotiationId: negotiation.id,
          installmentNumber: (negotiation.installments.length || 0) + 1,
          description: `Cobrança Asaas ${payload.paymentId}`,
          amount: payload.amount,
          dueDate: payload.dueDate,
          paidAmount: isPaid ? payload.amount : 0,
          paidAt: isPaid ? (payload.paymentDate || new Date()) : null,
          paymentMethod: PaymentMethod.ASAAS,
          status,
          asaasPaymentId: payload.paymentId,
          bankSlipUrl: payload.bankSlipUrl,
          invoiceUrl: payload.invoiceUrl,
          pixCode: payload.pixCode,
        },
        include: { payments: true, negotiation: { include: { contract: { include: { person: true, lot: true } } } } },
      });
    }
  }

  if (installment) {
    await prisma.installment.update({
      where: { id: installment.id },
      data: {
        paidAmount: isPaid ? payload.amount : installment.paidAmount,
        paidAt: isPaid ? (payload.paymentDate || new Date()) : installment.paidAt,
        status,
        bankSlipUrl: payload.bankSlipUrl || installment.bankSlipUrl,
        invoiceUrl: payload.invoiceUrl || installment.invoiceUrl,
        pixCode: payload.pixCode || installment.pixCode,
      },
    });

    if (isPaid && !installment.payments.some((p: any) => p.externalId === payload.paymentId)) {
      await prisma.payment.create({
        data: {
          installmentId: installment.id,
          accountId: 'account-asaas',
          amount: payload.amount,
          paymentDate: payload.paymentDate || new Date(),
          paymentMethod: PaymentMethod.ASAAS,
          externalId: payload.paymentId,
          notes: payload.notes || 'Baixa automática via API Asaas',
        },
      });
    }
  }

  return { success: true, installment };
}
