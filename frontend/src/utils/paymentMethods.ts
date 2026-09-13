export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Dinheiro (Caixa da empresa)',
  MERCADO_PAGO: 'Pix (Mercado Pago / CNPJ)',
  PIX: 'Pix (Mercado Pago / CNPJ)',
  ASAAS: 'Asaas (Boleto)',
  BANK_TRANSFER: 'Transferência bancária',
  CARD: 'Cartão',
};

export const PAYMENT_METHOD_SHORT_LABELS: Record<string, string> = {
  CASH: 'Dinheiro (Caixa)',
  MERCADO_PAGO: 'Pix (Mercado Pago)',
  PIX: 'Pix (Mercado Pago)',
  ASAAS: 'Asaas (Boleto)',
  BANK_TRANSFER: 'Transferência',
  CARD: 'Cartão',
};

export const PAYMENT_METHOD_STYLES: Record<string, string> = {
  CASH: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  MERCADO_PAGO: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  PIX: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  ASAAS: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  BANK_TRANSFER: 'bg-blue-50 text-blue-700 border-blue-200',
  CARD: 'bg-purple-50 text-purple-700 border-purple-200',
};

export function getPaymentMethodLabel(method?: string | null, fallback = 'Não informado'): string {
  if (!method) return fallback;
  return PAYMENT_METHOD_LABELS[method.toUpperCase()] || method;
}

export function getPaymentMethodShortLabel(method?: string | null, fallback = '—'): string {
  if (!method) return fallback;
  return PAYMENT_METHOD_SHORT_LABELS[method.toUpperCase()] || method;
}
