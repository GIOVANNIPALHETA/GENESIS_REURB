import { prisma } from '../src/prisma/client';

async function main() {
  console.log('🚀 Iniciando unificação dos projetos Pôr do Sol e migração do Lote AD-JANETE...\n');

  const chacaraId = 'project-chacara-por-do-sol';
  const juaraId = 'project-por-do-sol-juara';
  const janeteLotId = '330a64ca-b0dd-45d1-91bd-fb3b2fa10eb1';
  const janeteContractId = '366e3e58-2be4-4c78-b150-c374e2f3aaed';

  await prisma.$transaction(async (tx) => {
    // 1. Obter Quadra 1 oficial de PÔR DO SOL - JUARA
    const juaraQuadra1 = await tx.block.findFirst({
      where: { projectId: juaraId, number: '1' },
    });
    if (!juaraQuadra1) {
      throw new Error('Quadra 1 de PÔR DO SOL - JUARA não encontrada!');
    }
    console.log(`📍 Quadra 1 de PÔR DO SOL - JUARA localizada (ID: ${juaraQuadra1.id})`);

    // 2. Mover Lote 01 e Lote 02 de CHACARA POR DO SOL para Quadra 1 de PÔR DO SOL - JUARA
    const chacaraLots = await tx.lot.findMany({
      where: { projectId: chacaraId },
    });
    for (const lot of chacaraLots) {
      await tx.lot.update({
        where: { id: lot.id },
        data: {
          projectId: juaraId,
          blockId: juaraQuadra1.id,
          address: lot.address ? lot.address.replace(/Chácara Pôr do Sol/gi, 'Pôr do Sol') : null,
        },
      });
      console.log(`   ✅ Lote ${lot.number} movido para PÔR DO SOL - JUARA (Quadra 1)`);
    }

    // 3. Atualizar contratos de CHACARA POR DO SOL para PÔR DO SOL - JUARA
    const chacaraContracts = await tx.contract.findMany({
      where: { projectId: chacaraId },
    });
    for (const contract of chacaraContracts) {
      await tx.contract.update({
        where: { id: contract.id },
        data: { projectId: juaraId },
      });
      console.log(`   📄 Contrato ${contract.contractNumber} atualizado para PÔR DO SOL - JUARA`);
    }

    // 4. Remover Quadra 1 residual e Projeto CHACARA POR DO SOL
    const oldChacaraBlocks = await tx.block.findMany({ where: { projectId: chacaraId } });
    for (const b of oldChacaraBlocks) {
      await tx.block.delete({ where: { id: b.id } });
      console.log(`   🗑️  Quadra residual ${b.number} removida de CHACARA POR DO SOL`);
    }
    await tx.project.delete({ where: { id: chacaraId } });
    console.log(`   ✨ Projeto CHACARA POR DO SOL unificado e removido com sucesso.`);

    // 5. Criar ou obter Quadra "A DEFINIR" em PÔR DO SOL - JUARA
    let juaraPendingBlock = await tx.block.findFirst({
      where: { projectId: juaraId, number: 'A DEFINIR' },
    });
    if (!juaraPendingBlock) {
      juaraPendingBlock = await tx.block.create({
        data: {
          projectId: juaraId,
          number: 'A DEFINIR',
          description: 'Setor de Contratos e Lotes em Identificação Topográfica',
        },
      });
      console.log(`   🧱 Quadra "A DEFINIR" criada em PÔR DO SOL - JUARA (ID: ${juaraPendingBlock.id})`);
    }

    // 6. Migrar Lote AD-JANETE para PÔR DO SOL - JUARA na Quadra "A DEFINIR"
    await tx.lot.update({
      where: { id: janeteLotId },
      data: {
        projectId: juaraId,
        blockId: juaraPendingBlock.id,
        observations: 'Lote em identificação cadastral para Janete Vicente Nascimento (CPF: 89979818115) - Projeto Pôr do Sol',
      },
    });
    console.log(`   🏡 Lote AD-JANETE migrado com sucesso para PÔR DO SOL - JUARA (Quadra A DEFINIR)`);

    // 7. Migrar Contrato de Janete para PÔR DO SOL - JUARA
    await tx.contract.update({
      where: { id: janeteContractId },
      data: {
        projectId: juaraId,
      },
    });
    console.log(`   📑 Contrato CTR-PEND-JANETE migrado com sucesso para PÔR DO SOL - JUARA`);

    // 8. Atualizar contadores de blocos e lotes de PÔR DO SOL - JUARA
    const totalBlocks = await tx.block.count({ where: { projectId: juaraId } });
    const totalLots = await tx.lot.count({ where: { projectId: juaraId } });

    await tx.project.update({
      where: { id: juaraId },
      data: {
        name: 'PÔR DO SOL - JUARA',
        plannedBlocks: totalBlocks,
        plannedLots: totalLots,
      },
    });
    console.log(`\n📊 PÔR DO SOL - JUARA atualizado com ${totalBlocks} quadras e ${totalLots} lotes.`);
  });

  console.log('\n🎉 Unificação e migração concluídas com 100% de sucesso!');
}

main()
  .catch((err) => {
    console.error('❌ Erro na execução:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
