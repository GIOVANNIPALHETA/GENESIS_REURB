import { prisma } from '../src/prisma/client';

async function removeWrongImports() {
  console.log('🧹 Iniciando limpeza de cadastros indevidos...');

  const invalidNames = [
    'DANIELLA KEIKO',
    'SIMONI DE BRIDA',
    'INÊZ BONETTI',
    'INEZ BONETTI',
    'ASAAS GESTAO',
    'ASAAS GESTÃO',
  ];

  for (const name of invalidNames) {
    const people = await prisma.person.findMany({
      where: {
        fullName: { contains: name, mode: 'insensitive' },
      },
      include: {
        contracts: {
          include: {
            negotiations: {
              include: {
                installments: {
                  include: {
                    payments: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    for (const person of people) {
      console.log(`\nRemovendo registros de: ${person.fullName} (ID: ${person.id})`);

      // 1. Remover pagamentos, parcelas e negociações dos contratos
      for (const contract of person.contracts) {
        for (const neg of contract.negotiations) {
          for (const inst of neg.installments) {
            await prisma.payment.deleteMany({ where: { installmentId: inst.id } });
          }
          await prisma.installment.deleteMany({ where: { negotiationId: neg.id } });
        }
        await prisma.negotiation.deleteMany({ where: { contractId: contract.id } });
        await prisma.contractChain.deleteMany({ where: { contractId: contract.id } });
        await prisma.contract.delete({ where: { id: contract.id } });
        console.log(`  - Contrato ${contract.contractNumber} removido.`);
      }

      // 2. Remover ocupações indevidas vinculadas a lotes
      await prisma.occupancy.deleteMany({ where: { personId: person.id } });

      // 3. Remover documentos e cônjuges
      await prisma.document.deleteMany({ where: { personId: person.id } });
      await prisma.spouse.deleteMany({ where: { personId: person.id } });
      await prisma.serviceRecord.deleteMany({ where: { personId: person.id } });

      // 4. Remover a pessoa
      await prisma.person.delete({ where: { id: person.id } });
      console.log(`  ✅ Pessoa ${person.fullName} excluída com sucesso.`);
    }
  }

  console.log('\n✨ Limpeza finalizada!');
}

removeWrongImports()
  .catch((e) => console.error('Erro na limpeza:', e))
  .finally(() => prisma.$disconnect());
