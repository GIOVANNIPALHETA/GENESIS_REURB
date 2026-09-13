export function formatMoney(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return 'R$ 0,00';
  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num)) return 'R$ 0,00';
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function maskCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  const amount = Number(digits) / 100;
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function unmaskCurrency(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value;
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return 0;
  return Number(digits) / 100;
}
