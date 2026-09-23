import { ProtectedFileLink } from './ProtectedFileLink';
import React, { useRef } from 'react';
import { CreditCard, ExternalLink, FileText, Paperclip, Upload, X } from 'lucide-react';
import { maskCurrency } from '../utils/money';

type Installment = {
  installmentNumber: number;
  amount: number;
  paidAmount: number;
  dueDate: string;
};

type Account = { id: string; name: string; type: string };

type ExistingPayment = {
  id: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  accountId?: string;
  notes?: string;
  receiptPath?: string | null;
};

export type PaymentState = {
  amount: string;
  paymentDate: string;
  accountId: string;
  paymentMethod: string;
  notes: string;
  receiptPath?: string | null;
  receiptFile?: File | null;
};

const methods: Record<string, string> = {
  CASH: 'Dinheiro (Caixa da empresa)',
  MERCADO_PAGO: 'Pix (Mercado Pago / CNPJ)',
  ASAAS: 'Asaas (Boleto)',
};

type Props = {
  installment: Installment;
  accounts: Account[];
  payment: PaymentState;
  setPayment: React.Dispatch<React.SetStateAction<PaymentState>>;
  existingPayment?: ExistingPayment;
  onSubmit: (event: React.FormEvent) => void;
  onClose: () => void;
  onCancel?: () => void;
};

export function PaymentModal({
  installment,
  accounts,
  payment,
  setPayment,
  existingPayment,
  onSubmit,
  onClose,
  onCancel,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentReceipt = payment.receiptPath || existingPayment?.receiptPath;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#102a33]/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-title"
    >
      <form onSubmit={onSubmit} className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-2 text-[#0f5964]">
              <CreditCard size={19} />
              <span className="text-xs font-semibold uppercase tracking-wide">
                {existingPayment ? 'Editar recebimento' : 'Registrar recebimento'}
              </span>
            </div>
            <h2 id="payment-title" className="mt-1 text-xl font-semibold text-[#17343b]">
              {installment.installmentNumber === 0
                ? 'Entrada'
                : `Parcela ${installment.installmentNumber}`}
            </h2>
            <p className="text-xs text-slate-500">
              Vencimento: {new Date(installment.dueDate).toLocaleDateString('pt-BR')}
            </p>
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

        {/* Amount info */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Valor da cobrança</p>
            <p className="font-semibold text-[#17343b]">
              {installment.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Saldo a receber</p>
            <p className="font-semibold text-[#0f5964]">
              {(installment.amount - installment.paidAmount).toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL',
              })}
            </p>
          </div>
        </div>

        {/* Inputs */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Valor */}
          <label className="text-sm font-medium text-slate-700">
            Valor recebido
            <input
              required
              type="text"
              inputMode="numeric"
              placeholder="R$ 0,00"
              value={payment.amount}
              onChange={(event) =>
                setPayment((current) => ({
                  ...current,
                  amount: maskCurrency(event.target.value),
                }))
              }
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900"
            />
          </label>

          {/* Data */}
          <label className="text-sm font-medium text-slate-700">
            Data do recebimento
            <input
              required
              type="date"
              value={payment.paymentDate}
              onChange={(event) =>
                setPayment((current) => ({ ...current, paymentDate: event.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </label>

          {/* Tipo */}
          <label className="text-sm font-medium text-slate-700">
            Tipo de recebimento
            <select
              value={payment.paymentMethod}
              onChange={(event) =>
                setPayment((current) => ({
                  ...current,
                  paymentMethod: event.target.value,
                  accountId:
                    accounts.find((account) => account.type === event.target.value)?.id ||
                    current.accountId,
                }))
              }
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            >
              {Object.entries(methods).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          {/* Banco / Conta */}
          <label className="text-sm font-medium text-slate-700">
            Banco / conta
            <select
              required
              value={payment.accountId}
              onChange={(event) =>
                setPayment((current) => ({ ...current, accountId: event.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>

          {/* Observação */}
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Observação (Opcional)
            <input
              type="text"
              placeholder="Ex: Pago pelo titular, comprovante via WhatsApp, adiantamento..."
              value={payment.notes}
              onChange={(event) =>
                setPayment((current) => ({ ...current, notes: event.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </label>

          {/* Upload de Comprovante */}
          <div className="sm:col-span-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-600">
                <Paperclip size={15} /> Comprovante de Pagamento (Opcional)
              </span>
              {currentReceipt && (
                <ProtectedFileLink
                  href={currentReceipt}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs font-semibold text-[#0f5964] hover:underline"
                >
                  <ExternalLink size={13} /> Ver Comprovante Atual
                </ProtectedFileLink>
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
                  setPayment((curr) => ({ ...curr, receiptFile: file }));
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                <Upload size={14} />
                {payment.receiptFile ? 'Trocar arquivo' : 'Selecionar comprovante (PDF ou Imagem)'}
              </button>

              {payment.receiptFile && (
                <div className="flex items-center gap-2 text-xs text-slate-700 font-medium">
                  <FileText size={14} className="text-[#0f5964]" />
                  <span>{payment.receiptFile.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setPayment((curr) => ({ ...curr, receiptFile: null }));
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

        {/* Action Buttons */}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          {existingPayment && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
            >
              Cancelar recebimento
            </button>
          )}
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
            {existingPayment ? 'Salvar alterações' : 'Confirmar recebimento'}
          </button>
        </div>
      </form>
    </div>
  );
}
