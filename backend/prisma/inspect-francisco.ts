import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const person = await prisma.person.findFirst({
    where: {
      OR: [
        { fullName: { contains: 'FRANCISCO DAMIÃO', mode: 'insensitive' } },
        { cpf: { contains: '33451427320' } },
        { cpf: { contains: '334.514.273-20' } }
      ]
    },
    include: {
      contracts: {
        include: {
          lot: { include: { block: true, project: true } },
          negotiations: {
            include: {
              installments: {
                orderBy: { installmentNumber: 'asc' },
                include: { payments: true }
              }
            }
          }
        }
      }
    }
  });

  console.log('=== FRANCISCO DAMIÃO DE OLIVEIRA ===');
  console.log('ID:', person?.id);
  console.log('Nome:', person?.fullName);
  console.log('CPF:', person?.cpf);

  person?.contracts.forEach(c => {
    console.log(`\nContrato: ${c.contractNumber} | Lote: ${c.lot?.project.name} Qd ${c.lot?.block.number} Lt ${c.lot?.number} | Valor: ${c.totalValue}`);
    c.negotiations.forEach(n => {
      console.log(`  Negociação: entrada=${n.downPayment}, parcelas=${n.installmentCount}`);
      n.installments.forEach(i => {
        console.log(`    Parc #${i.installmentNumber} (${i.dueDate.toISOString().split('T')[0]}) R$ ${i.amount} | Status: ${i.status} | Pagamentos: ${i.payments.length}`);
        i.payments.forEach(p => {
          console.log(`      -> Pgto: R$ ${p.amount} em ${p.paymentDate.toISOString().split('T')[0]} via ${p.paymentMethod} (Desc: ${p.description})`);
        });
      });
    });
  });

  // Também verificar as contas financeiras (ex: dinheiro em caixa vs asaas)
  const accounts = await prisma.financialAccount.findMany();
  console.log('\nContas:', accounts.map(a => ({ id: a.id, name: a.name, type: a.type })));
}

main().finally(() => prisma.$disconnect());
