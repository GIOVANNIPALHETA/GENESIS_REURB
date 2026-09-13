import React, { useRef } from 'react';
import {
  CalendarClock,
  ExternalLink,
  FileText,
  Paperclip,
  QrCode,
  Tag,
  Trash2,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import { PAYMENT_METHOD_LABELS } from '../utils/paymentMethods';
import { maskCurrency } from '../utils/money';

type Account = { id: string; name: string; type: string };
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
  id?: string;
  installmentNumber: number;
  amount: number;
  paidAmount: number;
  dueDate: string;
  status?: string;
  paymentMethod?: string;
  asaasPaymentId?: string | null;
  bankSlipUrl?: string | null;
  invoiceUrl?: string | null;
  pixCode?: string | null;
  payments?: PaymentRecord[];
};

export type FormState = {
  amount: string;
  dueDate: string;
  status: string;
  paymentMethod: string;
  accountId: string;
  paymentDate: string;
  notes?: string;
  receiptPath?: string | null;
  receiptFile?: File | null;
  asaasPaymentId?: string | null;
  bankSlipUrl?: string | null;
  invoiceUrl?: string | null;
  pixCode?: string | null;
};

type Props = {
  installment: Installment;
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  accounts: Account[];
  onSubmit: (event: React.FormEvent) => void;
  onClose: () => void;
  onDelete?: () => void;
};

const statusOptions = [
  { value: 'PENDING', label: 'Pendente' },
  { value: 'PAID', label: 'Pago' },
  { value: 'PARTIALLY_PAID', label: 'Parcial' },
  { value: 'OVERDUE', label: 'Vencido' },
  { value: 'CANCELED', label: 'Cancelado' },
];

export function InstallmentModal({
  installment,
  form,
  setForm,
  accounts,
  onSubmit,
  onClose,
  onDelete,
}: Props) {
  const isPaidOrPartial = form.status === 'PAID' || form.status === 'PARTIALLY_PAID';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentReceipt = form.receiptPath || installment.payments?.[0]?.receiptPath;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#102a33]/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="installment-title"
    >
      <form onSubmit={onSubmit} className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-2 text-[#0f5964]">
              <CalendarClock size={19} />
              <span className="text-xs font-semibold uppercase tracking-wide">Editar parcela</span>
            </div>
            <h2 id="installment-title" className="mt-1 text-xl font-semibold text-[#17343b]">
              {installment.installmentNumber === 0
                ? 'Entrada'
                : `Parcela ${installment.installmentNumber}`}
            </h2>
            {form.asaasPaymentId && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800 border border-amber-200 mt-1">
                <Tag size={12} /> ID Fatura Asaas: #{form.asaasPaymentId}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Fechar"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X size={19} />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Valor da parcela */}
          <label className="text-sm font-medium text-slate-700">
            Valor da parcela
            <input
              required
              type="text"
              inputMode="numeric"
              placeholder="R$ 0,00"
              value={form.amount}
              onChange={(e) => setForm((curr) => ({ ...curr, amount: maskCurrency(e.target.value) }))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900"
            />
          </label>

          {/* Vencimento */}
          <label className="text-sm font-medium text-slate-700">
            Data de vencimento
            <input
              required
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((curr) => ({ ...curr, dueDate: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </label>

          {/* Situação */}
          <label className="text-sm font-medium text-slate-700">
            Situação
            <select
              value={form.status}
              onChange={(e) => setForm((curr) => ({ ...curr, status: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          {/* Forma de Recebimento */}
          <label className="text-sm font-medium text-slate-700">
            Forma de recebimento
            <select
              value={form.paymentMethod}
              onChange={(e) => {
                const method = e.target.value;
                const matchedAccount = accounts.find((acc) => acc.type === method);
                setForm((curr) => ({
                  ...curr,
                  paymentMethod: method,
                  accountId: matchedAccount?.id || curr.accountId,
                }));
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="CASH">Dinheiro (Caixa da empresa)</option>
              <option value="MERCADO_PAGO">Pix (Mercado Pago / CNPJ)</option>
              <option value="ASAAS">Asaas (Boleto)</option>
            </select>
          </label>

          {/* Conta / Banco */}
          <label className="text-sm font-medium text-slate-700">
            Conta financeira
            <select
              value={form.accountId}
              onChange={(e) => setForm((curr) => ({ ...curr, accountId: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="">Selecione a conta</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                </option>
              ))}
            </select>
          </label>

          {/* Data do pagamento se pago */}
          {isPaidOrPartial && (
            <label className="text-sm font-medium text-slate-700">
              Data do recebimento
              <input
                type="date"
                value={form.paymentDate}
                onChange={(e) => setForm((curr) => ({ ...curr, paymentDate: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </label>
          )}

          {/* Observação */}
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Observação (Opcional)
            <input
              type="text"
              placeholder="Ex: Recebido pessoalmente, adiantamento, acerto..."
              value={form.notes || ''}
              onChange={(e) => setForm((curr) => ({ ...curr, notes: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </label>

          {/* DADOS DA FATURA E ASAAS */}
          <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-900">
                <Zap size={15} className="text-amber-600" /> Identificação & Dados da Fatura (Asaas)
              </span>
              <div className="flex items-center gap-2">
                {form.bankSlipUrl && (
                  <a
                    href={form.bankSlipUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 rounded-md bg-white border border-amber-300 px-2 py-0.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                  >
                    <ExternalLink size={12} /> Abrir Boleto
                  </a>
                )}
                {form.invoiceUrl && (
                  <a
                    href={form.invoiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 rounded-md bg-white border border-amber-300 px-2 py-0.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                  >
                    <ExternalLink size={12} /> Fatura Online
                  </a>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-700">
                ID da Fatura / Cobrança (Asaas)
                <input
                  type="text"
                  placeholder="Ex: 212448438 ou pay_..."
                  value={form.asaasPaymentId || ''}
                  onChange={(e) => setForm((curr) => ({ ...curr, asaasPaymentId: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-mono text-slate-900"
                />
              </label>

              <label className="text-xs font-semibold text-slate-700">
                Link do Boleto (bankSlipUrl)
                <input
                  type="text"
                  placeholder="https://..."
                  value={form.bankSlipUrl || ''}
                  onChange={(e) => setForm((curr) => ({ ...curr, bankSlipUrl: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs text-slate-900"
                />
              </label>

              <label className="text-xs font-semibold text-slate-700">
                Link da Fatura (invoiceUrl)
                <input
                  type="text"
                  placeholder="https://..."
                  value={form.invoiceUrl || ''}
                  onChange={(e) => setForm((curr) => ({ ...curr, invoiceUrl: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs text-slate-900"
                />
              </label>

              <label className="text-xs font-semibold text-slate-700">
                Código Pix Copia e Cola
                <input
                  type="text"
                  placeholder="Código Pix..."
                  value={form.pixCode || ''}
                  onChange={(e) => setForm((curr) => ({ ...curr, pixCode: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-mono text-slate-900"
                />
              </label>
            </div>
          </div>

          {/* Upload de Comprovante */}
          <div className="sm:col-span-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-600">
                <Paperclip size={15} /> Comprovante de Pagamento (Opcional)
              </span>
              {currentReceipt && (
                <a
                  href={currentReceipt}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs font-semibold text-[#0f5964] hover:underline"
                >
                  <ExternalLink size={13} /> Ver Comprovante Atual
                </a>
              )}
            </div>

            <div className="mt-2 flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setForm((curr) => ({ ...curr, receiptFile: file }));
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                <Upload size={14} />
                {form.receiptFile ? 'Trocar arquivo' : 'Selecionar comprovante (PDF ou Imagem)'}
              </button>

              {form.receiptFile && (
                <div className="flex items-center gap-2 text-xs text-slate-700 font-medium">
                  <FileText size={14} className="text-[#0f5964]" />
                  <span>{form.receiptFile.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((curr) => ({ ...curr, receiptFile: null }));
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="text-red-600 hover:underline text-[11px]"
                  >
                    Remover
                  </button>
                </div>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Formatos aceitos: PDF, PNG, JPG (máx. 15MB). Nem todos os pagamentos possuem comprovante.
            </p>
          </div>
        </div>

        {/* Resumo atual */}
        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
          <div className="flex justify-between">
            <span>Total recebido registrado:</span>
            <strong className="text-slate-900">
              {installment.paidAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </strong>
          </div>
          {installment.paymentMethod && (
            <div className="mt-1 flex justify-between">
              <span>Canal cadastrado:</span>
              <span className="font-medium text-[#0f5964]">
                {PAYMENT_METHOD_LABELS[installment.paymentMethod] || installment.paymentMethod}
              </span>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between">
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
            >
              <Trash2 size={15} />
              Excluir parcela
            </button>
          ) : (
            <div />
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[#0f5964] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0c4952]"
            >
              Salvar parcela
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
