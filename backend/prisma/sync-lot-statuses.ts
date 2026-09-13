import { PrismaClient, LotStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 SINCRONIZANDO STATUS DOS LOTES COM CONTRATOS ATIVOS...');

  const lotsToUpdate = await prisma.lot.findMany({
    where: {
      contracts: { some: { status: 'ACTIVE' } },
      status: 'NOT_SIGNED'
    },
    select: { id: true, number: true }
  });

  console.log(`Total de lotes a atualizar: ${lotsToUpdate.length}`);

  const res = await prisma.lot.updateMany({
    where: {
      id: { in: lotsToUpdate.map(l => l.id) }
    },
    data: {
      status: LotStatus.CONTRACT_SIGNED
    }
  });

  console.log(`✅ Lotes atualizados para CONTRACT_SIGNED: ${res.count}`);

  // Verificar Lote 50 de TECO
  const lot50 = await prisma.lot.findFirst({
    where: {
      project: { name: { contains: 'TECO', mode: 'insensitive' } },
      block: { number: '3' },
      number: '50'
    }
  });

  console.log(`Lote 50 Quadra 3 status atual: ${lot50?.status}`);
}

main().finally(() => prisma.$disconnect());
