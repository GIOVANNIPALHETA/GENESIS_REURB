import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const lotsWithContracts = await prisma.lot.findMany({
    where: {
      contracts: { some: { status: 'ACTIVE' } },
      status: 'NOT_SIGNED'
    },
    include: {
      block: true,
      project: true,
      contracts: { include: { person: true } }
    }
  });

  console.log(`Lotes com contrato ATIVO mas status NOT_SIGNED: ${lotsWithContracts.length}`);
  lotsWithContracts.forEach(l => {
    console.log(`- ${l.project.name} | Qd ${l.block.number} Lt ${l.number} | Contrato: ${l.contracts[0]?.contractNumber} (${l.contracts[0]?.person.fullName})`);
  });
}

main().finally(() => prisma.$disconnect());
