import { PrismaClient, PaymentMethod, PaymentStatus, ExpenseStatus, FinancialAccountType } from '@prisma/client';
import * as xlsx from 'xlsx';
import * as path from 'path';

const prisma = new PrismaClient();

function parseDate(dateStr: string): Date {
  const [d, m, y] = dateStr.trim().split('/').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

async function run() {
  console.log('🚀 INICIANDO CONCILIAÇÃO BANCÁRIA DO EXTRATO ASAAS (01/06/2026 A 10/09/2026)...');

  // 1. Carregar Usuário Administrador
  let user = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!user) {
    user = await prisma.user.findFirst();
  }
  if (!user) {
    throw new Error('Nenhum usuário encontrado no sistema para vincular as despesas.');
  }
  console.log(`👤 Usuário de lançamento: ${user.name} (${user.id})`);

  // 2. Carregar Conta Asaas
  let asaasAccount = await prisma.financialAccount.findFirst({
    where: {
      OR: [
        { name: { contains: 'Asaas', mode: 'insensitive' } },
        { type: FinancialAccountType.ASAAS }
      ]
    }
  });

  if (!asaasAccount) {
    asaasAccount = await prisma.financialAccount.create({
      data: {
        name: 'Asaas',
        type: FinancialAccountType.ASAAS,
        openingBalance: 1043.43,
        active: true
      }
    });
    console.log(`🏦 Conta Asaas criada com ID: ${asaasAccount.id}`);
  }
  console.log(`🏦 Conta Financeira: ${asaasAccount.name} (${asaasAccount.id})`);

  // 3. Garantir Tipos de Despesa (ExpenseType)
  const requiredExpenseTypes = [
    { name: 'Tarifas Bancárias', description: 'Tarifas de cobrança, WhatsApp, Pix e cartões do Asaas', icon: 'Receipt', color: '#64748b' },
    { name: 'Topografia e Agrimensura', description: 'Serviços de topografia e levantamento planialtimétrico', icon: 'Compass', color: '#0284c7' },
    { name: 'Engenharia e Projetos', description: 'Serviços técnicos de engenharia e gestão de REURB', icon: 'Briefcase', color: '#0f5964' },
    { name: 'Serviços Profissionais e Honorários', description: 'Honorários técnicos, jurídicos e consultoria', icon: 'Users', color: '#4f46e5' },
    { name: 'Combustível e Transporte', description: 'Abastecimento de veículos e deslocamentos de campo', icon: 'Fuel', color: '#d97706' },
    { name: 'Alimentação e Estadia', description: 'Refeições de equipe em campo e hospedagem', icon: 'Utensils', color: '#ea580c' },
    { name: 'Cartório e Certidões', description: 'Custas cartorárias, buscas e emolumentos', icon: 'FileText', color: '#7c3aed' },
    { name: 'Despesas Operacionais de Campo', description: 'Materiais de consumo e pequenas compras operacionais', icon: 'Tool', color: '#059669' }
  ];

  const expenseTypeMap = new Map<string, string>();
  for (const et of requiredExpenseTypes) {
    let existing = await prisma.expenseType.findUnique({ where: { name: et.name } });
    if (!existing) {
      existing = await prisma.expenseType.create({
        data: {
          name: et.name,
          description: et.description,
          icon: et.icon,
          color: et.color,
          active: true,
          affectsProfitSharing: true
        }
      });
      console.log(`  + Criado Tipo de Despesa: ${et.name}`);
    }
    expenseTypeMap.set(et.name, existing.id);
  }

  // 4. Ler arquivo Excel do Extrato
  const filePath = path.resolve(__dirname, '../../uploads/documents/Extrato_10-09-2026.xlsx');
  const wb = xlsx.readFile(filePath, { cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawRows: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // 5. Carregar dados do banco para cruzamento
  const existingExpenses = await prisma.expense.findMany({
    select: { id: true, transactionId: true, amount: true, expenseDate: true, description: true }
  });
  const existingExpenseTxIds = new Set(existingExpenses.map(e => e.transactionId).filter(Boolean));

  const existingPayments = await prisma.payment.findMany({
    select: { id: true, externalId: true, amount: true, paymentDate: true, installmentId: true }
  });
  const existingPaymentTxIds = new Set(existingPayments.map(p => p.externalId).filter(Boolean));

  const allPersons = await prisma.person.findMany({
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

  // Alias para nomes conhecidos com pequenas variações
  const nameAliases: Record<string, string> = {
    'DAVID BATISTA BOTONI': 'DAVI BATISTA BOTONI',
    'CRISTIANE DE CASTRO DO NASCIMENTO': 'CRISTIANE DE CASTRO NASCIMENTO',
    'MARIA DE SOUSA SILVA': 'MARIA DE FATIMA DA SILVA NERIS',
    'VALDIR ROCHA SILVA': 'VALDIR ROCHA DA SILVA'
  };

  // 6. PROCESSAR DÉBITOS (DESPESAS)
  console.log('\n--- PROCESSANDO DÉBITOS / DESPESAS ---');
  let expensesCreated = 0;
  let expensesSkipped = 0;

  for (let r = 3; r < rawRows.length; r++) {
    const row = rawRows[r];
    const dataStr = String(row[0] || '').trim();
    if (!dataStr || dataStr.startsWith('Período') || dataStr.startsWith('Saldo') || dataStr.startsWith('Data')) continue;

    const txId = String(row[1] || '').trim();
    const type = String(row[2] || '').trim();
    const desc = String(row[4] || '').trim();
    const rawVal = typeof row[5] === 'number' ? row[5] : parseFloat(String(row[5] || '0').replace(',', '.'));

    if (rawVal < 0) {
      const amount = Math.abs(rawVal);
      const date = parseDate(dataStr);

      // Checa duplicidade
      if (txId && existingExpenseTxIds.has(txId)) {
        expensesSkipped++;
        continue;
      }

      // Definir categoria, tipo e beneficiário
      let expenseTypeName = 'Despesas Operacionais de Campo';
      let category = 'Operacional';
      let beneficiary = 'Fornecedor';
      let paymentMethod: PaymentMethod = PaymentMethod.CASH;

      const descUpper = desc.toUpperCase();

      if (type.includes('WhatsApp')) {
        expenseTypeName = 'Tarifas Bancárias';
        category = 'Tarifas Asaas';
        beneficiary = 'Asaas Gestão Financeira';
        paymentMethod = PaymentMethod.ASAAS;
      } else if (type.includes('boleto') || type.includes('cartão') || type.includes('Pix') || type.includes('mensageria') || type.includes('Venda de Cartão')) {
        expenseTypeName = 'Tarifas Bancárias';
        category = 'Tarifas Asaas';
        beneficiary = 'Asaas Gestão Financeira';
        paymentMethod = PaymentMethod.ASAAS;
      } else if (type.includes('Transação via Pix')) {
        paymentMethod = PaymentMethod.PIX;
        const matchPix = desc.match(/para\s+(.*)$/i);
        beneficiary = matchPix ? matchPix[1].trim().toUpperCase() : 'Transferência Pix';

        if (beneficiary.includes('BARAGUI')) {
          expenseTypeName = 'Topografia e Agrimensura';
          category = 'Topografia';
        } else if (beneficiary.includes('GENESIS')) {
          expenseTypeName = 'Engenharia e Projetos';
          category = 'Gestão REURB';
        } else if (beneficiary.includes('PALHETA') || beneficiary.includes('BAGANHA')) {
          expenseTypeName = 'Serviços Profissionais e Honorários';
          category = 'Honorários Técnicos';
        } else if (beneficiary.includes('ADRIANO AGUIAR') || beneficiary.includes('DIEGO BARROS') || beneficiary.includes('BRUNO MAINARDES') || beneficiary.includes('CLODOALDO') || beneficiary.includes('MARCOS AURELIO')) {
          expenseTypeName = 'Serviços Profissionais e Honorários';
          category = 'Serviços de Campo';
        } else {
          expenseTypeName = 'Serviços Profissionais e Honorários';
          category = 'Repasse Operacional';
        }
      } else if (type.includes('cartão') || descUpper.includes('CARTÃO FINAL 7048')) {
        paymentMethod = PaymentMethod.CARD;
        const matchEst = desc.match(/no estabelecimento\s+(.*)$/i);
        beneficiary = matchEst ? matchEst[1].trim().toUpperCase() : 'Compra Cartão';

        if (descUpper.includes('POSTO') || descUpper.includes('AUTO POSTO') || descUpper.includes('COMBUSTIVEL') || descUpper.includes('PETROLEO')) {
          expenseTypeName = 'Combustível e Transporte';
          category = 'Combustível';
        } else if (descUpper.includes('CARTORIO') || descUpper.includes('TABELIONATO') || descUpper.includes('REGISTRO')) {
          expenseTypeName = 'Cartório e Certidões';
          category = 'Cartório';
        } else if (descUpper.includes('RESTAURANTE') || descUpper.includes('CHURRASCARIA') || descUpper.includes('LANCHONETE') || descUpper.includes('PADARIA') || descUpper.includes('SUPERMERCADO') || descUpper.includes('MERCADO')) {
          expenseTypeName = 'Alimentação e Estadia';
          category = 'Alimentação';
        } else if (descUpper.includes('HOTEL') || descUpper.includes('POUSADA')) {
          expenseTypeName = 'Alimentação e Estadia';
          category = 'Hospedagem';
        } else {
          expenseTypeName = 'Despesas Operacionais de Campo';
          category = 'Cartão Asaas';
        }
      }

      const expenseTypeId = expenseTypeMap.get(expenseTypeName) || Array.from(expenseTypeMap.values())[0];

      await prisma.expense.create({
        data: {
          accountId: asaasAccount.id,
          userId: user.id,
          expenseTypeId,
          category,
          beneficiary,
          description: desc,
          amount,
          expenseDate: date,
          dueDate: date,
          status: ExpenseStatus.PAID,
          paymentMethod,
          transactionId: txId || null,
          notes: `Importado via extrato bancário Asaas em ${dataStr}`
        }
      });

      if (txId) existingExpenseTxIds.add(txId);
      expensesCreated++;
    }
  }

  console.log(`✅ Despesas criadas: ${expensesCreated} | Ignoradas/Já existentes: ${expensesSkipped}`);

  // 7. PROCESSAR CRÉDITOS (RECEITAS / BAIXAS DE PARCELAS)
  console.log('\n--- PROCESSANDO CRÉDITOS / RECEBIMENTOS ---');
  let paymentsCreated = 0;
  let installmentsUpdated = 0;
  let unallocatedPaymentsCreated = 0;
  let paymentsSkipped = 0;

  for (let r = 3; r < rawRows.length; r++) {
    const row = rawRows[r];
    const dataStr = String(row[0] || '').trim();
    if (!dataStr || dataStr.startsWith('Período') || dataStr.startsWith('Saldo') || dataStr.startsWith('Data')) continue;

    const txId = String(row[1] || '').trim();
    const type = String(row[2] || '').trim();
    const desc = String(row[4] || '').trim();
    const rawVal = typeof row[5] === 'number' ? row[5] : parseFloat(String(row[5] || '0').replace(',', '.'));
    const faturaId = String(row[8] || '').trim();

    if (rawVal > 0) {
      const amount = rawVal;
      const date = parseDate(dataStr);

      // Se já foi importado com esse txId
      if (txId && existingPaymentTxIds.has(txId)) {
        paymentsSkipped++;
        continue;
      }

      let clientName = '';
      const matchColon = desc.match(/:\s*([^:]+)$/);
      if (matchColon) {
        clientName = matchColon[1].trim();
      } else {
        const matchFat = desc.match(/fatura nr\.\s*\d+\s+(.*)$/i);
        if (matchFat) clientName = matchFat[1].trim();
        else clientName = desc;
      }
      clientName = clientName.toUpperCase().replace(/\s+/g, ' ').trim();

      // Aplicar alias se houver
      if (nameAliases[clientName]) {
        clientName = nameAliases[clientName];
      }

      // Tratar estornos e vendas de cartão avulsas
      if (
        clientName.includes('ESTORNO') ||
        clientName.includes('VENDA DE CARTÃO') ||
        clientName.includes('DANIELLA KEIKO') ||
        clientName.includes('SIMONI DE BRIDA')
      ) {
        let method = PaymentMethod.ASAAS;
        if (clientName.includes('PIX')) method = PaymentMethod.PIX;
        else if (clientName.includes('CARTÃO') || clientName.includes('CARTAO')) method = PaymentMethod.CARD;

        await prisma.payment.create({
          data: {
            accountId: asaasAccount.id,
            amount,
            paymentDate: date,
            paymentMethod: method,
            externalId: txId || null,
            description: desc,
            notes: `Recebimento financeiro avulso Asaas (${dataStr})`
          }
        });

        if (txId) existingPaymentTxIds.add(txId);
        unallocatedPaymentsCreated++;
        continue;
      }

      // Localizar pessoa no banco
      const nameParts = clientName.split(' ').filter(p => p.length > 2);
      const matchedPerson = allPersons.find(p => {
        const pUpper = p.fullName.toUpperCase();
        if (pUpper === clientName) return true;
        if (nameParts.length >= 2) {
          return pUpper.includes(nameParts[0]) && pUpper.includes(nameParts[nameParts.length - 1]);
        }
        return pUpper.includes(clientName);
      });

      if (matchedPerson) {
        // Coletar todas as parcelas de todos os contratos da pessoa
        const allClientInstallments = matchedPerson.contracts.flatMap(c =>
          c.negotiations.flatMap(n =>
            n.installments.map(i => ({ ...i, contract: c }))
          )
        );

        // Verificar se já existe pagamento vinculado a este extrato (mesma data, mesmo valor)
        const alreadyPaidMatch = allClientInstallments.find(inst =>
          inst.payments.some(p => {
            const dateDiff = Math.abs(p.paymentDate.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
            const valDiff = Math.abs(p.amount - amount);
            return (p.externalId === txId) || (dateDiff <= 5 && valDiff <= 10.0);
          })
        );

        if (alreadyPaidMatch) {
          paymentsSkipped++;
          continue;
        }

        // Buscar a melhor parcela aberta (PENDING ou OVERDUE)
        const openInstallments = allClientInstallments.filter(i => i.status === 'PENDING' || i.status === 'OVERDUE');
        
        let targetInstallment: any = null;

        if (openInstallments.length > 0) {
          openInstallments.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
          
          const exactValMatch = openInstallments.find(i => Math.abs(i.amount - amount) <= 10.0);
          if (exactValMatch) {
            targetInstallment = exactValMatch;
          } else {
            targetInstallment = openInstallments[0];
          }
        }

        if (targetInstallment) {
          // Criar Payment e dar baixa na Installment
          const newPayment = await prisma.payment.create({
            data: {
              installmentId: targetInstallment.id,
              accountId: asaasAccount.id,
              amount,
              paymentDate: date,
              paymentMethod: PaymentMethod.ASAAS,
              externalId: txId || null,
              description: desc,
              notes: `Baixa automática via extrato Asaas. Fatura: ${faturaId || 'N/A'}`
            }
          });

          await prisma.installment.update({
            where: { id: targetInstallment.id },
            data: {
              status: PaymentStatus.PAID,
              paidAmount: amount,
              paidAt: date,
              paymentMethod: PaymentMethod.ASAAS,
              asaasPaymentId: faturaId || txId || targetInstallment.asaasPaymentId
            }
          });

          targetInstallment.status = PaymentStatus.PAID;
          targetInstallment.payments.push(newPayment);

          if (txId) existingPaymentTxIds.add(txId);
          paymentsCreated++;
          installmentsUpdated++;
        } else {
          // Cliente cadastrado, mas todas as parcelas já estão baixadas
          await prisma.payment.create({
            data: {
              accountId: asaasAccount.id,
              amount,
              paymentDate: date,
              paymentMethod: PaymentMethod.ASAAS,
              externalId: txId || null,
              description: desc,
              notes: `Recebimento de ${matchedPerson.fullName} sem parcelas em aberto no momento.`
            }
          });
          if (txId) existingPaymentTxIds.add(txId);
          unallocatedPaymentsCreated++;
        }
      } else {
        // Pessoa não cadastrada no sistema -> Criar pagamento avulso
        await prisma.payment.create({
          data: {
            accountId: asaasAccount.id,
            amount,
            paymentDate: date,
            paymentMethod: PaymentMethod.ASAAS,
            externalId: txId || null,
            description: desc,
            notes: `Recebimento de cliente não cadastrado (${clientName})`
          }
        });
        if (txId) existingPaymentTxIds.add(txId);
        unallocatedPaymentsCreated++;
      }
    }
  }

  console.log(`\n===============================================================`);
  console.log(`🎉 CONCILIAÇÃO FINALIZADA COM SUCESSO!`);
  console.log(`===============================================================`);
  console.log(`📉 Despesas Lançadas (Débitos): ${expensesCreated}`);
  console.log(`💳 Parcelas Baixadas (Créditos vinculados a Contratos): ${installmentsUpdated}`);
  console.log(`💰 Pagamentos Avulsos/Diretos na Conta: ${unallocatedPaymentsCreated}`);
  console.log(`⏭️ Lançamentos Já Existentes / Ignorados: Despesas (${expensesSkipped}) | Receitas (${paymentsSkipped})`);
  console.log(`🚫 Novos Lotes Criados: 0 (Nenhum lote foi alterado ou criado, conforme aprovado).`);

  const finalExpensesCount = await prisma.expense.count();
  const finalPaymentsCount = await prisma.payment.count();
  console.log(`\nEstado Atual do Banco:`);
  console.log(`- Total de Despesas no Banco: ${finalExpensesCount}`);
  console.log(`- Total de Pagamentos no Banco: ${finalPaymentsCount}`);
}

run().finally(() => prisma.$disconnect());
