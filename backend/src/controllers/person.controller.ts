import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma/client';
import { syncPersonUpdated } from '../services/googleDriveSync.service';

const optStr = z.preprocess(
  (val) => (val === '' || val === null || val === undefined ? undefined : String(val).trim()),
  z.string().optional()
);

const optEmail = z.preprocess(
  (val) => (val === '' || val === null || val === undefined ? undefined : String(val).trim()),
  z.string().email('E-mail informado é inválido.').optional()
);

const spouseSchema = z.object({
  fullName: optStr,
  cpf: optStr,
  rg: optStr,
  rgIssuer: optStr,
  profession: optStr,
  phone: optStr,
});

const personSchema = z.object({
  fullName: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? undefined : String(val).trim()),
    z.string().min(1, 'Informe ao menos o nome ou razão social.')
  ),
  personType: z.preprocess(
    (val) => (val === 'JURIDICA' ? 'JURIDICA' : 'FISICA'),
    z.enum(['FISICA', 'JURIDICA']).default('FISICA')
  ),
  cpf: optStr,
  cnpj: optStr,
  companyName: optStr,
  representativeName: optStr,
  representativeCpf: optStr,
  rg: optStr,
  rgIssuer: optStr,
  profession: optStr,
  maritalStatus: optStr,
  phone: optStr,
  email: optEmail,
  spouse: spouseSchema.optional().nullable(),
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
  const searchDigits = search.replace(/\D/g, '');
  const orConditions: any[] = [
    { fullName: { contains: search, mode: 'insensitive' } },
    { companyName: { contains: search, mode: 'insensitive' } },
    { representativeName: { contains: search, mode: 'insensitive' } },
    { cpf: { contains: search } },
    { cnpj: { contains: search } },
    { rg: { contains: search } },
  ];
  if (searchDigits.length >= 3) {
    orConditions.push({ cpf: { contains: searchDigits } });
    orConditions.push({ cnpj: { contains: searchDigits } });
  }

  const people = await prisma.person.findMany({
    where: search
      ? { OR: orConditions }
      : undefined,
    select: personSelect,
    orderBy: { fullName: 'asc' },
  });
  return res.json({ success: true, data: people, message: 'Pessoas carregadas' });
}

export async function createPerson(req: Request, res: Response) {
  const rawFullName = typeof req.body.fullName === 'string' ? req.body.fullName.trim() : '';
  const rawCompanyName = typeof req.body.companyName === 'string' ? req.body.companyName.trim() : '';
  const effectiveFullName = rawFullName || rawCompanyName;
  const effectiveCompanyName = rawCompanyName || (req.body.personType === 'JURIDICA' ? effectiveFullName : undefined);

  const result = personSchema.safeParse({
    ...req.body,
    fullName: effectiveFullName,
    companyName: effectiveCompanyName,
  });

  if (!result.success) {
    const errorMsg = result.error.issues[0]?.message || 'Informe ao menos o nome ou razão social.';
    return res.status(400).json({ success: false, data: null, message: errorMsg });
  }

  const { spouse, ...data } = result.data;

  // Normalizar CPF e CNPJ
  const cleanCpf = data.cpf ? data.cpf.replace(/\D/g, '') : undefined;
  const cleanCnpj = data.cnpj ? data.cnpj.replace(/\D/g, '') : undefined;
  const cleanRepCpf = data.representativeCpf ? data.representativeCpf.replace(/\D/g, '') : undefined;

  // Verificar se o CPF já está cadastrado em outra pessoa
  if (cleanCpf && cleanCpf.length > 0) {
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
  if (cleanCnpj && cleanCnpj.length > 0) {
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
        cpf: spouse!.cpf ? spouse!.cpf.replace(/\D/g, '') : null,
        rg: spouse!.rg || null,
        rgIssuer: spouse!.rgIssuer || null,
        profession: spouse!.profession || null,
        phone: spouse!.phone || null,
      }
    : undefined;

  try {
    const person = await prisma.person.create({
      data: {
        fullName: data.fullName,
        personType: data.personType,
        cpf: (cleanCpf && cleanCpf.length > 0) ? cleanCpf : null,
        cnpj: (cleanCnpj && cleanCnpj.length > 0) ? cleanCnpj : null,
        companyName: data.companyName || null,
        representativeName: data.representativeName || null,
        representativeCpf: (cleanRepCpf && cleanRepCpf.length > 0) ? cleanRepCpf : null,
        rg: data.rg || null,
        rgIssuer: data.rgIssuer || null,
        profession: data.profession || null,
        maritalStatus: data.maritalStatus || null,
        phone: data.phone || null,
        email: data.email || null,
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
  const personId = req.params.id;

  const rawFullName = typeof req.body.fullName === 'string' ? req.body.fullName.trim() : '';
  const rawCompanyName = typeof req.body.companyName === 'string' ? req.body.companyName.trim() : '';
  const effectiveFullName = rawFullName || rawCompanyName;
  const effectiveCompanyName = rawCompanyName || (req.body.personType === 'JURIDICA' ? effectiveFullName : undefined);

  const result = personSchema.safeParse({
    ...req.body,
    fullName: effectiveFullName,
    companyName: effectiveCompanyName,
  });

  if (!result.success) {
    const errorMsg = result.error.issues[0]?.message || 'Informe ao menos o nome ou razão social.';
    return res.status(400).json({ success: false, data: null, message: errorMsg });
  }

  const { spouse, ...data } = result.data;

  // Normalizar CPF e CNPJ
  const cleanCpf = data.cpf ? data.cpf.replace(/\D/g, '') : undefined;
  const cleanCnpj = data.cnpj ? data.cnpj.replace(/\D/g, '') : undefined;
  const cleanRepCpf = data.representativeCpf ? data.representativeCpf.replace(/\D/g, '') : undefined;

  // Verificar se o CPF já pertence a outra pessoa
  if (cleanCpf && cleanCpf.length > 0) {
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
  if (cleanCnpj && cleanCnpj.length > 0) {
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
        cpf: spouse!.cpf ? spouse!.cpf.replace(/\D/g, '') : null,
        rg: spouse!.rg || null,
        rgIssuer: spouse!.rgIssuer || null,
        profession: spouse!.profession || null,
        phone: spouse!.phone || null,
      }
    : undefined;

  try {
    const person = await prisma.$transaction(async (tx) => {
      await tx.person.update({
        where: { id: personId },
        data: {
          fullName: data.fullName,
          personType: data.personType,
          cpf: (cleanCpf && cleanCpf.length > 0) ? cleanCpf : null,
          cnpj: (cleanCnpj && cleanCnpj.length > 0) ? cleanCnpj : null,
          companyName: data.companyName || null,
          representativeName: data.representativeName || null,
          representativeCpf: (cleanRepCpf && cleanRepCpf.length > 0) ? cleanRepCpf : null,
          rg: data.rg || null,
          rgIssuer: data.rgIssuer || null,
          profession: data.profession || null,
          maritalStatus: data.maritalStatus || null,
          phone: data.phone || null,
          email: data.email || null,
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
      message: error?.code === 'P2002' ? 'Já existe uma pessoa com este CPF ou CNPJ.' : 'Não foi possível atualizar a pessoa.',
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