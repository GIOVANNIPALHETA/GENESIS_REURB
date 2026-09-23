type Payment = { amount: number; paymentDate: Date };
type Installment = { amount: number; paidAmount: number; dueDate: Date; status: string };
const cents = (value: number) => Math.round(value * 100);

export function dashboardSummary(payments: Payment[], installments: Installment[], now = new Date()) {
  const financeData = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + index, 1));
    return { key: date.toISOString().slice(0, 7), month: date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' }), received: 0, due: 0 };
  });
  let received = 0, outstanding = 0, overdue = 0, overdueCount = 0;
  for (const payment of payments) {
    const amount = cents(payment.amount);
    received += amount;
    const month = financeData.find(item => item.key === payment.paymentDate.toISOString().slice(0, 7));
    if (month) month.received += amount;
  }
  const today = now.toISOString().slice(0, 10);
  for (const installment of installments) {
    if (['CANCELED', 'RENEGOTIATED', 'PAID'].includes(installment.status)) continue;
    const remaining = Math.max(0, cents(installment.amount) - cents(installment.paidAmount));
    outstanding += remaining;
    if (remaining > 0 && installment.dueDate.toISOString().slice(0, 10) < today) {
      overdue += remaining;
      overdueCount++;
    }
    const month = financeData.find(item => item.key === installment.dueDate.toISOString().slice(0, 7));
    if (month) month.due += remaining;
  }
  return {
    financeData: financeData.map(({ key, ...item }) => ({ ...item, received: item.received / 100, due: item.due / 100 })),
    financialSummary: { received: received / 100, outstanding: outstanding / 100, overdue: overdue / 100 },
    overdueCount,
  };
}
