import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Atualizando valor dos lotes do projeto ÁGUA BOA para R$ 1.000,00...');

  const projects = await prisma.project.findMany({
    where: {
      OR: [
        { id: 'project-3486-agua-boa' },
        { id: 'project-1493-agua-boa' },
        { name: { contains: 'ÁGUA BOA', mode: 'insensitive' } },
        { name: { contains: 'AGUA BOA', mode: 'insensitive' } },
      ],
    },
  });

  const projectIds = projects.map((p) => p.id);
  console.log(`📁 Projetos encontrados: ${projects.map((p) => `${p.name} (${p.id})`).join(', ')}`);

  const contracts = await prisma.contract.findMany({
    where: {
      projectId: { in: projectIds },
    },
    include: {
      negotiations: {
        include: {
          installments: {
            include: { payments: true },
            orderBy: { installmentNumber: 'asc' },
          },
        },
      },
    },
  });

  console.log(`📄 Total de contratos para atualizar: ${contracts.length}`);

  let updatedContracts = 0;
  let updatedNegotiations = 0;
  let updatedInstallments = 0;
  let updatedPayments = 0;

  for (const contract of contracts) {
    // 1. Atualizar Contrato
    await prisma.contract.update({
      where: { id: contract.id },
      data: { totalValue: 1000 },
    });
    updatedContracts++;

    // 2. Atualizar Negociações
    for (const neg of contract.negotiations) {
      const numParcels = neg.installmentCount || neg.installments.length || 1;
      const isPaidVista = numParcels === 1 && neg.installments[0]?.status === 'PAID';

      await prisma.negotiation.update({
        where: { id: neg.id },
        data: {
          totalValue: 1000,
          downPayment: isPaidVista ? 1000 : 0,
          financedAmount: isPaidVista ? 0 : 1000,
        },
      });
      updatedNegotiations++;

      // 3. Atualizar Parcelas
      const baseAmount = Number((1000 / numParcels).toFixed(2));

      for (let i = 0; i < neg.installments.length; i++) {
        const inst = neg.installments[i];
        const isLast = i === neg.installments.length - 1;
        const newAmount = isLast
          ? Number((1000 - baseAmount * (numParcels - 1)).toFixed(2))
          : baseAmount;

        const isPaid = inst.status === 'PAID';
        const newPaidAmount = isPaid ? newAmount : 0;

        await prisma.installment.update({
          where: { id: inst.id },
          data: {
            amount: newAmount,
            paidAmount: newPaidAmount,
          },
        });
        updatedInstallments++;

        // 4. Atualizar Pagamentos vinculados
        for (const pay of inst.payments) {
          await prisma.payment.update({
            where: { id: pay.id },
            data: {
              amount: newAmount,
            },
          });
          updatedPayments++;
        }
      }
    }
  }

  console.log('\n📊 [RESUMO DA ATUALIZAÇÃO]');
  console.log(`✅ Contratos atualizados para R$ 1.000,00: ${updatedContracts}`);
  console.log(`✅ Negociações atualizadas: ${updatedNegotiations}`);
  console.log(`✅ Parcelas recalculadas: ${updatedInstallments}`);
  console.log(`✅ Pagamentos ajustados: ${updatedPayments}`);
  console.log('\n✨ Concluído com sucesso!');
}

main()
  .catch((err) => {
    console.error('❌ Erro:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

