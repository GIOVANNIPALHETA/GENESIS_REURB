import { prisma } from '../src/prisma/client';

async function inspectAndRestore() {
  console.log('🔍 Inspecionando pagamentos e contas...');

  const accounts = await prisma.financialAccount.findMany();
  console.log('Contas cadastradas:');
  accounts.forEach((a) => console.log(` - ID: ${a.id} | Nome: ${a.name} | Tipo: ${a.type}`));

  const asaasAcc = accounts.find((a) => a.type === 'ASAAS' || a.name.toLowerCase().includes('asaas'));
  const cashAcc = accounts.find((a) => a.type === 'CASH' || a.name.toLowerCase().includes('dinheiro') || a.name.toLowerCase().includes('caixa'));
  const mpAcc = accounts.find((a) => a.type === 'MERCADO_PAGO' || a.name.toLowerCase().includes('mercado'));

  console.log('\nContas resolvidas:', {
    asaas: asaasAcc?.id,
    cash: cashAcc?.id,
    mp: mpAcc?.id,
  });

  const payments = await prisma.payment.findMany({
    include: {
      installment: {
        include: {
          negotiation: {
            include: {
              contract: {
                include: { person: true, project: true },
              },
            },
          },
        },
      },
    },
  });

  console.log(`\nTotal de pagamentos encontrados: ${payments.length}`);

  let cashCount = 0;
  let mpCount = 0;
  let asaasCount = 0;

  for (const p of payments) {
    const inst = p.installment;
    const isAsaas = !!(inst?.asaasPaymentId || inst?.bankSlipUrl || inst?.invoiceUrl);
    const method = p.paymentMethod;

    // Se o método do pagamento foi CASH / DINHEIRO -> Conta Caixa/Dinheiro
    if (method === 'CASH' && cashAcc) {
      await prisma.payment.update({
        where: { id: p.id },
        data: { accountId: cashAcc.id },
      });
      cashCount++;
    }
    // Se o método foi MERCADO_PAGO ou PIX (e não tem id do Asaas) -> Conta Mercado Pago
    else if ((method === 'MERCADO_PAGO' || (method === 'PIX' && !isAsaas)) && mpAcc) {
      await prisma.payment.update({
        where: { id: p.id },
        data: { accountId: mpAcc.id },
      });
      mpCount++;
    }
    // Se tem vínculo do Asaas ou método ASAAS / BANK_TRANSFER -> Conta Asaas
    else if (asaasAcc) {
      await prisma.payment.update({
        where: { id: p.id },
        data: { accountId: asaasAcc.id },
      });
      asaasCount++;
    }
  }

  console.log(`\n✅ Pagamentos redistribuídos com precisão:`);
  console.log(` - Caixa / Dinheiro: ${cashCount}`);
  console.log(` - Mercado Pago (Pix direto): ${mpCount}`);
  console.log(` - Asaas (Boletos e Pix Asaas): ${asaasCount}`);
}

inspectAndRestore()
  .catch((e) => console.error('Erro:', e))
  .finally(() => prisma.$disconnect());
