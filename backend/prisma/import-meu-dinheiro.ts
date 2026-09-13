import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import {
  PrismaClient,
  LotStatus,
  PaymentMethod,
  PaymentStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

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

async function main() {
  console.log('🚀 [INÍCIO] Importação de pagamentos do arquivo Meu Dinheiro...');

  // 1. Localizar arquivo CSV
  const fileCandidates = [
    path.resolve(process.cwd(), '../uploads/documents/Meu_Dinheiro_20260905161436.csv'),
    path.resolve(process.cwd(), 'uploads/documents/Meu_Dinheiro_20260905161436.csv'),
    path.resolve(process.cwd(), '../uploads/Meu_Dinheiro_20260905161436.csv'),
    path.resolve(process.cwd(), 'uploads/Meu_Dinheiro_20260905161436.csv'),
  ];
  const filePath = fileCandidates.find((f) => fs.existsSync(f));
  if (!filePath) {
    throw new Error('Arquivo Meu_Dinheiro_20260905161436.csv não encontrado.');
  }
  console.log(`📄 Arquivo localizado: ${filePath}`);

  const content = fs.readFileSync(filePath, 'utf8');
  const rows = parseCSV(content);
  const headers = rows[0];

  const descIdx = headers.indexOf('Descrição');
  const statusIdx = headers.indexOf('Status');
  const dataEfetivaIdx = headers.indexOf('Data efetiva');
  const dataPrevistaIdx = headers.indexOf('Data prevista');
  const valorEfetivoIdx = headers.indexOf('Valor efetivo');
  const valorPrevistoIdx = headers.indexOf('Valor previsto');
  const idUnicoIdx = headers.indexOf('ID Único');

  console.log(`📋 Total de registros no arquivo: ${rows.length - 1}`);

  // 2. Carregar todos os lotes existentes dos projetos Água Boa (SEM CRIAR LOTES NOVOS)
  const projects = await prisma.project.findMany({
    where: {
      OR: [
        { id: 'project-3486-agua-boa' },
        { id: 'project-1493-agua-boa' },
      ],
    },
    include: {
      lots: {
        include: {
          occupancies: {
            where: { current: true, type: 'OWNER' },
            include: { person: true },
          },
          contracts: {
            include: {
              negotiations: {
                include: {
                  installments: {
                    include: { payments: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const allLots: any[] = [];
  projects.forEach((p) => {
    p.lots.forEach((l) => {
      allLots.push({
        ...l,
        projectName: p.name,
        matricula: l.registration || (p.id.includes('3486') ? '3486' : '1493'),
      });
    });
  });

  console.log(`🏡 Total de lotes existentes nos projetos Água Boa: ${allLots.length}`);

  let updatedPayments = 0;
  let updatedInstallments = 0;
  let createdInstallments = 0;
  let confirmedCount = 0;
  let pendingCount = 0;
  let totalPaidAmount = 0;
  let totalPendingAmount = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const desc = row[descIdx] || '';
    const status = row[statusIdx];
    const valorEfetivo = parseMoney(row[valorEfetivoIdx]);
    const valorPrevisto = parseMoney(row[valorPrevistoIdx]);
    const dataEfetiva = parseDate(row[dataEfetivaIdx]);
    const dataPrevista = parseDate(row[dataPrevistaIdx]);
    const idUnico = row[idUnicoIdx] ? String(row[idUnicoIdx]).trim() : null;

    // Extrair número da parcela e total
    const allParcMatches = [...desc.matchAll(/(\d+)\s*\/\s*(\d+)/g)];
    let parcelNumber = 1;
    let totalParcels = 10;
    if (allParcMatches.length > 0) {
      const lastMatch = allParcMatches[allParcMatches.length - 1];
      parcelNumber = parseInt(lastMatch[1], 10);
      totalParcels = parseInt(lastMatch[2], 10);
    } else {
      const singleMatch = desc.match(/\b(\d+)\s*x\b/i);
      if (singleMatch) totalParcels = parseInt(singleMatch[1], 10);
    }

    // CPF na descrição
    const cpfMatch = desc.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/) || desc.match(/\b\d{11}\b/);
    const cleanCpfMatch = cpfMatch ? cpfMatch[0].replace(/\D/g, '') : null;

    let targetLot: any = null;

    // Estratégia 1: Match por CPF
    if (cleanCpfMatch) {
      targetLot = allLots.find((l) => {
        const owner = l.occupancies[0]?.person;
        if (!owner || !owner.cpf) return false;
        return owner.cpf.replace(/\D/g, '') === cleanCpfMatch;
      });
    }

    // Estratégia 2: Match por Lote + Matrícula no texto
    if (!targetLot) {
      for (const lot of allLots) {
        const cleanLt = lot.number.replace(/[^a-zA-Z0-9]/g, '');
        const mat = lot.matricula;
        const pattern1 = new RegExp(`\\b${cleanLt}\\s*-?\\s*${mat}\\b`, 'i');
        const pattern2 = new RegExp(`\\b${cleanLt}${mat}\\b`, 'i');
        const pattern3 = new RegExp(`\\b${lot.number}\\s*-?\\s*${mat}\\b`, 'i');
        if (pattern1.test(desc) || pattern2.test(desc) || pattern3.test(desc)) {
          targetLot = lot;
          break;
        }
      }
    }

    // Estratégia 3: Match por Nome (primeiras 2 palavras ou primeiro e último nome)
    if (!targetLot) {
      for (const lot of allLots) {
        const owner = lot.occupancies[0]?.person;
        if (!owner || !owner.fullName) continue;

        const cleanOwner = owner.fullName
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toUpperCase()
          .trim();
        const cleanDesc = desc
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toUpperCase();

        if (cleanDesc.includes(cleanOwner)) {
          targetLot = lot;
          break;
        }

        const words = cleanOwner.split(' ').filter((w: string) => w.length > 2);
        if (words.length >= 2) {
          const firstWord = words[0];
          const secondWord = words[1];
          const lastWord = words[words.length - 1];
          const twoWords = `${firstWord} ${secondWord}`;

          if (cleanDesc.includes(twoWords) || (cleanDesc.includes(firstWord) && cleanDesc.includes(lastWord))) {
            if (cleanDesc.includes('3486') && !lot.matricula.includes('3486')) continue;
            if (cleanDesc.includes('1493') && !lot.matricula.includes('1493')) continue;
            targetLot = lot;
            break;
          }
        }
      }
    }

    if (!targetLot) {
      console.warn(`⚠️ Não foi possível localizar o lote para: ${desc}`);
      continue;
    }

    // Obter ou criar Contrato e Negociação no lote existente
    let contract = targetLot.contracts[0];
    if (!contract) {
      const cleanSlug = targetLot.number.replace(/[^a-zA-Z0-9]/g, '-');
      const contractNumber = `CTR-${targetLot.matricula}-1-${cleanSlug}`;
      const ownerId = targetLot.occupancies[0]?.personId;
      if (!ownerId) {
        console.warn(`⚠️ Lote ${targetLot.number} sem titular para vincular contrato.`);
        continue;
      }

      contract = await prisma.contract.create({
        data: {
          contractNumber,
          projectId: targetLot.projectId,
          lotId: targetLot.id,
          personId: ownerId,
          totalValue: 1000,
          signed: true,
          status: 'ACTIVE',
          notes: 'Criado na conciliação Meu Dinheiro',
        },
        include: {
          negotiations: {
            include: { installments: { include: { payments: true } } },
          },
        },
      });
      targetLot.contracts.push(contract);
    }

    // Obter ou criar Negociação
    let negotiation = contract.negotiations?.[0];
    if (!negotiation) {
      negotiation = await prisma.negotiation.create({
        data: {
          contractId: contract.id,
          totalValue: 1000,
          downPayment: 0,
          financedAmount: 1000,
          installmentCount: totalParcels,
          firstDueDate: dataPrevista || new Date(),
          status: 'ACTIVE',
        },
        include: {
          installments: { include: { payments: true } },
        },
      });
      contract.negotiations = [negotiation];
    }

    // Atualizar quantidade de parcelas da negociação se for maior
    if (totalParcels > negotiation.installmentCount) {
      await prisma.negotiation.update({
        where: { id: negotiation.id },
        data: { installmentCount: totalParcels },
      });
      negotiation.installmentCount = totalParcels;
    }

    // Buscar a parcela existente pelo número da parcela
    let installment = negotiation.installments?.find(
      (inst: any) => inst.installmentNumber === parcelNumber
    );

    const isConfirmed = status === 'Confirmado';
    const amountVal = valorPrevisto || valorEfetivo || 100;
    const paidVal = isConfirmed ? valorEfetivo || amountVal : 0;
    const dueDateVal = dataPrevista || (installment ? installment.dueDate : new Date());
    const paidDateVal = isConfirmed ? dataEfetiva || dataPrevista || new Date() : null;

    if (!installment) {
      // Criar nova parcela sob a negociação existente
      installment = await prisma.installment.create({
        data: {
          negotiationId: negotiation.id,
          installmentNumber: parcelNumber,
          description: `Parcela ${parcelNumber}/${totalParcels}`,
          amount: amountVal,
          dueDate: dueDateVal,
          paidAmount: paidVal,
          paidAt: paidDateVal,
          status: isConfirmed ? PaymentStatus.PAID : PaymentStatus.PENDING,
          paymentMethod: PaymentMethod.ASAAS,
          asaasPaymentId: idUnico,
        },
        include: { payments: true },
      });
      negotiation.installments.push(installment);
      createdInstallments++;
    } else {
      // Atualizar parcela existente
      if (isConfirmed) {
        await prisma.installment.update({
          where: { id: installment.id },
          data: {
            amount: amountVal,
            dueDate: dueDateVal,
            paidAmount: paidVal,
            paidAt: paidDateVal,
            status: PaymentStatus.PAID,
            paymentMethod: PaymentMethod.ASAAS,
            asaasPaymentId: idUnico || installment.asaasPaymentId,
          },
        });
        installment.status = PaymentStatus.PAID;
        installment.paidAmount = paidVal;
        installment.paidAt = paidDateVal;
      } else if (installment.status !== PaymentStatus.PAID) {
        // Se ainda está pendente, atualiza a data prevista e identificador
        await prisma.installment.update({
          where: { id: installment.id },
          data: {
            amount: amountVal,
            dueDate: dueDateVal,
            asaasPaymentId: idUnico || installment.asaasPaymentId,
          },
        });
      }
      updatedInstallments++;
    }

    // Registrar o Pagamento (Payment) caso esteja confirmado
    if (isConfirmed) {
      confirmedCount++;
      totalPaidAmount += paidVal;

      const existingPayment = await prisma.payment.findFirst({
        where: {
          OR: [
            { installmentId: installment.id },
            ...(idUnico ? [{ externalId: idUnico }] : []),
          ],
        },
      });

      if (!existingPayment) {
        await prisma.payment.create({
          data: {
            installmentId: installment.id,
            accountId: 'account-asaas',
            amount: paidVal,
            paymentDate: paidDateVal || new Date(),
            paymentMethod: PaymentMethod.ASAAS,
            externalId: idUnico,
            description: desc,
            notes: 'Importado de Meu Dinheiro',
          },
        });
        updatedPayments++;
      } else {
        await prisma.payment.update({
          where: { id: existingPayment.id },
          data: {
            amount: paidVal,
            paymentDate: paidDateVal || existingPayment.paymentDate,
            externalId: idUnico || existingPayment.externalId,
            description: desc,
          },
        });
      }

      // Garantir que o contrato esteja assinado e o lote marcado como com contrato assinado
      if (!contract.signed) {
        await prisma.contract.update({
          where: { id: contract.id },
          data: { signed: true, status: 'ACTIVE' },
        });
        contract.signed = true;
      }

      if (targetLot.status !== LotStatus.CONTRACT_SIGNED) {
        await prisma.lot.update({
          where: { id: targetLot.id },
          data: { status: LotStatus.CONTRACT_SIGNED },
        });
        targetLot.status = LotStatus.CONTRACT_SIGNED;
      }
    } else {
      pendingCount++;
      totalPendingAmount += amountVal;
    }
  }

  console.log('\n📊 [RESUMO DA IMPORTAÇÃO MEU DINHEIRO]');
  console.log(`✅ Pagamentos Confirmados (Recebidos): ${confirmedCount} parcelas (Total: R$ ${totalPaidAmount.toFixed(2)})`);
  console.log(`✅ Parcelas Pendentes Atualizadas: ${pendingCount} parcelas (Total: R$ ${totalPendingAmount.toFixed(2)})`);
  console.log(`✅ Registros de Pagamento (Payment) vinculados: ${updatedPayments}`);
  console.log(`✅ Parcelas atualizadas/sincronizadas: ${updatedInstallments}`);
  console.log(`✅ Novas parcelas cadastradas: ${createdInstallments}`);
  console.log(`🚫 Nenhum lote novo foi criado (vinculados estritamente aos lotes existentes).`);

  console.log('\n✨ Concluído com sucesso!');
}

main()
  .catch((err) => {
    console.error('❌ Erro na importação Meu Dinheiro:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

