import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma/client';
import { syncPersonUpdated } from '../services/googleDriveSync.service';

const spouseSchema = z.object({
  fullName: z.string().optional(),
  cpf: z.string().optional(),
  rg: z.string().optional(),
  rgIssuer: z.string().optional(),
  profession: z.string().optional(),
  phone: z.string().optional(),
});

const personSchema = z.object({
  fullName: z.string().min(1, 'Informe ao menos o nome ou razão social.'),
  personType: z.enum(['FISICA', 'JURIDICA']).optional().default('FISICA'),
  cpf: z.string().optional(),
  cnpj: z.string().optional(),
  companyName: z.string().optional(),
  representativeName: z.string().optional(),
  representativeCpf: z.string().optional(),
  rg: z.string().optional(),
  rgIssuer: z.string().optional(),
  profession: z.string().optional(),
  maritalStatus: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  spouse: spouseSchema.optional(),
});

const personSelect = {
  id: true,
  fullName: true,
  personType: true,
  cpf: true,
  cnpj: true,
  companyName: true,
  representativeName: true,
  representativeCpf: true,
  rg: true,
  rgIssuer: true,
  profession: true,
  maritalStatus: true,
  phone: true,
  email: true,
  spouse: {
    select: {
      id: true,
      fullName: true,
      cpf: true,
      rg: true,
      rgIssuer: true,
      profession: true,
      phone: true,
    },
  },
} as const;

export async function listPeople(req: Request, res: Response) {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const people = await prisma.person.findMany({
    where: search
      ? {
          OR: [
            { fullName: { contains: search, mode: 'insensitive' } },
            { companyName: { contains: search, mode: 'insensitive' } },
            { representativeName: { contains: search, mode: 'insensitive' } },
            { cpf: { contains: search } },
            { cnpj: { contains: search } },
            { rg: { contains: search } },
          ],
        }
      : undefined,
    select: personSelect,
    orderBy: { fullName: 'asc' },
  });
  return res.json({ success: true, data: people, message: 'Pessoas carregadas' });
}

export async function createPerson(req: Request, res: Response) {
  const result = personSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ success: false, data: null, message: 'Informe ao menos o nome ou razão social.' });
  const { spouse, ...data } = result.data;

  // Normalizar CPF e CNPJ
  const cleanCpf = data.cpf ? data.cpf.replace(/\D/g, '') : undefined;
  const cleanCnpj = data.cnpj ? data.cnpj.replace(/\D/g, '') : undefined;
  const cleanRepCpf = data.representativeCpf ? data.representativeCpf.replace(/\D/g, '') : undefined;

  // Verificar se o CPF já está cadastrado em outra pessoa
  if (cleanCpf) {
    const existing = await prisma.person.findFirst({
      where: {
        OR: [
          { cpf: cleanCpf },
          { cpf: data.cpf },
        ],
      },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        data: null,
        message: `Este CPF já está cadastrado no sistema em nome de "${existing.fullName}".`,
      });
    }
  }

  // Verificar se o CNPJ já está cadastrado em outra empresa
  if (cleanCnpj) {
    const existingCnpj = await prisma.person.findFirst({
      where: {
        OR: [
          { cnpj: cleanCnpj },
          { cnpj: data.cnpj },
        ],
      },
    });

    if (existingCnpj) {
      return res.status(400).json({
        success: false,
        data: null,
        message: `Este CNPJ já está cadastrado no sistema em nome de "${existingCnpj.fullName}".`,
      });
    }
  }

  // Validar se há dados de cônjuge válidos (com nome preenchido)
  const hasSpouseData = Boolean(spouse?.fullName?.trim());
  const cleanSpouse = hasSpouseData
    ? {
        fullName: spouse!.fullName!.trim(),
        cpf: spouse!.cpf ? spouse!.cpf.replace(/\D/g, '') : undefined,
        rg: spouse!.rg || undefined,
        rgIssuer: spouse!.rgIssuer || undefined,
        profession: spouse!.profession || undefined,
        phone: spouse!.phone || undefined,
      }
    : undefined;

  try {
    const person = await prisma.person.create({
      data: {
        ...data,
        cpf: cleanCpf || data.cpf || null,
        cnpj: cleanCnpj || data.cnpj || null,
        representativeCpf: cleanRepCpf || data.representativeCpf || null,
        spouse: cleanSpouse ? { create: cleanSpouse } : undefined,
      },
      select: personSelect,
    });
    return res.status(201).json({ success: true, data: person, message: 'Pessoa cadastrada com sucesso!' });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      data: null,
      message: error?.code === 'P2002' ? 'Já existe um cadastro com este CPF ou CNPJ.' : 'Não foi possível cadastrar a pessoa.',
    });
  }
}

export async function updatePerson(req: Request, res: Response) {
  const result = personSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ success: false, data: null, message: 'Informe ao menos o nome ou razão social.' });
  const { spouse, ...data } = result.data;
  const personId = req.params.id;

  // Normalizar CPF e CNPJ
  const cleanCpf = data.cpf ? data.cpf.replace(/\D/g, '') : undefined;
  const cleanCnpj = data.cnpj ? data.cnpj.replace(/\D/g, '') : undefined;
  const cleanRepCpf = data.representativeCpf ? data.representativeCpf.replace(/\D/g, '') : undefined;

  // Verificar se o CPF já pertence a outra pessoa
  if (cleanCpf) {
    const existing = await prisma.person.findFirst({
      where: {
        id: { not: personId },
        OR: [
          { cpf: cleanCpf },
          { cpf: data.cpf },
        ],
      },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        data: null,
        message: `Este CPF já está cadastrado no sistema em nome de "${existing.fullName}".`,
      });
    }
  }

  // Verificar se o CNPJ já pertence a outra empresa
  if (cleanCnpj) {
    const existingCnpj = await prisma.person.findFirst({
      where: {
        id: { not: personId },
        OR: [
          { cnpj: cleanCnpj },
          { cnpj: data.cnpj },
        ],
      },
    });

    if (existingCnpj) {
      return res.status(400).json({
        success: false,
        data: null,
        message: `Este CNPJ já está cadastrado no sistema em nome de "${existingCnpj.fullName}".`,
      });
    }
  }

  // Validar cônjuge
  const hasSpouseData = Boolean(spouse?.fullName?.trim());
  const cleanSpouse = hasSpouseData
    ? {
        fullName: spouse!.fullName!.trim(),
        cpf: spouse!.cpf ? spouse!.cpf.replace(/\D/g, '') : undefined,
        rg: spouse!.rg || undefined,
        rgIssuer: spouse!.rgIssuer || undefined,
        profession: spouse!.profession || undefined,
        phone: spouse!.phone || undefined,
      }
    : undefined;

  try {
    const person = await prisma.$transaction(async (tx) => {
      await tx.person.update({
        where: { id: personId },
        data: {
          ...data,
          cpf: cleanCpf || data.cpf || null,
          cnpj: cleanCnpj || data.cnpj || null,
          representativeCpf: cleanRepCpf || data.representativeCpf || null,
        },
      });
      if (cleanSpouse) {
        await tx.spouse.upsert({ where: { personId }, update: cleanSpouse, create: { personId, ...cleanSpouse } });
      } else {
        await tx.spouse.deleteMany({ where: { personId } });
      }
      return tx.person.findUnique({ where: { id: personId }, select: personSelect });
    });

    // Se nome ou CPF/CNPJ da pessoa mudaram, sincroniza as pastas dos lotes onde ela é titular
    syncPersonUpdated(personId).catch((err) =>
      console.error('[PersonController] Erro ao sincronizar pastas de lotes após atualizar pessoa:', err)
    );

    return res.json({ success: true, data: person, message: 'Pessoa atualizada com sucesso!' });
  } catch (error: any) {
    return res.status(error?.code === 'P2025' ? 404 : 400).json({
      success: false,
      data: null,
      message: error?.code === 'P2002' ? 'Já existe uma pessoa com este CPF.' : 'Não foi possível atualizar a pessoa.',
    });
  }
}

export async function deletePerson(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const person = await prisma.person.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            contracts: true,
            occupancies: true,
            documents: true,
            serviceRecords: true,
          },
        },
      },
    });

    if (!person) {
      return res.status(404).json({ success: false, data: null, message: 'Pessoa não encontrada.' });
    }

    // Se houver contrato ativo ou lotes, informa detalhadamente
    if (person._count.contracts > 0) {
      return res.status(409).json({
        success: false,
        data: null,
        message: 'Esta pessoa possui contratos ativos. Exclua ou desvincule o contrato do lote antes de excluir a pessoa.',
      });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Remover cônjuge se houver
      await tx.spouse.deleteMany({ where: { personId: id } });
      // 2. Remover ocupações/posses vinculadas de teste
      await tx.occupancy.deleteMany({ where: { personId: id } });
      // 3. Remover atendimentos vinculados
      await tx.serviceRecord.deleteMany({ where: { personId: id } });
      // 4. Remover cliente Asaas vinculado
      await tx.asaasCustomer.deleteMany({ where: { personId: id } });
      // 5. Excluir a pessoa
      await tx.person.delete({ where: { id } });
    });

    return res.json({ success: true, data: null, message: 'Pessoa excluída com sucesso!' });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      data: null,
      message: error?.message || 'Não foi possível excluir a pessoa.',
    });
  }
}