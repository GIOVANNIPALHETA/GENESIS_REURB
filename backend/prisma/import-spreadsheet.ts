import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { FinancialAccountType, PaymentMethod, PaymentStatus, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const defaultFile = path.resolve(process.cwd(), '../uploads/documents/CONTROLE GERAL - FINANCEIRO E DOCUMENTOS - REGULARIZAÇÃO DOS SETORES.xlsx');
const confirm = process.argv.includes('--confirm');
const file = process.argv.find((argument) => argument.endsWith('.xlsx')) || defaultFile;

type Row = Record<string, unknown>;
type ClientRow = { id: string; sector: string; block: string; lot: string; name: string; cpf: string; phone: string; mode: string; status: 'NOT_SIGNED' | 'CONTRACT_SIGNED' | 'DISTRATTO'; original: number; discount: number; contracted: number; entryExpected: number; entryDate?: Date; entryPaid: number; entryMethod: string; startDate?: Date };
type ParcelRow = { ids: string[]; number: number; dueDate: Date; paymentDate?: Date; expectedTotal: number; paid: number; situation: string; method: string; notes: string; asaasId: string; amountPerLot: number; quantity: number };

function text(value: unknown) { return String(value ?? '').trim(); }
function number(value: unknown) {
  if (typeof value === 'number') return value;
  const normalized = text(value).replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  return normalized ? Number(normalized) || 0 : 0;
}
function cpf(value: unknown) { return text(value).replace(/\D/g, ''); }
function slug(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function date(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number') return new Date(Date.UTC(1899, 11, 30 + value));
  const valueText = text(value);
  const match = valueText.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 12);
  const parsed = new Date(valueText);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
function paymentMethod(value: string): PaymentMethod | undefined {
  const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (normalized.includes('DINHEIRO')) return PaymentMethod.CASH;
  if (normalized.includes('BOLETO') || normalized.includes('ASAAS')) return PaymentMethod.ASAAS;
  if (normalized.includes('PIX') || normalized.includes('MERCADO')) return PaymentMethod.MERCADO_PAGO;
  return undefined;
}
function accountId(value: string) {
  const method = paymentMethod(value);
  if (method === PaymentMethod.CASH) return 'account-cash';
  if (method === PaymentMethod.ASAAS) return 'account-asaas';
  if (method === PaymentMethod.MERCADO_PAGO) return 'account-mercado-pago';
  return undefined;
}
function linkedIds(value: unknown) { return text(value).split('|').map((item) => item.trim()).filter(Boolean); }

function isRed(cell: XLSX.CellObject | undefined) {
  return /FF0000|C00000/i.test(JSON.stringify(cell?.s || ''));
}

function readVilaNovaWorkbook(sheet: XLSX.WorkSheet): ClientRow[] {
  const rows = XLSX.utils.sheet_to_json<Row>(sheet, { range: 0, defval: '' });
  return rows.filter((row) => text(row.QUADRA) && text(row.LOTE) && text(row.NOME)).map((row, index) => {
    const spreadsheetRow = index + 2;
    const red = isRed(sheet[`A${spreadsheetRow}`]) || isRed(sheet[`B${spreadsheetRow}`]) || isRed(sheet[`C${spreadsheetRow}`]);
    const signed = text(row['ASSINOU CONTRATO?']).toUpperCase() === 'SIM';
    return {
      id: `VILA-NOVA-${spreadsheetRow}`, sector: 'Vila Nova Aripuanã', block: text(row.QUADRA), lot: text(row.LOTE), name: text(row.NOME), cpf: cpf(row.CPF), phone: text(row.CONTATO), mode: signed ? 'ASSINADO' : 'NÃO ASSINADO', status: red ? 'DISTRATTO' : signed ? 'CONTRACT_SIGNED' : 'NOT_SIGNED', original: 0, discount: 0, contracted: 0, entryExpected: 0, entryPaid: 0, entryMethod: '',
    };
  });
}

function readWorkbook() {
  if (!fs.existsSync(file)) throw new Error(`Planilha não encontrada: ${file}`);
  const workbook = XLSX.readFile(file, { cellDates: true, cellStyles: true });
  if (workbook.Sheets.Planilha1 && !workbook.Sheets['Controle Financeiro']) return { clients: readVilaNovaWorkbook(workbook.Sheets.Planilha1), parcelRows: [] };
  const control = XLSX.utils.sheet_to_json<Row>(workbook.Sheets['Controle Financeiro'], { range: 4, defval: '' });
  const parcels = XLSX.utils.sheet_to_json<Row>(workbook.Sheets.Parcelas, { range: 3, defval: '' });
  const clients: ClientRow[] = control.filter((row) => text(row.ID)).map((row) => ({
    id: text(row.ID), sector: text(row.SETOR), block: text(row.QUADRA), lot: text(row.LOTE), name: text(row['NOME DO TITULAR']), cpf: cpf(row.CPF), phone: '', mode: text(row.MODALIDADE), status: 'NOT_SIGNED', original: number(row['VALOR ORIGINAL']), discount: number(row.DESCONTO), contracted: number(row['VALOR CONTRATADO']), entryExpected: number(row['ENTRADA PREVISTA']), entryDate: date(row['DATA DA ENTRADA']), entryPaid: number(row['ENTRADA RECEBIDA']), entryMethod: text(row['FORMA DE RECEBIMENTO DA ENTRADA']), startDate: date(row['DATA INICIAL DO PARCELAMENTO']),
  }));
  const parcelRows: ParcelRow[] = parcels.filter((row) => linkedIds(row['IDs VINCULADOS']).length > 0).map((row) => ({
    ids: linkedIds(row['IDs VINCULADOS']), number: number(row['Nº PARCELA']), dueDate: date(row.VENCIMENTO) || new Date(), paymentDate: date(row['DATA PAGAMENTO']), expectedTotal: number(row['VALOR PREVISTO TOTAL']), paid: number(row['VALOR PAGO TOTAL']), situation: text(row.SITUAÇÃO), method: text(row['FORMA RECEBIMENTO']), notes: text(row.OBSERVAÇÕES), asaasId: text(row['IDENTIFICADOR ASAAS']), amountPerLot: number(row['VALOR PREVISTO POR LOTE']), quantity: number(row['QTDE. LOTES VINCULADOS']) || 1,
  }));
  return { clients, parcelRows };
}

async function main() {
  const { clients, parcelRows } = readWorkbook();
  const ids = new Set(clients.map((client) => client.id));
  const linkedParcelRows = parcelRows.filter((parcel) => parcel.ids.some((id) => ids.has(id)));
  const modes = clients.reduce<Record<string, number>>((result, client) => { result[client.mode] = (result[client.mode] || 0) + 1; return result; }, {});
  console.log(JSON.stringify({ file, clients: clients.length, uniqueCpfs: new Set(clients.map((client) => client.cpf)).size, sectors: [...new Set(clients.map((client) => client.sector))], modes, parcelRows: linkedParcelRows.length, paidParcelRows: linkedParcelRows.filter((parcel) => parcel.paid > 0).length, dryRun: !confirm }, null, 2));
  if (!confirm) return;

  await prisma.$transaction(async (tx) => {
    await tx.document.deleteMany();
    await tx.asaasCustomer.deleteMany();
    await tx.serviceRecord.deleteMany();
    await tx.auditLog.deleteMany();
    await tx.payment.deleteMany();
    await tx.expense.deleteMany();
    await tx.installment.deleteMany();
    await tx.negotiation.deleteMany();
    await tx.contractChain.deleteMany();
    await tx.contract.deleteMany();
    await tx.occupancy.deleteMany();
    await tx.person.deleteMany();
    await tx.lot.deleteMany();
    await tx.block.deleteMany();
    await tx.project.deleteMany();
    await tx.financialAccount.updateMany({ data: { openingBalance: 0, active: true } });

    const people = new Map<string, string>();
    const projects = new Map<string, string>();
    const lots = new Map<string, string>();
    for (const client of clients) {
      const projectKey = slug(client.sector);
      const projectId = projects.get(projectKey) || `project-${projectKey}`;
      if (!projects.has(projectKey)) {
        await tx.project.create({ data: { id: projectId, name: client.sector, neighborhood: client.sector, city: 'Aripuanã', state: 'MT', status: 'IN_PROGRESS', active: true } });
        projects.set(projectKey, projectId);
      }
      const blockKey = `${projectId}-${slug(client.block)}`;
      const blockId = `block-${slug(blockKey)}`;
      if (!(await tx.block.findUnique({ where: { id: blockId } }))) await tx.block.create({ data: { id: blockId, projectId, number: client.block } });
      const lotKey = `${projectId}-${client.block}-${client.lot}`;
      const lotId = `lot-${slug(lotKey)}`;
      if (!(await tx.lot.findUnique({ where: { id: lotId } }))) await tx.lot.create({ data: { id: lotId, projectId, blockId, number: client.lot, status: client.status } });
      lots.set(client.id, lotId);
      let personId = people.get(client.cpf);
      if (!personId) {
        const person = await tx.person.create({ data: { fullName: client.name, cpf: client.cpf || undefined, phone: client.phone || undefined } });
        personId = person.id;
        people.set(client.cpf, personId);
      }
      if (!(await tx.occupancy.findFirst({ where: { personId, lotId } }))) await tx.occupancy.create({ data: { personId, lotId, type: 'OWNER', current: true } });
      const contractId = `contract-${slug(client.id)}`;
      const contract = await tx.contract.create({ data: { id: contractId, personId, lotId, projectId, contractNumber: client.id, totalValue: client.contracted || client.original, status: client.mode === 'A DEFINIR' ? 'PENDING' : 'ACTIVE', notes: `Importado da planilha. Desconto: R$ ${client.discount.toFixed(2)}.` } });
      const rows = parcelRows.filter((parcel) => parcel.ids.includes(client.id));
      const totalValue = client.contracted || client.original;
      const entry = client.mode === 'À VISTA' ? totalValue : client.entryExpected || 500;
      const shouldCreateNegotiation = client.mode !== 'A DEFINIR' || rows.length > 0;
      if (!shouldCreateNegotiation) continue;
      const installmentRows = rows.length > 0 ? rows : client.mode === 'PARCELADO' ? Array.from({ length: 10 }, (_, index) => ({ ids: [client.id], number: index + 1, dueDate: new Date((client.startDate || new Date()).getFullYear(), (client.startDate || new Date()).getMonth() + index, (client.startDate || new Date()).getDate()), paymentDate: undefined, expectedTotal: 0, paid: 0, situation: 'PENDENTE', method: '', notes: '', asaasId: '', amountPerLot: 0, quantity: 1 })) : [];
      const financed = Math.max(totalValue - entry, 0);
      const negotiation = await tx.negotiation.create({ data: { contractId: contract.id, totalValue, downPayment: entry, financedAmount: financed, installmentCount: installmentRows.length, firstDueDate: installmentRows[0]?.dueDate || client.startDate, status: 'ACTIVE' } });
      const entryPaid = Math.min(client.entryPaid, entry);
      const entryInstallment = await tx.installment.create({ data: { negotiationId: negotiation.id, installmentNumber: 0, description: client.mode === 'À VISTA' ? 'Pagamento à vista' : 'Entrada', amount: entry, paidAmount: entryPaid, paidAt: entryPaid > 0 ? client.entryDate || new Date() : null, paymentMethod: paymentMethod(client.entryMethod), status: entryPaid >= entry ? PaymentStatus.PAID : entryPaid > 0 ? PaymentStatus.PARTIALLY_PAID : PaymentStatus.PENDING, dueDate: client.entryDate || new Date() } });
      const entryAccountId = accountId(client.entryMethod);
      if (entryPaid > 0 && entryAccountId && paymentMethod(client.entryMethod)) await tx.payment.create({ data: { installmentId: entryInstallment.id, accountId: entryAccountId, amount: entryPaid, paymentDate: client.entryDate || new Date(), paymentMethod: paymentMethod(client.entryMethod)!, notes: `Importado da planilha. Forma original: ${client.entryMethod}` } });
      const standardAmount = installmentRows.length ? financed / installmentRows.length : 0;
      for (const parcel of installmentRows) {
        const amount = parcel.amountPerLot || (parcel.expectedTotal ? parcel.expectedTotal / parcel.quantity : standardAmount);
        const paid = parcel.paid > 0 ? parcel.paid / parcel.quantity : 0;
        const method = paymentMethod(parcel.method);
        const installment = await tx.installment.create({ data: { negotiationId: negotiation.id, installmentNumber: parcel.number, description: parcel.notes || `Parcela ${parcel.number}/${installmentRows.length}`, amount: Number(amount.toFixed(2)), dueDate: parcel.dueDate, paidAmount: Number(paid.toFixed(2)), paidAt: paid > 0 ? parcel.paymentDate || new Date() : null, paymentMethod: method, asaasPaymentId: parcel.asaasId && parcel.quantity === 1 ? parcel.asaasId : null, status: parcel.situation === 'PAGO' || paid >= amount ? PaymentStatus.PAID : parcel.situation === 'ATRASADO' ? PaymentStatus.OVERDUE : paid > 0 ? PaymentStatus.PARTIALLY_PAID : PaymentStatus.PENDING } });
        const paymentAccountId = accountId(parcel.method);
        if (paid > 0 && paymentAccountId && method) await tx.payment.create({ data: { installmentId: installment.id, accountId: paymentAccountId, amount: Number(paid.toFixed(2)), paymentDate: parcel.paymentDate || new Date(), paymentMethod: method, externalId: parcel.asaasId || null, notes: `Importado da planilha. Forma original: ${parcel.method}` } });
      }
    }
  }, { timeout: 120000 });
  console.log('Importação concluída com sucesso.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());