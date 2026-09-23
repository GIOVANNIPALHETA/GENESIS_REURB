import { ProtectedFileLink } from './ProtectedFileLink';
import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { CreditCard, ExternalLink, Paperclip, Plus, Receipt, Tag, Trash2, Zap } from 'lucide-react';
import { PaymentModal, PaymentState } from './PaymentModal';
import { InstallmentModal, FormState } from './InstallmentModal';
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_STYLES,
  getPaymentMethodShortLabel,
} from '../utils/paymentMethods';
import { maskCurrency, unmaskCurrency } from '../utils/money';

type LotOwner = { id: string; fullName: string; cpf?: string };
type LotRef = { id: string; number: string; project: { id: string } };
type PaymentRecord = {
  id: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  accountId?: string;
  account?: { id: string; name: string };
  notes?: string;
  receiptPath?: string | null;
};
type Installment = {
  id: string;
  installmentNumber: number;
  amount: number;
  paidAmount: number;
  dueDate: string;
  status: string;
  paymentMethod?: string;
  asaasPaymentId?: string | null;
  bankSlipUrl?: string | null;
  invoiceUrl?: string | null;
  pixCode?: string | null;
  payments?: PaymentRecord[];
};
type Contract = {
  id: string;
  contractNumber: string;
  totalValue: number;
  status: string;
  negotiations: Array<{
    downPayment: number;
    installmentCount: number;
    installments: Installment[];
  }>;
};
type Account = { id: string; name: string; type: string };

type Props = { lot: LotRef; owner?: LotOwner; onChanged?: () => void };
const money = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const statusLabels: Record<string, string> = {
  PENDING: 'Pendente',
  PAID: 'Pago',
  PARTIALLY_PAID: 'Parcial',
  OVERDUE: 'Vencido',
  CANCELED: 'Cancelado',
};

const statusBadgeStyles: Record<string, string> = {
  PAID: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  PARTIALLY_PAID: 'bg-amber-100 text-amber-800 border-amber-200',
  OVERDUE: 'bg-red-100 text-red-800 border-red-200',
  CANCELED: 'bg-slate-200 text-slate-600 border-slate-300',
  PENDING: 'bg-sky-100 text-sky-800 border-sky-200',
};

export function LotFinanceTab({ lot, owner, onChanged }: Props) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [openPlan, setOpenPlan] = useState(false);
  const [paymentFor, setPaymentFor] = useState<Installment | null>(null);
  const [editingPayment, setEditingPayment] = useState<PaymentRecord | undefined>();
  const [editingInstallment, setEditingInstallment] = useState<Installment | null>(null);
  const [installmentForm, setInstallmentForm] = useState<FormState>({
    amount: '',
    dueDate: '',
    status: 'PENDING',
    paymentMethod: 'CASH',
    accountId: '',
    paymentDate: new Date().toISOString().slice(0, 10),
    notes: '',
    receiptPath: null,
    receiptFile: null,
    asaasPaymentId: null,
    bankSlipUrl: null,
    invoiceUrl: null,
    pixCode: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState({
    totalValue: '',
    downPayment: '',
    entryDate: new Date().toISOString().slice(0, 10),
    firstDueDate: '',
    installmentCount: '10',
  });
  const [payment, setPayment] = useState<PaymentState>({
    amount: '',
    paymentDate: new Date().toISOString().slice(0, 10),
    accountId: '',
    paymentMethod: 'MERCADO_PAGO',
    notes: '',
    receiptPath: null,
    receiptFile: null,
  });

  async function load() {
    setLoading(true);
    try {
      const [contractResponse, accountResponse] = await Promise.all([
        axios.get('/api/contracts'),
        axios.get('/api/finance/accounts'),
      ]);
      setContracts(
        (contractResponse.data.data || []).filter(
          (item: { lot: { id: string } }) => item.lot.id === lot.id
        )
      );
      setAccounts(accountResponse.data.data || []);
      setError(null);
    } catch {
      setError('Não foi possível carregar os dados financeiros.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [lot.id]);

  const contract = contracts[0];
  const negotiation = contract?.negotiations[0];
  const installments = negotiation?.installments || [];
  const summary = useMemo(
    () => ({
      total: installments.reduce((sum, item) => sum + item.amount, 0),
      paid: installments.reduce((sum, item) => sum + item.paidAmount, 0),
    }),
    [installments]
  );

  function updatePlan(name: string, value: string) {
    setPlan((current) => ({ ...current, [name]: value }));
  }

  async function createPlan(event: React.FormEvent) {
    event.preventDefault();
    if (!owner?.id) {
      setError('Cadastre um proprietário com CPF antes de criar o plano financeiro.');
      return;
    }
    try {
      await axios.post('/api/contracts', {
        contractNumber: `LOTE-${lot.number}-${Date.now()}`,
        personId: owner.id,
        lotId: lot.id,
        projectId: lot.project.id,
        totalValue: Number(plan.totalValue),
        downPayment: Number(plan.downPayment),
        installmentCount: Number(plan.installmentCount),
        entryDate: new Date(`${plan.entryDate}T12:00:00`).toISOString(),
        firstDueDate: plan.firstDueDate
          ? new Date(`${plan.firstDueDate}T12:00:00`).toISOString()
          : undefined,
      });
      setOpenPlan(false);
      await load();
      onChanged?.();
    } catch (requestError: unknown) {
      setError(
        axios.isAxiosError(requestError)
          ? requestError.response?.data?.message || 'Não foi possível criar o plano.'
          : 'Não foi possível criar o plano.'
      );
    }
  }

  function openPayment(item: Installment, paymentRecord?: PaymentRecord) {
    setPaymentFor(item);
    setEditingPayment(paymentRecord);
    setPayment(
      paymentRecord
        ? {
            amount: maskCurrency(paymentRecord.amount),
            paymentDate: paymentRecord.paymentDate.slice(0, 10),
            accountId: paymentRecord.accountId || accounts[0]?.id || '',
            paymentMethod: paymentRecord.paymentMethod,
            notes: paymentRecord.notes || '',
            receiptPath: paymentRecord.receiptPath || null,
            receiptFile: null,
          }
        : {
            amount: maskCurrency(item.amount - item.paidAmount),
            paymentDate: new Date().toISOString().slice(0, 10),
            accountId:
              accounts.find((account) => account.type === (item.paymentMethod || 'MERCADO_PAGO'))
                ?.id ||
              accounts[0]?.id ||
              '',
            paymentMethod: item.paymentMethod || 'MERCADO_PAGO',
            notes: '',
            receiptPath: null,
            receiptFile: null,
          }
    );
  }

  function openInstallment(item: Installment) {
    setEditingInstallment(item);
    const method = item.paymentMethod || item.payments?.[0]?.paymentMethod || 'CASH';
    const matchedAcc = accounts.find((a) => a.type === method);
    setInstallmentForm({
      amount: maskCurrency(item.amount),
      dueDate: item.dueDate.slice(0, 10),
      status: item.status || 'PENDING',
      paymentMethod: method,
      accountId: item.payments?.[0]?.accountId || matchedAcc?.id || accounts[0]?.id || '',
      paymentDate: item.payments?.[0]?.paymentDate
        ? item.payments[0].paymentDate.slice(0, 10)
        : new Date().toISOString().slice(0, 10),
      notes: item.payments?.[0]?.notes || '',
      receiptPath: item.payments?.[0]?.receiptPath || null,
      receiptFile: null,
      asaasPaymentId: item.asaasPaymentId || null,
      bankSlipUrl: item.bankSlipUrl || null,
      invoiceUrl: item.invoiceUrl || null,
      pixCode: item.pixCode || null,
    });
  }

  async function saveInstallment(event: React.FormEvent) {
    event.preventDefault();
    if (!editingInstallment) return;
    try {
      if (installmentForm.receiptFile) {
        const fd = new FormData();
        fd.append('amount', String(unmaskCurrency(installmentForm.amount)));
        fd.append('dueDate', new Date(`${installmentForm.dueDate}T12:00:00`).toISOString());
        fd.append('status', installmentForm.status);
        fd.append('paymentMethod', installmentForm.paymentMethod);
        if (installmentForm.accountId) fd.append('accountId', installmentForm.accountId);
        if (installmentForm.paymentDate)
          fd.append(
            'paymentDate',
            new Date(`${installmentForm.paymentDate}T12:00:00`).toISOString()
          );
        if (installmentForm.notes) fd.append('notes', installmentForm.notes);
        if (installmentForm.asaasPaymentId) fd.append('asaasPaymentId', installmentForm.asaasPaymentId);
        if (installmentForm.bankSlipUrl) fd.append('bankSlipUrl', installmentForm.bankSlipUrl);
        if (installmentForm.invoiceUrl) fd.append('invoiceUrl', installmentForm.invoiceUrl);
        if (installmentForm.pixCode) fd.append('pixCode', installmentForm.pixCode);
        fd.append('receipt', installmentForm.receiptFile);

        await axios.put(`/api/finance/installments/${editingInstallment.id}`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        await axios.put(`/api/finance/installments/${editingInstallment.id}`, {
          amount: unmaskCurrency(installmentForm.amount),
          dueDate: new Date(`${installmentForm.dueDate}T12:00:00`).toISOString(),
          status: installmentForm.status,
          paymentMethod: installmentForm.paymentMethod,
          accountId: installmentForm.accountId || undefined,
          paymentDate: installmentForm.paymentDate
            ? new Date(`${installmentForm.paymentDate}T12:00:00`).toISOString()
            : undefined,
          notes: installmentForm.notes || undefined,
          asaasPaymentId: installmentForm.asaasPaymentId || undefined,
          bankSlipUrl: installmentForm.bankSlipUrl || undefined,
          invoiceUrl: installmentForm.invoiceUrl || undefined,
          pixCode: installmentForm.pixCode || undefined,
        });
      }
      setEditingInstallment(null);
      await load();
      onChanged?.();
    } catch (requestError: unknown) {
      setError(
        axios.isAxiosError(requestError)
          ? requestError.response?.data?.message || 'Não foi possível editar a parcela.'
          : 'Não foi possível editar a parcela.'
      );
    }
  }

  async function deleteInstallment(installmentId: string) {
    if (!window.confirm('Tem certeza que deseja excluir esta parcela/entrada permanentemente?')) return;
    try {
      await axios.delete(`/api/finance/installments/${installmentId}`);
      setEditingInstallment(null);
      await load();
      onChanged?.();
    } catch (requestError: unknown) {
      setError(
        axios.isAxiosError(requestError)
          ? requestError.response?.data?.message || 'Não foi possível excluir a parcela.'
          : 'Não foi possível excluir a parcela.'
      );
    }
  }

  async function registerPayment(event: React.FormEvent) {
    event.preventDefault();
    if (!paymentFor) return;
    const numericAmount = unmaskCurrency(payment.amount);
    if (!numericAmount || numericAmount <= 0) {
      setError('O valor recebido deve ser maior que zero.');
      return;
    }
    try {
      if (payment.receiptFile) {
        const fd = new FormData();
        fd.append('amount', String(numericAmount));
        fd.append('paymentDate', new Date(`${payment.paymentDate}T12:00:00`).toISOString());
        fd.append('paymentMethod', payment.paymentMethod);
        fd.append('accountId', payment.accountId);
        if (payment.notes) fd.append('notes', payment.notes);
        fd.append('receipt', payment.receiptFile);

        if (editingPayment) {
          await axios.put(`/api/finance/payments/${editingPayment.id}`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } else {
          await axios.post(`/api/finance/installments/${paymentFor.id}/payments`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        }
      } else {
        const payload = {
          amount: numericAmount,
          paymentDate: payment.paymentDate ? new Date(`${payment.paymentDate}T12:00:00`).toISOString() : new Date().toISOString(),
          paymentMethod: payment.paymentMethod,
          accountId: payment.accountId,
          notes: payment.notes ? payment.notes.trim() : undefined,
          receiptPath: payment.receiptPath || undefined,
        };

        if (editingPayment) {
          await axios.put(`/api/finance/payments/${editingPayment.id}`, payload);
        } else {
          await axios.post(`/api/finance/installments/${paymentFor.id}/payments`, payload);
        }
      }
      setPaymentFor(null);
      setEditingPayment(undefined);
      await load();
      onChanged?.();
    } catch (requestError: unknown) {
      setError(
        axios.isAxiosError(requestError)
          ? requestError.response?.data?.message || 'Não foi possível registrar o recebimento.'
          : 'Não foi possível registrar o recebimento.'
      );
    }
  }

  async function cancelPayment(paymentId: string) {
    if (!window.confirm('Deseja cancelar este recebimento?')) return;
    try {
      await axios.delete(`/api/finance/payments/${paymentId}`);
      setPaymentFor(null);
      setEditingPayment(undefined);
      await load();
      onChanged?.();
    } catch (requestError: unknown) {
      setError(
        axios.isAxiosError(requestError)
          ? requestError.response?.data?.message || 'Não foi possível cancelar o recebimento.'
          : 'Não foi possível cancelar o recebimento.'
      );
    }
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-3">
        <FinanceCard label="Total do plano" value={money(summary.total)} />
        <FinanceCard label="Recebido" value={money(summary.paid)} />
        <FinanceCard label="Saldo a receber" value={money(summary.total - summary.paid)} />
      </div>

      {!contract && !openPlan && (
        <div className="rounded-lg border-2 border-dashed border-teal-200 bg-[#f8fffe] p-6 sm:p-8 text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-teal-100 text-[#0f5964]">
            <Receipt size={24} />
          </div>
          <div>
            <h4 className="text-base font-bold text-[#17343b]">Este lote ainda não possui plano financeiro cadastrado</h4>
            <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
              Cadastre uma negociação à vista ou parcelada para a titular {owner?.fullName ? `(${owner.fullName})` : ''} e registre os recebimentos.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                setPlan({
                  totalValue: '3000',
                  downPayment: '3000',
                  entryDate: new Date().toISOString().slice(0, 10),
                  firstDueDate: '',
                  installmentCount: '1',
                });
                setOpenPlan(true);
              }}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-[#0f5964] px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#0c4952] transition"
            >
              <Zap size={15} /> Criar Pagamento à Vista
            </button>
            <button
              type="button"
              onClick={() => {
                setPlan({
                  totalValue: '',
                  downPayment: '',
                  entryDate: new Date().toISOString().slice(0, 10),
                  firstDueDate: '',
                  installmentCount: '10',
                });
                setOpenPlan(true);
              }}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition"
            >
              <Plus size={15} /> Criar Plano Parcelado
            </button>
          </div>
        </div>
      )}

      {openPlan && (
        <form
          onSubmit={createPlan}
          className="rounded-lg border border-teal-300 bg-[#f8fffe] p-5 sm:p-6 shadow-xs space-y-4"
        >
          <div className="border-b border-teal-100 pb-3 flex items-center justify-between">
            <div>
              <h4 className="text-base font-bold text-[#0f5964]">Novo Plano Financeiro do Lote</h4>
              <p className="text-xs text-slate-500">Titular: {owner?.fullName || 'Sem titular vinculado'}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpenPlan(false)}
              className="text-xs font-semibold text-slate-400 hover:text-slate-600"
            >
              Cancelar
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Field
              label="Valor total (R$)"
              type="number"
              value={plan.totalValue}
              onChange={(value) => updatePlan('totalValue', value)}
              required
            />
            <Field
              label="Valor da entrada (R$)"
              type="number"
              value={plan.downPayment}
              onChange={(value) => updatePlan('downPayment', value)}
              required
            />
            <Field
              label="Data da entrada / pagamento"
              type="date"
              value={plan.entryDate}
              onChange={(value) => updatePlan('entryDate', value)}
              required
            />
            <Field
              label="Quantidade de parcelas"
              type="number"
              value={plan.installmentCount}
              onChange={(value) => updatePlan('installmentCount', value)}
              required
            />
            <Field
              label="Data da 1ª parcela (opcional para parcelado)"
              type="date"
              value={plan.firstDueDate}
              onChange={(value) => updatePlan('firstDueDate', value)}
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-teal-100 pt-4">
            <button
              type="button"
              onClick={() => setOpenPlan(false)}
              className="min-h-[42px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="min-h-[42px] rounded-lg bg-[#0f5964] px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#0c4952] transition"
            >
              Salvar Plano Financeiro
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Carregando financeiro...</p>
      ) : installments.length ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-xs">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Lançamento / Fatura</th>
                <th className="px-4 py-3">Vencimento</th>
                <th className="px-4 py-3">Valor</th>
                <th className="px-4 py-3">Recebido / Forma</th>
                <th className="px-4 py-3">Data do recebimento</th>
                <th className="px-4 py-3">Situação</th>
                <th className="px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {installments.map((item) => {
                const method = item.paymentMethod || item.payments?.[0]?.paymentMethod;
                const methodLabel = method ? PAYMENT_METHOD_LABELS[method] || method : null;
                const methodStyle = method ? PAYMENT_METHOD_STYLES[method] || 'bg-slate-100 text-slate-700' : '';

                return (
                  <tr key={item.id} className="border-t border-slate-100 align-top hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <div>
                        {item.installmentNumber === 0
                          ? 'Entrada'
                          : `Parcela ${item.installmentNumber}`}
                      </div>
                      {item.asaasPaymentId && (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold text-amber-800 border border-amber-200">
                            <Tag size={10} /> #{item.asaasPaymentId}
                          </span>
                          {item.bankSlipUrl && (
                            <a
                              href={item.bankSlipUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-blue-700 hover:underline"
                              title="Abrir boleto bancário"
                            >
                              <ExternalLink size={10} /> Boleto
                            </a>
                          )}
                          {item.invoiceUrl && (
                            <a
                              href={item.invoiceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-[#0f5964] hover:underline"
                              title="Abrir fatura online"
                            >
                              <ExternalLink size={10} /> Fatura
                            </a>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {new Date(item.dueDate).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {money(item.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-emerald-800">
                        {money(item.paidAmount)}
                      </div>
                      {methodLabel && (
                        <span
                          className={`mt-1 inline-block rounded-md border px-2 py-0.5 text-xs font-medium ${methodStyle}`}
                        >
                          {methodLabel}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {item.payments && item.payments.length > 0 ? (
                        <div className="space-y-1.5">
                          {item.payments.map((p) => (
                            <div key={p.id}>
                              <div className="font-medium text-slate-800">
                                {new Date(p.paymentDate).toLocaleDateString('pt-BR')}
                              </div>
                              {p.notes && (
                                <p className="text-[11px] text-slate-500 italic max-w-[170px] truncate" title={p.notes}>
                                  {p.notes}
                                </p>
                              )}
                              {p.receiptPath && (
                                <ProtectedFileLink
                                  href={p.receiptPath}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0f5964] hover:underline mt-0.5"
                                >
                                  <Paperclip size={11} /> Comprovante
                                </ProtectedFileLink>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                          statusBadgeStyles[item.status] || 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {statusLabels[item.status] || item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {item.status !== 'PAID' && item.status !== 'CANCELED' && (
                          <button
                            type="button"
                            onClick={() => openPayment(item)}
                            className="flex items-center gap-1 rounded-lg bg-[#17343b] px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[#0f5964]"
                          >
                            <Receipt size={14} /> Baixa
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openInstallment(item)}
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#17343b] transition hover:bg-slate-50"
                        >
                          Editar parcela
                        </button>
                        {item.id && (
                          <button
                            type="button"
                            onClick={() => deleteInstallment(item.id!)}
                            className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-600 hover:bg-red-100 hover:text-red-800 transition"
                            title="Excluir parcela permanentemente"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                      {item.payments && item.payments.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {item.payments.map((paymentRecord) => (
                            <div key={paymentRecord.id} className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => openPayment(item, paymentRecord)}
                                className="rounded-md border border-[#d9eeef] bg-[#eef9fa] px-2 py-1 text-[11px] font-medium text-[#0f5964]"
                              >
                                Editar recebimento
                              </button>
                              <button
                                type="button"
                                onClick={() => cancelPayment(paymentRecord.id)}
                                className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-700"
                              >
                                Cancelar
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        !openPlan && <p className="text-sm text-slate-500">Nenhum plano financeiro vinculado a este lote.</p>
      )}

      {paymentFor && (
        <PaymentModal
          installment={paymentFor}
          accounts={accounts}
          payment={payment}
          setPayment={setPayment}
          onSubmit={registerPayment}
          existingPayment={editingPayment}
          onClose={() => {
            setPaymentFor(null);
            setEditingPayment(undefined);
          }}
          onCancel={() => editingPayment && cancelPayment(editingPayment.id)}
        />
      )}

      {editingInstallment && (
        <InstallmentModal
          installment={editingInstallment}
          form={installmentForm}
          setForm={setInstallmentForm}
          accounts={accounts}
          onSubmit={saveInstallment}
          onClose={() => {
            setEditingInstallment(null);
          }}
          onDelete={editingInstallment.id ? () => deleteInstallment(editingInstallment.id!) : undefined}
        />
      )}
    </div>
  );
}

function FinanceCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-[#17343b]">{value}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="text-sm font-medium text-slate-700">
      {label}
      <input
        required={required}
        type={type}
        min={type === 'number' ? '0' : undefined}
        step={type === 'number' ? '0.01' : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
      />
    </label>
  );
}
