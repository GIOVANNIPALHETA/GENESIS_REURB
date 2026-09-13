import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const person = await prisma.person.findFirst({
    where: {
      OR: [
        { fullName: { contains: 'JOAO BOSCO', mode: 'insensitive' } },
        { fullName: { contains: 'JOÃO BOSCO', mode: 'insensitive' } },
        { cpf: { contains: '81336071168' } },
        { cpf: { contains: '813.360.711-68' } }
      ]
    },
    include: {
      occupancies: {
        include: {
          lot: { include: { block: true, project: true } }
        }
      },
      contracts: {
        include: {
          lot: { include: { block: true, project: true } },
          negotiations: {
            include: {
              installments: {
                take: 3,
                include: { payments: true }
              }
            }
          }
        }
      }
    }
  });

  console.log('=== JOAO BOSCO BUENO VALADARES ===');
  console.log('ID:', person?.id);
  console.log('Nome:', person?.fullName);
  console.log('CPF:', person?.cpf);

  console.log('\n--- Ocupações ---');
  person?.occupancies.forEach(o => {
    console.log(`- ${o.lot.project.name} Qd ${o.lot.block.number} Lt ${o.lot.number} (Tipo: ${o.type}, Current: ${o.current})`);
  });

  console.log('\n--- Contratos ---');
  person?.contracts.forEach(c => {
    console.log(`- Contrato: ${c.contractNumber} | Lote: ${c.lot ? `${c.lot.project.name} Qd ${c.lot.block.number} Lt ${c.lot.number} (LotID: ${c.lotId})` : 'Sem lote'} | Status: ${c.status}`);
  });

  // Verificar o Lote 50 da Quadra 3 no TECO
  const lot50 = await prisma.lot.findFirst({
    where: {
      project: { name: { contains: 'TECO', mode: 'insensitive' } },
      block: { number: '3' },
      number: '50'
    },
    include: {
      occupancies: { include: { person: true } },
      contracts: { include: { person: true } }
    }
  });

  console.log('\n=== LOTE TECO QD 3 LT 50 ===');
  console.log('Lot ID:', lot50?.id);
  console.log('Lot Number:', lot50?.number);
  console.log('Lot Status:', lot50?.status);
  console.log('Occupancies:', lot50?.occupancies.map(o => `${o.person.fullName} (${o.person.cpf}) [Tipo: ${o.type}, Current: ${o.current}]`));
  console.log('Contracts:', lot50?.contracts.map(c => `${c.contractNumber} (${c.person.fullName})`));
}

main().finally(() => prisma.$disconnect());
