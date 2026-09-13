import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { prisma } from '../prisma/client';
import { syncDocumentAdded, syncDocumentDeleted, syncAllDrive, getLotDrivePath, getDriveBasePath } from '../services/googleDriveSync.service';

const statusSchema = z.enum(['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'NOT_APPLICABLE', 'EXPIRED', 'ILLEGIBLE']);

export async function listDocumentTypes(req: Request, res: Response) {
  const types = await prisma.documentType.findMany({ where: { active: true }, orderBy: [{ category: 'asc' }, { name: 'asc' }] });
  return res.json({ success: true, data: types, message: 'Tipos de documento carregados' });
}

export async function listDocuments(req: Request, res: Response) {
  const status = req.query.status ? statusSchema.safeParse(req.query.status) : null;
  if (status && !status.success) return res.status(400).json({ success: false, data: null, message: 'Status inválido' });

  const documents = await prisma.document.findMany({
    where: status?.success ? { status: status.data } : undefined,
    include: {
      person: { select: { id: true, fullName: true, cpf: true } },
      documentType: { select: { id: true, name: true, category: true } },
      lot: { select: { id: true, number: true } },
      uploadedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return res.json({ success: true, data: documents, message: 'Documentos carregados' });
}

export async function getDossiersControl(req: Request, res: Response) {
  try {
    const { projectId, blockId, search, statusFilter } = req.query;

    const lots = await prisma.lot.findMany({
      where: {
        projectId: typeof projectId === 'string' && projectId ? projectId : undefined,
        blockId: typeof blockId === 'string' && blockId ? blockId : undefined,
        ...(typeof search === 'string' && search.trim()
          ? {
              OR: [
                { number: { contains: search.trim(), mode: 'insensitive' } },
                {
                  occupancies: {
                    some: {
                      current: true,
                      type: 'OWNER',
                      person: {
                        OR: [
                          { fullName: { contains: search.trim(), mode: 'insensitive' } },
                          { cpf: { contains: search.trim().replace(/\D/g, '') } },
                        ],
                      },
                    },
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        project: { select: { id: true, name: true } },
        block: { select: { id: true, number: true } },
        occupancies: {
          where: { current: true, type: 'OWNER' },
          include: {
            person: {
              include: {
                spouse: true,
              },
            },
          },
        },
        documents: {
          include: {
            documentType: true,
            uploadedBy: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: [{ project: { name: 'asc' } }, { block: { number: 'asc' } }, { number: 'asc' }],
    });

    const CHECKLIST_DEFINITIONS = [
      {
        key: 'doc_titular',
        label: 'RG/CPF Titular',
        categories: ['RG/CPF ou CNH do Titular', 'Documento Pessoal', 'Documento de identidade', 'CPF', 'RG', 'CNH'],
        required: true,
      },
      {
        key: 'doc_spouse',
        label: 'Doc. Cônjuge',
        categories: ['Documento do Cônjuge', 'Documento do conjuge', 'RG Cônjuge', 'CPF Cônjuge'],
        requiresSpouse: true,
      },
      {
        key: 'civil_cert',
        label: 'Certidão Civil',
        categories: ['Certidão de Casamento ou Nascimento', 'Certidão de casamento', 'Certidão de nascimento', 'Certidão'],
        required: true,
      },
      {
        key: 'residence_proof',
        label: 'Comprovante Residência',
        categories: ['Comprovante de Residência', 'Comprovante de residência', 'Comprovante residência', 'Comprovante'],
        required: true,
      },
      {
        key: 'purchase_contract',
        label: 'Contrato Compra/Venda',
        categories: ['Contrato de Compra e Venda do Lote', 'Compra e Venda', 'Contrato Compra e Venda', 'Contrato de Compra', 'Recibo de Compra'],
        required: true,
      },
      {
        key: 'chain_contract',
        label: 'Cadeia Dominial',
        categories: ['Sequência de Contrato (Cadeia Dominial)', 'Cadeia Dominial', 'Sequência de Contrato', 'Cadeia de Contrato'],
        required: false,
      },
      {
        key: 'service_contract',
        label: 'Termo Adesão REURB',
        categories: ['Contrato de Prestação de Serviços (REURB)', 'Termo de Adesão', 'Prestação de Serviços', 'Contrato REURB'],
        required: true,
      },
      {
        key: 'complementary',
        label: 'Docs Complementares',
        categories: ['Documentos Complementares', 'Complementar', 'IPTU', 'Memorial', 'Topografia'],
        required: false,
      },
    ];

    let completeCount = 0;
    let pendingCount = 0;
    let emptyCount = 0;
    let noOwnerCount = 0;
    let totalDocs = 0;

    const dossiers = lots.map((lot) => {
      const owner = lot.occupancies[0]?.person || null;
      const isMarried = Boolean(
        owner?.maritalStatus === 'CASADO' ||
        owner?.maritalStatus === 'Casado(a)' ||
        owner?.maritalStatus === 'UNIAO_ESTAVEL' ||
        owner?.maritalStatus === 'União estável' ||
        owner?.spouse
      );

      const lotDocs = lot.documents || [];
      totalDocs += lotDocs.length;

      const checklistStatus = CHECKLIST_DEFINITIONS.map((def) => {
        const isRequired = def.requiresSpouse ? isMarried : Boolean(def.required);
        const attachedDocs = lotDocs.filter((d) => {
          const cat = (d.category || d.documentType?.name || d.originalName || '').toLowerCase();
          return def.categories.some((c) => cat.includes(c.toLowerCase()));
        });

        return {
          key: def.key,
          label: def.label,
          required: isRequired,
          isApplicable: def.requiresSpouse ? isMarried : true,
          count: attachedDocs.length,
          hasDoc: attachedDocs.length > 0,
          documents: attachedDocs,
        };
      });

      const requiredItems = checklistStatus.filter((i) => i.required);
      const completedRequired = requiredItems.filter((i) => i.hasDoc).length;
      const progressPercent = requiredItems.length > 0 ? Math.round((completedRequired / requiredItems.length) * 100) : 0;

      let status: 'COMPLETE' | 'PENDING' | 'EMPTY' | 'NO_OWNER' = 'EMPTY';
      if (!owner) {
        status = 'NO_OWNER';
        noOwnerCount++;
      } else if (progressPercent === 100) {
        status = 'COMPLETE';
        completeCount++;
      } else if (lotDocs.length > 0) {
        status = 'PENDING';
        pendingCount++;
      } else {
        status = 'EMPTY';
        emptyCount++;
      }

      const drivePath = getLotDrivePath(lot.project.name, lot.block.number, lot.number, owner);

      return {
        id: lot.id,
        lotNumber: lot.number,
        block: { id: lot.block.id, number: lot.block.number },
        project: { id: lot.project.id, name: lot.project.name },
        owner: owner
          ? {
              id: owner.id,
              fullName: owner.fullName,
              cpf: owner.cpf,
              phone: owner.phone,
              maritalStatus: owner.maritalStatus,
              spouse: owner.spouse ? { fullName: owner.spouse.fullName, cpf: owner.spouse.cpf } : null,
            }
          : null,
        status,
        progressPercent,
        completedRequired,
        totalRequired: requiredItems.length,
        totalUploaded: lotDocs.length,
        checklist: checklistStatus,
        documents: lotDocs,
        drivePath,
      };
    });

    const filteredDossiers = statusFilter
      ? dossiers.filter((d) => {
          if (statusFilter === 'COMPLETE') return d.status === 'COMPLETE';
          if (statusFilter === 'PENDING') return d.status === 'PENDING';
          if (statusFilter === 'EMPTY') return d.status === 'EMPTY';
          if (statusFilter === 'NO_OWNER') return d.status === 'NO_OWNER';
          return true;
        })
      : dossiers;

    return res.json({
      success: true,
      data: {
        summary: {
          totalLots: lots.length,
          completeCount,
          pendingCount,
          emptyCount,
          noOwnerCount,
          totalDocs,
          driveBaseExists: Boolean(getDriveBasePath()),
          driveBasePath: getDriveBasePath() || 'G:\\Meu Drive\\GENESIS_REURB',
        },
        dossiers: filteredDossiers,
      },
      message: 'Controle de dossiês carregado com sucesso',
    });
  } catch (error: any) {
    console.error('[DocumentController] Erro ao carregar dossiês:', error);
    return res.status(500).json({ success: false, data: null, message: 'Erro ao carregar controle de dossiês' });
  }
}

export async function createDocument(req: Request, res: Response) {
  const result = z.object({
    personId: z.string().optional(),
    documentTypeId: z.string().optional(),
    lotId: z.string().optional(),
    contractId: z.string().optional(),
    category: z.string().optional(),
    notes: z.string().optional(),
  }).safeParse(req.body);

  if (!result.success || !req.file || !req.user) {
    return res.status(400).json({ success: false, data: null, message: 'Arquivo é obrigatório' });
  }

  let documentTypeId = result.data.documentTypeId || null;
  const categoryName = result.data.category?.trim() || null;

  if (!documentTypeId && categoryName) {
    let matchingType = await prisma.documentType.findFirst({
      where: {
        active: true,
        name: { equals: categoryName, mode: 'insensitive' },
      },
    });

    if (!matchingType) {
      matchingType = await prisma.documentType.findFirst({
        where: {
          active: true,
          category: { equals: categoryName, mode: 'insensitive' },
        },
      });
    }

    if (!matchingType) {
      matchingType = await prisma.documentType.create({
        data: {
          name: categoryName,
          category: categoryName,
          active: true,
          required: false,
        },
      });
    }
    documentTypeId = matchingType.id;
  }

  if (!documentTypeId) {
    let defaultType = await prisma.documentType.findFirst({
      where: { active: true, name: { equals: 'Outros Documentos', mode: 'insensitive' } },
    });
    if (!defaultType) {
      defaultType = await prisma.documentType.create({
        data: {
          name: 'Outros Documentos',
          category: 'Geral',
          active: true,
          required: false,
        },
      });
    }
    documentTypeId = defaultType.id;
  }

  let personId = result.data.personId || null;
  if (!personId && result.data.lotId) {
    const occupancy = await prisma.occupancy.findFirst({
      where: { lotId: result.data.lotId, current: true, type: 'OWNER' },
      select: { personId: true },
    });
    personId = occupancy?.personId || null;
  }

  const document = await prisma.document.create({
    data: {
      personId,
      documentTypeId,
      lotId: result.data.lotId || null,
      contractId: result.data.contractId || null,
      category: result.data.category || 'Geral',
      notes: result.data.notes || null,
      originalName: req.file.originalname,
      fileName: req.file.filename,
      filePath: `/uploads/documents/${req.file.filename}`,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadedById: req.user.id,
    },
    include: { person: true, documentType: true, uploadedBy: { select: { name: true } } },
  });

  syncDocumentAdded(document.id).catch((err) =>
    console.error('[DocumentController] Erro ao sincronizar com Google Drive:', err)
  );

  return res.status(201).json({ success: true, data: document, message: 'Documento enviado' });
}

export async function updateDocumentStatus(req: Request, res: Response) {
  const result = statusSchema.safeParse(req.body.status);
  if (!result.success) return res.status(400).json({ success: false, data: null, message: 'Status inválido' });

  try {
    const document = await prisma.document.update({ where: { id: req.params.id }, data: { status: result.data } });
    return res.json({ success: true, data: document, message: 'Status atualizado' });
  } catch {
    return res.status(404).json({ success: false, data: null, message: 'Documento não encontrado' });
  }
}

export async function deleteDocument(req: Request, res: Response) {
  try {
    const document = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!document) return res.status(404).json({ success: false, data: null, message: 'Documento não encontrado' });

    const fullPath = path.resolve(process.cwd(), '../uploads/documents', document.fileName);
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
      } catch (e) {}
    }

    await syncDocumentDeleted(req.params.id);
    await prisma.document.delete({ where: { id: req.params.id } });
    return res.json({ success: true, data: null, message: 'Documento excluído com sucesso' });
  } catch (error) {
    return res.status(500).json({ success: false, data: null, message: 'Não foi possível excluir o documento' });
  }
}

export async function syncDrive(req: Request, res: Response) {
  try {
    const result = await syncAllDrive();
    return res.json({
      success: true,
      data: result,
      message: `Sincronização concluída. Total: ${result.total}, Sincronizados: ${result.synced}, Erros: ${result.errors}`,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      data: null,
      message: error?.message || 'Erro ao sincronizar com Google Drive',
    });
  }
}