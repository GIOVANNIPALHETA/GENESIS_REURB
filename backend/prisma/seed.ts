import 'dotenv/config';
import { PrismaClient, UserRole, ProjectStatus, LotStatus, FinancialAccountType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Genesis@123', 10);

  for (const account of [
    { id: 'account-cash', name: 'Dinheiro', type: FinancialAccountType.CASH },
    { id: 'account-asaas', name: 'Asaas', type: FinancialAccountType.ASAAS },
    { id: 'account-mercado-pago', name: 'Mercado Pago', type: FinancialAccountType.MERCADO_PAGO },
  ]) {
    await prisma.financialAccount.upsert({ where: { id: account.id }, update: { name: account.name, type: account.type, active: true }, create: account });
  }

  await prisma.user.upsert({
    where: { email: 'admin@genesisreurb.com.br' },
    update: { name: 'Administrador', passwordHash, role: UserRole.ADMIN, active: true },
    create: {
      name: 'Administrador',
      email: 'admin@genesisreurb.com.br',
      passwordHash,
      role: UserRole.ADMIN,
      active: true,
    },
  });

  const projectId = 'project-vila-nova-aripuana';
  const project = await prisma.project.upsert({
    where: { id: projectId },
    update: {},
    create: {
      id: projectId,
      name: 'Vila Nova Aripuanã',
      neighborhood: 'Centro',
      city: 'Aripuanã',
      state: 'MT',
      description: 'Projeto de regularização fundiária em Aripuanã',
      status: ProjectStatus.IN_PROGRESS,
      startDate: new Date(),
      active: true,
    },
  });

  const blockA = await prisma.block.upsert({
    where: { id: 'block-vila-nova-aripuana-a' },
    update: {},
    create: { id: 'block-vila-nova-aripuana-a', projectId: project.id, number: 'A', description: 'Quadra A' },
  });

  const lot1 = await prisma.lot.upsert({
    where: { projectId_blockId_number: { projectId: project.id, blockId: blockA.id, number: '01' } },
    update: {},
    create: {
      projectId: project.id,
      blockId: blockA.id,
      number: '01',
      address: 'Rua das Palmeiras, 123',
      area: 300,
      registration: 'REG-001',
      status: LotStatus.CONTRACT_SIGNED,
    },
  });

  const person1 = await prisma.person.upsert({
    where: { cpf: '00000000001' },
    update: {
      fullName: 'Maria Silva',
      rg: 'MG-12.345.678',
      birthDate: new Date('1983-03-15'),
      phone: '(66) 99999-0001',
      whatsapp: '(66) 99999-0001',
      email: 'maria@example.com',
      motherName: 'Ana Silva',
    },
    create: {
      fullName: 'Maria Silva',
      cpf: '00000000001',
      rg: 'MG-12.345.678',
      birthDate: new Date('1983-03-15'),
      phone: '(66) 99999-0001',
      whatsapp: '(66) 99999-0001',
      email: 'maria@example.com',
      motherName: 'Ana Silva',
    },
  });

  await prisma.contract.upsert({
    where: { contractNumber: 'CTR-0001' },
    update: {
      signed: true,
      signedAt: new Date(),
      status: 'ACTIVE',
      totalValue: 3500,
      notes: 'Contrato de exemplo',
    },
    create: {
      personId: person1.id,
      lotId: lot1.id,
      projectId: project.id,
      contractNumber: 'CTR-0001',
      signed: true,
      signedAt: new Date(),
      status: 'ACTIVE',
      totalValue: 3500,
      notes: 'Contrato de exemplo',
    },
  });

  for (const type of [
    { name: 'Documento de identidade', category: 'Pessoal', required: true },
    { name: 'CPF', category: 'Pessoal', required: true },
    { name: 'Comprovante de residência', category: 'Residência', required: true },
    { name: 'Certidão de casamento', category: 'Civil', required: false },
  ]) {
    await prisma.documentType.upsert({
      where: { id: `seed-${type.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` },
      update: type,
      create: { id: `seed-${type.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, ...type },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
