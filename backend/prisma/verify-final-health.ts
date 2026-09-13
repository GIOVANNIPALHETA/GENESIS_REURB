import { prisma } from '../src/prisma/client';

async function verifyHealth() {
  console.log('=== VERIFICAÇÃO DE INTEGRIDADE GERAL DOS PROJETOS ÁGUA BOA ===\n');

  const projects = await prisma.project.findMany({
    where: { OR: [{ id: 'project-3486-agua-boa' }, { id: 'project-1493-agua-boa' }] },
    include: {
      lots: {
        include: {
          occupancies: { where: { current: true, type: 'OWNER' }, include: { person: true } },
          contracts: {
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
          },
        },
      },
    },
  });

  let totalLots = 0;
  let totalLotsWithNeg = 0;
  let totalInstallments = 0;
  let totalPaidInstallments = 0;
  let totalPaidValue = 0;
  let totalPendingValue = 0;
  let sequenceErrors: string[] = [];
  let ghostErrors: string[] = [];
  let lateStartErrors: string[] = [];

  for (const p of projects) {
    console.log(`\nProjeto: ${p.name} (ID: ${p.id})`);
    console.log(`Total de lotes no projeto: ${p.lots.length}`);

    for (const l of p.lots) {
      totalLots++;
      const contract = l.contracts[0];
      const neg = contract?.negotiations[0];
      if (!neg) continue;
      totalLotsWithNeg++;

      const insts = neg.installments;
      totalInstallments += insts.length;

      for (const i of insts) {
        if (i.status === 'PAID') {
          totalPaidInstallments++;
          totalPaidValue += i.paidAmount || i.amount;
        } else {
          totalPendingValue += i.amount;
        }
      }

      // 1. Verificar se a contagem bate com o plano
      if (insts.length !== neg.installmentCount) {
        ghostErrors.push(`Lote ${l.number} (${p.name}): neg.installmentCount = ${neg.installmentCount}, mas tem ${insts.length} parcelas`);
      }

      // 2. Se tiver parcelas parceladas (> 1), verificar data de início
      if (insts.length > 1) {
        if (insts[0].dueDate.getFullYear() >= 2026) {
          lateStartErrors.push(`Lote ${l.number} (${p.name}): 1ª parcela começa em ${insts[0].dueDate.toLocaleDateString('pt-BR')}`);
        }

        // 3. Verificar sequência mês a mês
        for (let idx = 0; idx < insts.length - 1; idx++) {
          const d1 = insts[idx].dueDate;
          const d2 = insts[idx + 1].dueDate;
          const diff = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
          if (diff !== 1) {
            sequenceErrors.push(
              `Lote ${l.number} (${p.name}): P${insts[idx].installmentNumber} (${d1.toLocaleDateString('pt-BR')}) -> P${insts[idx + 1].installmentNumber} (${d2.toLocaleDateString('pt-BR')}) [salto de ${diff} meses]`
            );
          }
        }
      }
    }
  }

  console.log('\n================ RESUMO GERAL DE SAÚDE ================');
  console.log(`Total de Lotes nos 2 projetos: ${totalLots}`);
  console.log(`Lotes com contratos/negociação ativa: ${totalLotsWithNeg}`);
  console.log(`Total de parcelas registradas: ${totalInstallments}`);
  console.log(`Parcelas pagas: ${totalPaidInstallments} (Total: R$ ${totalPaidValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`);
  console.log(`Parcelas pendentes: ${totalInstallments - totalPaidInstallments} (Total: R$ ${totalPendingValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`);

  console.log(`\nErros de sequência de meses: ${sequenceErrors.length}`);
  if (sequenceErrors.length > 0) {
    sequenceErrors.forEach((e) => console.log('  ❌', e));
  } else {
    console.log('  ✅ NENHUM erro de sequência! 100% consecutivas.');
  }

  console.log(`\nErros de parcelas fantasmas/discrepâncias de plano: ${ghostErrors.length}`);
  if (ghostErrors.length > 0) {
    ghostErrors.forEach((e) => console.log('  ❌', e));
  } else {
    console.log('  ✅ NENHUMA parcela fantasma! Todos os planos fechados corretamente.');
  }

  console.log(`\nInícios tardios em 2026: ${lateStartErrors.length}`);
  if (lateStartErrors.length > 0) {
    lateStartErrors.forEach((e) => console.log('  ❌', e));
  } else {
    console.log('  ✅ NENHUM contrato parcelado começando em 2026!');
  }
}

verifyHealth().finally(() => prisma.$disconnect());

