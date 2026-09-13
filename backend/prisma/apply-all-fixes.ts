import fs from 'fs';
import path from 'path';
import { prisma } from '../src/prisma/client';

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let inQuotes = false;
  let current = '';

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (c === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push(current);
      current = '';
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') i++;
      row.push(current);
      if (row.some((cell) => cell.trim().length > 0)) rows.push(row);
      row = [];
      current = '';
    } else {
      current += c;
    }
  }
  if (current || row.length) {
    row.push(current);
    if (row.some((cell) => cell.trim().length > 0)) rows.push(row);
  }
  return rows;
}

function parseDate(val: string): Date | null {
  if (!val) return null;
  const match = val.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    return new Date(
      parseInt(match[3], 10),
      parseInt(match[2], 10) - 1,
      parseInt(match[1], 10),
      12,
      0,
      0
    );
  }
  return null;
}

function parseMoney(val: string): number {
  if (!val) return 0;
  const clean = val
    .replace(/R\$\s?/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '')
    .trim();
  return parseFloat(clean) || 0;
}

function addMonths(baseDate: Date, monthsToAdd: number, targetDay?: number): Date {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const day = targetDay !== undefined ? targetDay : baseDate.getDate();
  return new Date(year, month + monthsToAdd, day, 12, 0, 0);
}

async function run() {
  console.log('=== APLICANDO CORREÇÃO COMPLETA DE PARCELAS E SEQUÊNCIAS ÁGUA BOA ===\n');

  const filePath = path.resolve(__dirname, '../../uploads/documents/Meu_Dinheiro_20260905161436.csv');
  const rows = parseCSV(fs.readFileSync(filePath, 'utf8'));
  const headers = rows[0];
  const descIdx = headers.indexOf('Descrição');
  const statusIdx = headers.indexOf('Status');
  const dataEfetivaIdx = headers.indexOf('Data efetiva');
  const dataPrevistaIdx = headers.indexOf('Data prevista');
  const valorEfetivoIdx = headers.indexOf('Valor efetivo');
  const valorPrevistoIdx = headers.indexOf('Valor previsto');
  const idUnicoIdx = headers.indexOf('ID Único');

  // 1. Corrigir Lot 108 vs Lot 109
  // Desvincular os asaasPaymentId de Valmir Ribeiro (306263289, 306263290, 306263291, 306263292) do Lote 109
  const lot109 = await prisma.lot.findFirst({
    where: { number: '109', project: { id: 'project-3486-agua-boa' } },
    include: {
      contracts: {
        include: {
          negotiations: {
            include: { installments: { orderBy: { installmentNumber: 'asc' } } },
          },
        },
      },
    },
  });

  if (lot109) {
    const insts109 = lot109.contracts[0]?.negotiations[0]?.installments || [];
    for (const inst of insts109) {
      if (['306263289', '306263290', '306263291', '306263292'].includes(inst.asaasPaymentId || '')) {
        await prisma.installment.update({
          where: { id: inst.id },
          data: {
            asaasPaymentId: null,
            status: 'PENDING',
            paidAmount: 0,
            dueDate: new Date(2025, 5 + (inst.installmentNumber - 1), 10, 12, 0, 0),
          },
        });
      }
    }
  }

  // 2. Vincular as 10 parcelas de Valmir Ribeiro ao Lote 108
  const lot108 = await prisma.lot.findFirst({
    where: { number: '108', project: { id: 'project-3486-agua-boa' } },
    include: {
      contracts: {
        include: {
          negotiations: {
            include: { installments: { orderBy: { installmentNumber: 'asc' } } },
          },
        },
      },
    },
  });

  if (lot108) {
    const valmirRows = rows.filter((r) => r[descIdx]?.includes('VALMIR RIBEIRO 1083486'));
    const insts108 = lot108.contracts[0]?.negotiations[0]?.installments || [];
    for (const vr of valmirRows) {
      const allParcMatches = [...vr[descIdx].matchAll(/(\d+)\s*\/\s*(\d+)/g)];
      if (allParcMatches.length === 0) continue;
      const lastMatch = allParcMatches[allParcMatches.length - 1];
      const pNum = parseInt(lastMatch[1], 10);
      const asaasId = vr[idUnicoIdx] ? String(vr[idUnicoIdx]).trim() : null;
      const dPrev = parseDate(vr[dataPrevistaIdx]);
      const status = vr[statusIdx] === 'Confirmado' ? 'PAID' : 'PENDING';
      const valor = parseMoney(vr[valorPrevistoIdx]) || 100;
      const valorEf = parseMoney(vr[valorEfetivoIdx]) || 0;

      const inst = insts108.find((i) => i.installmentNumber === pNum);
      if (asaasId) {
        const prevInst = await prisma.installment.findUnique({ where: { asaasPaymentId: asaasId } });
        if (prevInst && (!inst || prevInst.id !== inst.id)) {
          await prisma.payment.deleteMany({ where: { installmentId: prevInst.id } });
          await prisma.installment.update({
            where: { id: prevInst.id },
            data: { asaasPaymentId: null, status: 'PENDING', paidAmount: 0 },
          });
        }
      }

      if (inst && asaasId && dPrev) {
        await prisma.installment.update({
          where: { id: inst.id },
          data: {
            asaasPaymentId: asaasId,
            dueDate: dPrev,
            amount: valor,
            paidAmount: status === 'PAID' ? valorEf : 0,
            status: status as any,
          },
        });
        if (status === 'PAID') {
          const existingPay = await prisma.payment.findFirst({ where: { installmentId: inst.id } });
          if (!existingPay) {
            await prisma.payment.create({
              data: {
                installmentId: inst.id,
                accountId: 'account-asaas',
                amount: valorEf,
                paymentDate: dPrev,
                paymentMethod: 'ASAAS',
              },
            });
          }
        }
      }
    }
  }

  // 3. Corrigir Lot 81 (3486) e Lot 53 (1493) - Euveni Postai
  const lot81 = await prisma.lot.findFirst({
    where: { number: '81', project: { id: 'project-3486-agua-boa' } },
    include: {
      contracts: {
        include: {
          negotiations: {
            include: { installments: { orderBy: { installmentNumber: 'asc' } } },
          },
        },
      },
    },
  });

  const lot53_1493 = await prisma.lot.findFirst({
    where: { number: '53', project: { id: 'project-1493-agua-boa' } },
    include: {
      contracts: {
        include: {
          negotiations: {
            include: { installments: { orderBy: { installmentNumber: 'asc' } } },
          },
        },
      },
    },
  });

  if (lot81 && lot53_1493) {
    const euveniRows = rows.filter((r) => r[descIdx]?.includes('531493'));
    const insts81 = lot81.contracts[0]?.negotiations[0]?.installments || [];
    const insts53 = lot53_1493.contracts[0]?.negotiations[0]?.installments || [];

    for (const er of euveniRows) {
      const allParcMatches = [...er[descIdx].matchAll(/(\d+)\s*\/\s*(\d+)/g)];
      if (allParcMatches.length === 0) continue;
      const lastMatch = allParcMatches[allParcMatches.length - 1];
      const pNum = parseInt(lastMatch[1], 10);
      const asaasId = er[idUnicoIdx] ? String(er[idUnicoIdx]).trim() : null;
      const dPrev = parseDate(er[dataPrevistaIdx]);
      const status = er[statusIdx] === 'Confirmado' ? 'PAID' : 'PENDING';
      const valor = parseMoney(er[valorPrevistoIdx]) || 100;
      const valorEf = parseMoney(er[valorEfetivoIdx]) || 0;

      // Remover de onde estiver
      const inst53 = insts53.find((i) => i.installmentNumber === pNum);
      if (asaasId) {
        const prevInst = await prisma.installment.findUnique({ where: { asaasPaymentId: asaasId } });
        if (prevInst && (!inst53 || prevInst.id !== inst53.id)) {
          await prisma.payment.deleteMany({ where: { installmentId: prevInst.id } });
          await prisma.installment.update({
            where: { id: prevInst.id },
            data: { asaasPaymentId: null, status: 'PENDING', paidAmount: 0 },
          });
        }
      }

      // Adicionar no 53
      if (inst53 && asaasId && dPrev) {
        await prisma.installment.update({
          where: { id: inst53.id },
          data: {
            asaasPaymentId: asaasId,
            dueDate: dPrev,
            amount: valor,
            paidAmount: status === 'PAID' ? valorEf : 0,
            status: status as any,
          },
        });
        if (status === 'PAID') {
          // Check if payment already exists
          const existingPay = await prisma.payment.findFirst({ where: { installmentId: inst53.id } });
          if (!existingPay) {
            await prisma.payment.create({
              data: {
                installmentId: inst53.id,
                accountId: 'account-asaas',
                amount: valorEf,
                paymentDate: dPrev,
                paymentMethod: 'ASAAS',
              },
            });
          }
        }
      }
    }
  }

  // 4. Corrigir Lot 55 (1493) - Devanira Alves (551493)
  const lot55_1493 = await prisma.lot.findFirst({
    where: { number: '55', project: { id: 'project-1493-agua-boa' } },
    include: {
      contracts: {
        include: {
          negotiations: {
            include: { installments: { orderBy: { installmentNumber: 'asc' } } },
          },
        },
      },
    },
  });

  if (lot55_1493) {
    const devanira55Rows = rows.filter((r) => r[descIdx]?.includes('551493'));
    const insts55 = lot55_1493.contracts[0]?.negotiations[0]?.installments || [];
    for (const dr of devanira55Rows) {
      const allParcMatches = [...dr[descIdx].matchAll(/(\d+)\s*\/\s*(\d+)/g)];
      if (allParcMatches.length === 0) continue;
      const lastMatch = allParcMatches[allParcMatches.length - 1];
      const pNum = parseInt(lastMatch[1], 10);
      const asaasId = dr[idUnicoIdx] ? String(dr[idUnicoIdx]).trim() : null;
      const dPrev = parseDate(dr[dataPrevistaIdx]);
      const status = dr[statusIdx] === 'Confirmado' ? 'PAID' : 'PENDING';
      const valor = parseMoney(dr[valorPrevistoIdx]) || 100;
      const valorEf = parseMoney(dr[valorEfetivoIdx]) || 0;

      const inst55 = insts55.find((i) => i.installmentNumber === pNum);
      if (asaasId) {
        const prevInst = await prisma.installment.findUnique({ where: { asaasPaymentId: asaasId } });
        if (prevInst && (!inst55 || prevInst.id !== inst55.id)) {
          await prisma.payment.deleteMany({ where: { installmentId: prevInst.id } });
          await prisma.installment.update({
            where: { id: prevInst.id },
            data: { asaasPaymentId: null, status: 'PENDING', paidAmount: 0 },
          });
        }
      }

      if (inst55 && asaasId && dPrev) {
        await prisma.installment.update({
          where: { id: inst55.id },
          data: {
            asaasPaymentId: asaasId,
            dueDate: dPrev,
            amount: valor,
            paidAmount: status === 'PAID' ? valorEf : 0,
            status: status as any,
          },
        });
        if (status === 'PAID') {
          const existingPay = await prisma.payment.findFirst({ where: { installmentId: inst55.id } });
          if (!existingPay) {
            await prisma.payment.create({
              data: {
                installmentId: inst55.id,
                accountId: 'account-asaas',
                amount: valorEf,
                paymentDate: dPrev,
                paymentMethod: 'ASAAS',
              },
            });
          }
        }
      }
    }
  }

  // 5. Agora executar o ajuste completo de datas consecutivas e remoção de fantasmas
  // em TODOS os lotes dos dois projetos
  const allProjects = await prisma.project.findMany({
    where: { OR: [{ id: 'project-3486-agua-boa' }, { id: 'project-1493-agua-boa' }] },
    include: {
      lots: {
        include: {
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

  for (const p of allProjects) {
    for (const l of p.lots) {
      const contract = l.contracts[0];
      const negotiation = contract?.negotiations[0];
      if (!negotiation) continue;

      const insts = negotiation.installments;
      const count = insts.length;

      // Se tiver mais de 1 parcela, garantir sequência perfeita
      if (count > 1) {
        // Encontrar parcela de referência válida
        // Preferir a primeira parcela com asaasPaymentId
        const instWithAsaas = insts.find((i) => i.asaasPaymentId);
        let refDate: Date;
        let refParc: number;
        let refDay: number;

        if (instWithAsaas) {
          refDate = instWithAsaas.dueDate;
          refParc = instWithAsaas.installmentNumber;
          refDay = refDate.getDate();
        } else {
          // Padrão: 10/06/2025
          refDate = new Date(2025, 5, 10, 12, 0, 0);
          refParc = 1;
          refDay = 10;
        }

        for (let pNum = 1; pNum <= count; pNum++) {
          const inst = insts.find((i) => i.installmentNumber === pNum);
          if (!inst) continue;

          // Se a parcela NÃO tem Asaas ID, garantir que a data segue estritamente a sequência
          if (!inst.asaasPaymentId) {
            const offset = pNum - refParc;
            const targetDate = addMonths(refDate, offset, refDay);
            if (inst.dueDate.toLocaleDateString('pt-BR') !== targetDate.toLocaleDateString('pt-BR')) {
              await prisma.installment.update({
                where: { id: inst.id },
                data: { dueDate: targetDate },
              });
            }
          }
        }
      }
    }
  }

  // 6. VERIFICAÇÃO FINAL RIGOROSA
  console.log('\n=== VERIFICAÇÃO FINAL APÓS TODAS AS CORREÇÕES ===');
  const verifyProjects = await prisma.project.findMany({
    where: { OR: [{ id: 'project-3486-agua-boa' }, { id: 'project-1493-agua-boa' }] },
    include: {
      lots: {
        include: {
          occupancies: { where: { current: true, type: 'OWNER' }, include: { person: true } },
          contracts: {
            include: {
              negotiations: {
                include: {
                  installments: { orderBy: { installmentNumber: 'asc' } },
                },
              },
            },
          },
        },
      },
    },
  });

  let verifiedCount = 0;
  let brokenCount = 0;
  let lateCount = 0;

  for (const p of verifyProjects) {
    for (const l of p.lots) {
      const contract = l.contracts[0];
      const neg = contract?.negotiations[0];
      if (!neg) continue;
      verifiedCount++;

      const insts = neg.installments;
      if (insts.length > 1) {
        if (insts[0].dueDate.getFullYear() >= 2026) {
          lateCount++;
          console.log(`AVISO: Lote ${l.number} (${p.name}) começa em ${insts[0].dueDate.toLocaleDateString('pt-BR')}`);
        }

        for (let i = 0; i < insts.length - 1; i++) {
          const d1 = insts[i].dueDate;
          const d2 = insts[i + 1].dueDate;
          const diff = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
          if (diff !== 1) {
            brokenCount++;
            console.log(
              `ERRO: Lote ${l.number} (${p.name}): P${insts[i].installmentNumber} (${d1.toLocaleDateString('pt-BR')}) -> P${insts[i + 1].installmentNumber} (${d2.toLocaleDateString('pt-BR')})`
            );
          }
        }
      }
    }
  }

  console.log(`\nLotes verificados: ${verifiedCount}`);
  console.log(`Sequências quebradas: ${brokenCount}`);
  console.log(`Inícios tardios em 2026: ${lateCount}`);

  if (brokenCount === 0 && lateCount === 0) {
    console.log('\n=============================================================');
    console.log('🎉 100% DOS LOTES E PARCELAS ESTÃO EM ORDEM CRONOLÓGICA PERFEITA!');
    console.log('=============================================================');
  }
}

run()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
