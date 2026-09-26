import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma/client';
import { syncLotOwnerChanged } from '../services/googleDriveSync.service';
import { notifyOccupantChanged } from '../services/whatsappNotification.service';

const ownerSchema = z.object({
  fullName: z.string().min(1),
  cpf: z.string().min(1).optional(),
  rg: z.string().optional(),
  rgIssuedAt: z.string().optional(),
  rgIssuer: z.string().optional(),
  cnh: z.string().optional(),
  cnhIssuedAt: z.string().optional(),
  cnhIssuer: z.string().optional(),
  birthDate: z.string().optional(),
  profession: z.string().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().optional(),
  motherName: z.string().optional(),
  fatherName: z.string().optional(),
  maritalStatus: z.string().optional(),
  spouse: z
    .object({ fullName: z.string().min(1), cpf: z.string().optional(), rg: z.string().optional(), rgIssuer: z.string().optional(), profession: z.string().optional(), phone: z.string().optional() })
    .optional(),
  observations: z.string().optional(),
});

const lotSchema = z.object({
  projectId: z.string().optional(),
  blockId: z.string().min(1),
  number: z.string().min(1),
  address: z.string().optional(),
  area: z.number().optional(),
  perimeter: z.number().optional(),
  frontDimension: z.number().optional(),
  backDimension: z.number().optional(),
  rightDimension: z.number().optional(),
  leftDimension: z.number().optional(),
  confrontations: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  geographicFile: z.string().optional(),
  technicalNotes: z.string().optional(),
  registration: z.string().optional(),
  status: z.enum(['NOT_SIGNED', 'CONTRACT_SIGNED', 'TITLE_ISSUED', 'REGISTERED', 'CANCELLED', 'DISTRATTO']).optional(),
  active: z.boolean().optional(),
  observations: z.string().optional(),
  reurbType: z.string().optional(),
  owner: ownerSchema.optional(),
  personId: z.string().optional(),
});

export async function listLots(req: Request, res: Response) {
// ... same logic
  const { projectId, blockId, number, ownerName } = req.query;
  const lots = await prisma.lot.findMany({
    where: {
      projectId: typeof projectId === 'string' && projectId ? projectId : undefined,
      blockId: typeof blockId === 'string' && blockId ? blockId : undefined,
      number: typeof number === 'string' && number ? { contains: number, mode: 'insensitive' } : undefined,
      OR: ownerName
        ? [
            { occupancies: { some: { current: true, type: 'OWNER', person: { fullName: { contains: String(ownerName), mode: 'insensitive' } } } } },
            { contracts: { some: { person: { fullName: { contains: String(ownerName), mode: 'insensitive' } } } } },
          ]
        : undefined,
    },
    include: {
      project: { select: { id: true, name: true } },
      block: { select: { id: true, number: true } },
      contracts: {
        select: {
          id: true,
          contractNumber: true,
          signed: true,
          person: { select: { id: true, fullName: true, cpf: true, phone: true } },
          negotiations: {
            select: {
              installments: {
                select: {
                  id: true,
                  amount: true,
                  paidAmount: true,
                  dueDate: true,
                  status: true,
                },
              },
            },
          },
        },
      },
      occupancies: {
        where: { current: true, type: 'OWNER' },
        select: { person: { select: { id: true, fullName: true, cpf: true, rg: true, rgIssuer: true, phone: true, email: true, profession: true, maritalStatus: true, spouse: true } } },
      },
    },
    orderBy: [{ block: { number: 'asc' } }, { number: 'asc' }],
  });
  return res.json({ success: true, data: lots, message: 'Lotes carregados' });
}

export async function getLotById(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const lot = await prisma.lot.findUnique({
      where: { id },
      include: {
        project: true,
        block: true,
        occupancies: {
          include: {
            person: {
              include: {
                spouse: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        contracts: {
          include: {
            person: true,
            negotiations: {
              include: {
                installments: {
                  include: {
                    payments: {
                      include: {
                        account: true,
                      },
                    },
                  },
                  orderBy: { installmentNumber: 'asc' },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        documents: {
          include: {
            documentType: true,
            uploadedBy: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        serviceRecords: {
          include: {
            user: { select: { id: true, name: true } },
            person: { select: { fullName: true } },
          },
          orderBy: { serviceDate: 'desc' },
        },
      },
    });

    if (!lot) {
      return res.status(404).json({ success: false, data: null, message: 'Lote não encontrado' });
    }

    return res.json({ success: true, data: lot, message: 'Lote carregado com sucesso' });
  } catch (error) {
    return res.status(500).json({ success: false, data: null, message: 'Erro ao carregar detalhes do lote' });
  }
}

export async function createLot(req: Request, res: Response) {
  try {
    const result = lotSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ success: false, data: null, message: 'Dados inválidos' });

    const payload = result.data;

    const block = await prisma.block.findUnique({ where: { id: payload.blockId }, select: { projectId: true } });
    if (!block) return res.status(400).json({ success: false, data: null, message: 'Quadra não encontrada' });

    // Create lot and owner (person + occupancy) in a transaction
    const created = await prisma.$transaction(async (tx) => {
      const lot = await tx.lot.create({ data: { projectId: block.projectId, blockId: payload.blockId, number: payload.number, address: payload.address, area: payload.area, registration: payload.registration, status: payload.status as any, active: payload.active, observations: payload.observations } });

      if (payload.personId) {
        await tx.occupancy.create({ data: { personId: payload.personId, lotId: lot.id, type: 'OWNER' as any, startDate: new Date(), current: true } });
      } else if (payload.owner) {
        const ow = payload.owner;
        let person;
        if (ow.cpf) {
          person = await tx.person.upsert({
            where: { cpf: ow.cpf },
            update: { fullName: ow.fullName, rg: ow.rg, rgIssuer: ow.rgIssuer, maritalStatus: ow.maritalStatus, birthDate: ow.birthDate ? new Date(ow.birthDate) : undefined, phone: ow.phone, whatsapp: ow.whatsapp, email: ow.email, motherName: ow.motherName, fatherName: ow.fatherName, profession: ow.profession, observations: ow.observations },
            create: { fullName: ow.fullName, cpf: ow.cpf, rg: ow.rg, rgIssuer: ow.rgIssuer, maritalStatus: ow.maritalStatus, birthDate: ow.birthDate ? new Date(ow.birthDate) : undefined, phone: ow.phone, whatsapp: ow.whatsapp, email: ow.email, motherName: ow.motherName, fatherName: ow.fatherName, profession: ow.profession, observations: ow.observations },
          });
        } else {
          person = await tx.person.create({ data: { fullName: ow.fullName, rg: ow.rg, rgIssuer: ow.rgIssuer, maritalStatus: ow.maritalStatus, birthDate: ow.birthDate ? new Date(ow.birthDate) : undefined, phone: ow.phone, whatsapp: ow.whatsapp, email: ow.email, motherName: ow.motherName, fatherName: ow.fatherName, profession: ow.profession, observations: ow.observations } });
        }

        // create spouse if provided
        if (ow.spouse) {
          try {
            await tx.spouse.upsert({
              where: { personId: person.id },
              update: { fullName: ow.spouse.fullName, cpf: ow.spouse.cpf, rg: ow.spouse.rg, rgIssuer: ow.spouse.rgIssuer, profession: ow.spouse.profession, phone: ow.spouse.phone },
              create: { personId: person.id, fullName: ow.spouse.fullName, cpf: ow.spouse.cpf, rg: ow.spouse.rg, rgIssuer: ow.spouse.rgIssuer, profession: ow.spouse.profession, phone: ow.spouse.phone },
            });
          } catch (e) {
            // ignore spouse upsert errors (unique constraints) to keep creation resilient
          }
        }

        // create occupancy linking person to lot
        await tx.occupancy.create({ data: { personId: person.id, lotId: lot.id, type: 'OWNER' as any, startDate: new Date(), current: true } });
      }

      return lot;
    });

    // Sincronizar criação/titular do lote para a pasta no Google Drive
    syncLotOwnerChanged(created.id).catch((err) =>
      console.error('[LotController] Erro ao sincronizar pasta do lote no Drive:', err)
    );

    return res.status(201).json({ success: true, data: created, message: 'Lote criado' });
  } catch (error: any) {
    console.error('Error creating lot:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ success: false, data: null, message: 'Já existe um lote com este número nesta quadra.' });
    }
    return res.status(500).json({ success: false, data: null, message: 'Erro interno ao cadastrar lote.' });
  }
}

export async function updateLot(req: Request, res: Response) {
  const { id } = req.params;
  const result = lotSchema.partial().safeParse(req.body);
  if (!result.success) return res.status(400).json({ success: false, data: null, message: 'Dados inválidos' });

  try {
    const { owner, reurbType, status, ...data } = result.data;
    
    // Normalizar status para o enum do banco
    let normalizedStatus: any = status;
    if (status === 'CANCELLED') normalizedStatus = 'DISTRATTO';

    // Buscar o lote por ID direto ou por chave
    let existingLot = await prisma.lot.findUnique({ where: { id } });
    if (!existingLot) {
      existingLot = await prisma.lot.findFirst({
        where: {
          OR: [
            { id },
            { number: id },
          ],
        },
      });
    }

    if (!existingLot) {
      return res.status(404).json({ success: false, data: null, message: 'Lote não encontrado' });
    }

    const lot = await prisma.$transaction(async (tx) => {
      const updatedLot = await tx.lot.update({
        where: { id: existingLot!.id },
        data: {
          ...data,
          status: normalizedStatus !== undefined ? normalizedStatus : undefined,
        },
      });

      // Se foi enviado um personId para associar um titular existente ou atualizar titular
      if (req.body.personId !== undefined) {
        // Desativar ocupações anteriores
        await tx.occupancy.updateMany({
          where: { lotId: existingLot!.id, current: true },
          data: { current: false },
        });

        if (req.body.personId) {
          await tx.occupancy.create({
            data: {
              personId: req.body.personId,
              lotId: existingLot!.id,
              type: 'OWNER',
              startDate: new Date(),
              current: true,
            },
          });

          // Atualizar também o titular nos contratos do lote, se existirem
          await tx.contract.updateMany({
            where: { lotId: existingLot!.id },
            data: { personId: req.body.personId },
          });
        }
      } else if (owner) {
        const currentOwner = await tx.occupancy.findFirst({
          where: { lotId: existingLot!.id, current: true, type: 'OWNER' },
          select: { personId: true },
        });

        const personData = {
          fullName: owner.fullName,
          cpf: owner.cpf,
          rg: owner.rg,
          birthDate: owner.birthDate ? new Date(owner.birthDate) : undefined,
          phone: owner.phone,
          whatsapp: owner.whatsapp,
          email: owner.email,
          motherName: owner.motherName,
          fatherName: owner.fatherName,
          profession: owner.profession,
          maritalStatus: owner.maritalStatus,
          rgIssuer: owner.rgIssuer,
          observations: owner.observations,
        };

        let personId = currentOwner?.personId;
        if (personId) {
          await tx.person.update({ where: { id: personId }, data: personData });
        } else {
          const person = owner.cpf
            ? await tx.person.upsert({
                where: { cpf: owner.cpf },
                update: personData,
                create: { ...personData, cpf: owner.cpf },
              })
            : await tx.person.create({ data: personData });
          personId = person.id;
          await tx.occupancy.create({
            data: { personId, lotId: existingLot!.id, type: 'OWNER', startDate: new Date(), current: true },
          });
        }

        if (owner.spouse) {
          await tx.spouse.upsert({
            where: { personId },
            update: owner.spouse,
            create: { personId, ...owner.spouse },
          });
        } else {
          await tx.spouse.deleteMany({ where: { personId } });
        }
      }

      return updatedLot;
    });

    // Se houve alteração de titular ou dados do lote, sincroniza pasta no Google Drive
    syncLotOwnerChanged(lot.id).catch((err) =>
      console.error('[LotController] Erro ao sincronizar alteração de pasta no Drive:', err)
    );

    // Notifica WhatsApp em background se houve alteração de titular
    if (owner?.fullName) {
      (async () => {
        try {
          const l = await prisma.lot.findUnique({
            where: { id: lot.id },
            include: { project: true, block: true },
          });
          notifyOccupantChanged({
            personName: owner.fullName,
            cpf: owner.cpf,
            projectName: l?.project?.name,
            blockNumber: l?.block?.number,
            lotNumber: l?.number,
            action: 'ALTERADO',
            operatorName: (req as any).user?.name,
          });
        } catch {}
      })();
    }

    return res.json({ success: true, data: lot, message: 'Lote atualizado' });
  } catch (err: any) {
    return res.status(500).json({ success: false, data: null, message: err.message || 'Erro ao atualizar lote' });
  }
}

export async function deleteLot(req: Request, res: Response) {
  const { id } = req.params;
  try {
    await prisma.$transaction(async (tx) => {
      const contracts = await tx.contract.findMany({
        where: { lotId: id },
        select: { id: true },
      });
      const contractIds = contracts.map((contract) => contract.id);
      const negotiations = contractIds.length
        ? await tx.negotiation.findMany({ where: { contractId: { in: contractIds } }, select: { id: true } })
        : [];
      const negotiationIds = negotiations.map((negotiation) => negotiation.id);
      const installments = negotiationIds.length
        ? await tx.installment.findMany({ where: { negotiationId: { in: negotiationIds } }, select: { id: true } })
        : [];
      const installmentIds = installments.map((installment) => installment.id);

      if (installmentIds.length) await tx.payment.deleteMany({ where: { installmentId: { in: installmentIds } } });
      if (negotiationIds.length) await tx.installment.deleteMany({ where: { negotiationId: { in: negotiationIds } } });
      if (contractIds.length) {
        await tx.contractChain.deleteMany({ where: { contractId: { in: contractIds } } });
        await tx.negotiation.deleteMany({ where: { contractId: { in: contractIds } } });
        await tx.contract.deleteMany({ where: { id: { in: contractIds } } });
      }
      await tx.expense.deleteMany({ where: { lotId: id } });
      await tx.document.deleteMany({ where: { lotId: id } });
      await tx.occupancy.deleteMany({ where: { lotId: id } });
      await tx.serviceRecord.deleteMany({ where: { lotId: id } });
      await tx.lot.delete({ where: { id } });
    });
    return res.json({ success: true, data: null, message: 'Lote excluído com sucesso' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Não foi possível excluir o lote.';
    return res.status(400).json({ success: false, data: null, message });
  }
}
