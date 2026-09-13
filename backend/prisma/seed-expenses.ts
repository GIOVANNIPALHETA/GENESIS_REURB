import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedExpensesAndProfits() {
  console.log('🌱 Iniciando seed de Tipos de Despesas e Beneficiários de Lucro...');

  // 1. Tipos de Despesa Padrão
  const defaultExpenseTypes = [
    {
      name: 'Taxas de recebimento / Taxas Asaas',
      description: 'Taxas bancárias e tarifas cobradas pelo Asaas',
      color: '#0284c7', // Sky Blue
      icon: 'Receipt',
      isFixed: false,
      requiresReceipt: false,
      affectsProfitSharing: true,
    },
    {
      name: 'Viagem',
      description: 'Passagens, translados e despesas gerais de viagens',
      color: '#8b5cf6', // Violet
      icon: 'Plane',
      isFixed: false,
      requiresReceipt: true,
      affectsProfitSharing: true,
    },
    {
      name: 'Combustível',
      description: 'Abastecimento de veículos e deslocamentos operacionais',
      color: '#f59e0b', // Amber
      icon: 'Fuel',
      isFixed: false,
      requiresReceipt: true,
      affectsProfitSharing: true,
    },
    {
      name: 'Alimentação',
      description: 'Refeições em serviço e alimentação da equipe',
      color: '#10b981', // Emerald
      icon: 'Utensils',
      isFixed: false,
      requiresReceipt: true,
      affectsProfitSharing: true,
    },
    {
      name: 'Hospedagem',
      description: 'Hotéis e pousadas durante viagens de trabalho',
      color: '#6366f1', // Indigo
      icon: 'Hotel',
      isFixed: false,
      requiresReceipt: true,
      affectsProfitSharing: true,
    },
    {
      name: 'Manutenção de veículo',
      description: 'Oficinas, revisões, peças e consertos de automóveis',
      color: '#ef4444', // Red
      icon: 'Wrench',
      isFixed: false,
      requiresReceipt: true,
      affectsProfitSharing: true,
    },
    {
      name: 'Manutenção de computador e equipamentos',
      description: 'Suporte de TI, periféricos, peças e manutenção técnica',
      color: '#3b82f6', // Blue
      icon: 'Laptop',
      isFixed: false,
      requiresReceipt: true,
      affectsProfitSharing: true,
    },
    {
      name: 'Assessoria',
      description: 'Honorários e serviços de assessoria técnica e operacional',
      color: '#0f5964', // Teal Brand
      icon: 'Briefcase',
      isFixed: true,
      requiresReceipt: false,
      affectsProfitSharing: true,
    },
    {
      name: 'Retirada de lucros',
      description: 'Distribuição e retirada de lucros para sócios e beneficiários',
      color: '#059669', // Green
      icon: 'Coins',
      isFixed: false,
      requiresReceipt: true,
      affectsProfitSharing: false,
    },
    {
      name: 'Outros',
      description: 'Despesas diversas não categorizadas nos grupos anteriores',
      color: '#64748b', // Slate
      icon: 'Tag',
      isFixed: false,
      requiresReceipt: false,
      affectsProfitSharing: true,
    },
  ];

  for (const type of defaultExpenseTypes) {
    await prisma.expenseType.upsert({
      where: { name: type.name },
      update: type,
      create: type,
    });
    console.log(`  ✓ Tipo cadastrado: ${type.name}`);
  }

  // 2. Beneficiários Iniciais de Lucro
  const initialBeneficiaries = [
    {
      name: 'Clodoaldo Neves',
      type: 'INDIVIDUAL',
      defaultPercentage: 33.33,
      notes: 'Sócio / Beneficiário Pessoa Física',
    },
    {
      name: 'Baganha',
      type: 'INDIVIDUAL',
      defaultPercentage: 33.33,
      notes: 'Sócio / Beneficiário Pessoa Física',
    },
    {
      name: 'Baragui',
      type: 'COMPANY',
      defaultPercentage: 33.34,
      notes: 'Beneficiário Pessoa Jurídica / Empresa',
    },
  ];

  for (const ben of initialBeneficiaries) {
    const existing = await prisma.profitBeneficiary.findFirst({
      where: { name: { equals: ben.name, mode: 'insensitive' } },
    });
    if (existing) {
      await prisma.profitBeneficiary.update({
        where: { id: existing.id },
        data: ben,
      });
      console.log(`  ✓ Beneficiário atualizado: ${ben.name}`);
    } else {
      await prisma.profitBeneficiary.create({
        data: ben,
      });
      console.log(`  ✓ Beneficiário cadastrado: ${ben.name}`);
    }
  }

  console.log('✨ Seed de Despesas e Lucros concluído com sucesso!');
}

seedExpensesAndProfits()
  .catch((e) => console.error('Erro no seed:', e))
  .finally(() => prisma.$disconnect());
