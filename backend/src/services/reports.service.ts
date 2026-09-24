import { prisma } from '../prisma/client';
import PDFDocument from 'pdfkit';
import XLSX from 'xlsx';

export interface ReportFilterParams {
  projectId?: string;
  responsibleId?: string;
  status?: string;
  situation?: string;
  referenceDate?: string;
  startDate?: string;
  endDate?: string;
  docType?: string;
  isOverdueOnly?: boolean | string;
  agingBracket?: string;
  search?: string;
}

// ---------------------------------------------------------------------------
// 1. PENDÊNCIAS POR LOTE (CATEGORIA PROJETOS)
// ---------------------------------------------------------------------------
export async function getLotPendenciesReport(filters: ReportFilterParams) {
  const now = new Date();

  // 1. Fetch ServiceRecords
  const services = await prisma.serviceRecord.findMany({
    where: {
      projectId: filters.projectId || undefined,
      userId: filters.responsibleId || undefined,
      ...(filters.startDate || filters.endDate ? {
        serviceDate: {
          gte: filters.startDate ? new Date(filters.startDate) : undefined,
          lte: filters.endDate ? new Date(filters.endDate + 'T23:59:59.999Z') : undefined,
        }
      } : {})
    },
    include: {
      project: { select: { id: true, name: true } },
      lot: { select: { id: true, number: true, block: { select: { number: true } } } },
      person: { select: { id: true, fullName: true, cpf: true, phone: true } },
      user: { select: { id: true, name: true } }
    },
    orderBy: { serviceDate: 'desc' }
  });

  // 2. Fetch Lots with documentary or cadastral issues
  const lots = await prisma.lot.findMany({
    where: {
      projectId: filters.projectId || undefined,
      active: true,
      ...(filters.search ? {
        OR: [
          { number: { contains: filters.search.trim(), mode: 'insensitive' } },
          { block: { number: { contains: filters.search.trim(), mode: 'insensitive' } } }
        ]
      } : {})
    },
    include: {
      project: { select: { id: true, name: true } },
      block: { select: { id: true, number: true } },
      occupancies: {
        where: { current: true },
        include: { person: true }
      },
      documents: {
        include: {
          documentType: true,
          uploadedBy: { select: { id: true, name: true } }
        }
      }
    },
    orderBy: [{ project: { name: 'asc' } }, { block: { number: 'asc' } }, { number: 'asc' }]
  });

  interface PendencyRow {
    id: string;
    lotId: string;
    projectId: string;
    projectName: string;
    blockNumber: string;
    lotNumber: string;
    quadraLote: string;
    occupant: string;
    occupantCpf: string;
    occupantPhone: string;
    type: string;
    description: string;
    responsible: string;
    responsibleId?: string;
    createdAt: string;
    deadline: string | null;
    situation: 'Em aberto' | 'Vencida' | 'Precisa de correção' | 'Em análise';
    isOverdue: boolean;
    daysOpen: number;
  }

  const rows: PendencyRow[] = [];

  // Transform ServiceRecords into pendency rows
  for (const s of services) {
    const sDate = new Date(s.serviceDate);
    const deadline = s.nextContactDate ? new Date(s.nextContactDate) : null;
    const isOverdue = deadline ? deadline < now : false;
    const daysOpen = Math.max(0, Math.floor((now.getTime() - sDate.getTime()) / (1000 * 60 * 60 * 24)));
    const situation = isOverdue ? 'Vencida' : 'Em aberto';

    rows.push({
      id: `srv-${s.id}`,
      lotId: s.lot.id,
      projectId: s.project.id,
      projectName: s.project.name,
      blockNumber: s.lot.block.number,
      lotNumber: s.lot.number,
      quadraLote: `Q${s.lot.block.number} L${s.lot.number}`,
      occupant: s.person.fullName,
      occupantCpf: s.person.cpf || '',
      occupantPhone: s.person.phone || '',
      type: 'Atendimento / Campo',
      description: s.pendingActions ? `${s.pendingActions} (${s.description})` : s.description,
      responsible: s.user?.name || 'Não atribuído',
      responsibleId: s.user?.id,
      createdAt: sDate.toISOString().slice(0, 10),
      deadline: deadline ? deadline.toISOString().slice(0, 10) : null,
      situation,
      isOverdue,
      daysOpen
    });
  }

  // Add documentary pendencies from lots (documents that are REJECTED, ILLEGIBLE, EXPIRED or pending for > 7 days)
  for (const lot of lots) {
    const occupant = lot.occupancies[0]?.person;
    const occupantName = occupant?.fullName || 'Sem titular vinculado';
    const occupantCpf = occupant?.cpf || '';
    const occupantPhone = occupant?.phone || '';

    // Check problematic documents
    for (const doc of lot.documents) {
      if (['REJECTED', 'ILLEGIBLE', 'EXPIRED', 'PENDING'].includes(doc.status)) {
        const docDate = new Date(doc.createdAt);
        const daysOpen = Math.max(0, Math.floor((now.getTime() - docDate.getTime()) / (1000 * 60 * 60 * 24)));
        const deadline = doc.expirationDate ? new Date(doc.expirationDate) : null;
        const isOverdue = deadline ? deadline < now : daysOpen > 15;
        let situation: 'Em aberto' | 'Vencida' | 'Precisa de correção' | 'Em análise' = 'Em análise';

        if (doc.status === 'REJECTED' || doc.status === 'ILLEGIBLE' || doc.status === 'EXPIRED') {
          situation = 'Precisa de correção';
        } else if (isOverdue) {
          situation = 'Vencida';
        } else {
          situation = 'Em aberto';
        }

        const docTypeName = doc.documentType?.name || doc.category || 'Documento';
        const docDesc = doc.notes 
          ? `${docTypeName}: ${doc.notes}`
          : `${docTypeName} aguardando regularização/análise (${doc.originalName})`;

        rows.push({
          id: `doc-${doc.id}`,
          lotId: lot.id,
          projectId: lot.project.id,
          projectName: lot.project.name,
          blockNumber: lot.block.number,
          lotNumber: lot.number,
          quadraLote: `Q${lot.block.number} L${lot.number}`,
          occupant: occupantName,
          occupantCpf,
          occupantPhone,
          type: 'Documental',
          description: docDesc,
          responsible: doc.uploadedBy?.name || 'Administrador',
          responsibleId: doc.uploadedById,
          createdAt: docDate.toISOString().slice(0, 10),
          deadline: deadline ? deadline.toISOString().slice(0, 10) : null,
          situation,
          isOverdue,
          daysOpen
        });
      }
    }

    // Check cadastral pendency: missing CPF or contact
    if (occupant && (!occupant.cpf || (!occupant.phone && !occupant.whatsapp))) {
      const lotDate = new Date(lot.createdAt);
      const daysOpen = Math.max(0, Math.floor((now.getTime() - lotDate.getTime()) / (1000 * 60 * 60 * 24)));
      const missingFields: string[] = [];
      if (!occupant.cpf) missingFields.push('CPF');
      if (!occupant.phone && !occupant.whatsapp) missingFields.push('Telefone de Contato');

      rows.push({
        id: `cad-${lot.id}`,
        lotId: lot.id,
        projectId: lot.project.id,
        projectName: lot.project.name,
        blockNumber: lot.block.number,
        lotNumber: lot.number,
        quadraLote: `Q${lot.block.number} L${lot.number}`,
        occupant: occupantName,
        occupantCpf,
        occupantPhone,
        type: 'Cadastral',
        description: `Cadastro incompleto do ocupante: falta ${missingFields.join(' e ')}`,
        responsible: 'Equipe de Atendimento',
        createdAt: lotDate.toISOString().slice(0, 10),
        deadline: null,
        situation: 'Em aberto',
        isOverdue: false,
        daysOpen
      });
    }
  }

  // Apply filters in memory
  let filteredRows = rows;

  if (filters.responsibleId) {
    filteredRows = filteredRows.filter(r => r.responsibleId === filters.responsibleId || r.responsible.toLowerCase().includes(filters.responsibleId!.toLowerCase()));
  }

  if (filters.situation && filters.situation !== 'ALL') {
    filteredRows = filteredRows.filter(r => r.situation.toLowerCase() === filters.situation!.toLowerCase());
  }

  const isOverdueOnlyBool = filters.isOverdueOnly === true || filters.isOverdueOnly === 'true';
  if (isOverdueOnlyBool) {
    filteredRows = filteredRows.filter(r => r.isOverdue);
  }

  if (filters.search) {
    const s = filters.search.toLowerCase().trim();
    filteredRows = filteredRows.filter(r =>
      r.projectName.toLowerCase().includes(s) ||
      r.quadraLote.toLowerCase().includes(s) ||
      r.occupant.toLowerCase().includes(s) ||
      r.description.toLowerCase().includes(s) ||
      r.responsible.toLowerCase().includes(s)
    );
  }

  // Indicators calculation
  const distinctLotIds = new Set(filteredRows.map(r => r.lotId));
  const lotsWithPendencies = distinctLotIds.size;
  const openPendencies = filteredRows.filter(r => r.situation === 'Em aberto' || r.situation === 'Precisa de correção').length;
  const overduePendencies = filteredRows.filter(r => r.isOverdue || r.situation === 'Vencida').length;

  return {
    reportType: 'lot-pendencies',
    title: 'Relatório de Pendências por Lote',
    category: 'Projetos',
    generatedAt: now.toISOString(),
    filterPeriodUsed: 'Data do registro da pendência ou atendimento',
    indicators: {
      lotsWithPendencies,
      openPendencies,
      overduePendencies,
      totalPendencies: filteredRows.length
    },
    totalRecords: filteredRows.length,
    rows: filteredRows
  };
}

// ---------------------------------------------------------------------------
// 2. CHECKLIST DOCUMENTAL (CATEGORIA DOCUMENTOS)
// ---------------------------------------------------------------------------
export async function getDocumentChecklistReport(filters: ReportFilterParams) {
  const now = new Date();

  const CHECKLIST_DEFINITIONS = [
    {
      key: 'doc_titular',
      label: 'RG/CPF ou CNH do Titular',
      categories: ['rg/cpf ou cnh do titular', 'rg, cpf ou cnh do titular', 'documento pessoal', 'documento de identidade', 'cpf', 'rg', 'cnh'],
      required: true,
      requiresSpouse: false,
    },
    {
      key: 'doc_spouse',
      label: 'Documento do Cônjuge',
      categories: ['documento do conjuge', 'documento do cônjuge', 'rg cônjuge', 'cpf cônjuge'],
      required: false,
      requiresSpouse: true,
    },
    {
      key: 'civil_cert',
      label: 'Certidão de Nascimento ou Casamento',
      categories: ['certidao de casamento ou nascimento', 'certidão de casamento ou nascimento', 'certidão de nascimento ou casamento', 'certidao de nascimento ou casamento', 'certidao civil', 'certidão civil', 'certidao', 'certidão'],
      required: true,
      requiresSpouse: false,
    },
    {
      key: 'residence_proof',
      label: 'Comprovante de Residência',
      categories: ['comprovante de residencia', 'comprovante de residência', 'comprovante residencia', 'comprovante residência', 'comprovante'],
      required: true,
      requiresSpouse: false,
    },
    {
      key: 'purchase_contract',
      label: 'Contrato de Compra e Venda',
      categories: ['contrato de compra e venda do lote', 'contrato de compra e venda', 'contrato assinado', 'compra e venda', 'contrato compra e venda', 'contrato de compra', 'recibo de compra'],
      required: true,
      requiresSpouse: false,
    },
    {
      key: 'chain_contract',
      label: 'Cadeia Dominial (Contratos Anteriores)',
      categories: ['sequencia de contrato (cadeia dominial)', 'sequência de contrato (cadeia dominial)', 'cadeia dominial (contratos anteriores)', 'cadeia dominial', 'sequencia de contrato', 'sequência de contrato', 'cadeia de contrato'],
      required: false,
      requiresSpouse: false,
    },
    {
      key: 'service_contract',
      label: 'Contrato / Termo de Adesão REURB',
      categories: ['contrato de prestacao de servicos (reurb)', 'contrato de prestação de serviços (reurb)', 'contrato de prestacao de servicos', 'contrato de prestação de serviços', 'contrato / termo de adesao reurb', 'contrato / termo de adesão reurb', 'termo de adesao', 'termo de adesão', 'prestacao de servicos', 'prestação de serviços', 'contrato reurb'],
      required: true,
      requiresSpouse: false,
    },
    {
      key: 'complementary',
      label: 'Documentos Complementares (IPTU, Planta)',
      categories: ['documentos complementares', 'documentos complementares (iptu, planta)', 'documento tecnico', 'documento técnico', 'planta e topografia', 'outros', 'complementar', 'iptu', 'memorial', 'topografia'],
      required: false,
      requiresSpouse: false,
    }
  ];

  const lots = await prisma.lot.findMany({
    where: {
      projectId: filters.projectId || undefined,
      active: true,
      ...(filters.startDate || filters.endDate ? {
        createdAt: {
          gte: filters.startDate ? new Date(filters.startDate) : undefined,
          lte: filters.endDate ? new Date(filters.endDate + 'T23:59:59.999Z') : undefined,
        }
      } : {})
    },
    include: {
      project: { select: { id: true, name: true } },
      block: { select: { id: true, number: true } },
      occupancies: {
        where: { current: true },
        include: {
          person: {
            include: { spouse: true }
          }
        }
      },
      documents: {
        include: {
          documentType: true,
          uploadedBy: { select: { id: true, name: true } }
        },
        orderBy: { createdAt: 'desc' }
      }
    },
    orderBy: [{ project: { name: 'asc' } }, { block: { number: 'asc' } }, { number: 'asc' }]
  });

  interface ChecklistRow {
    id: string;
    lotId: string;
    projectId: string;
    projectName: string;
    blockNumber: string;
    lotNumber: string;
    quadraLote: string;
    occupant: string;
    occupantCpf: string;
    hasSpouse: boolean;
    requiredDocKey: string;
    requiredDocLabel: string;
    isRequired: boolean;
    situation: 'Não entregue' | 'Em análise' | 'Aprovado' | 'Precisa de correção';
    situationCode: 'NOT_DELIVERED' | 'UNDER_REVIEW' | 'APPROVED' | 'CORRECTION_NEEDED';
    deliveryDate: string | null;
    documentId: string | null;
    fileName: string | null;
    filePath: string | null;
    pendingReason: string | null;
  }

  const rows: ChecklistRow[] = [];

  for (const lot of lots) {
    const occupant = lot.occupancies[0]?.person;
    const occupantName = occupant?.fullName || 'Lote vago / Sem ocupante';
    const occupantCpf = occupant?.cpf || '';
    const hasSpouse = !!(occupant?.spouse || (occupant?.maritalStatus && ['MARRIED', 'STABLE_UNION', 'CASADO', 'UNIAO_ESTAVEL'].includes(occupant.maritalStatus.toUpperCase())));

    // Evaluate each checklist requirement
    for (const def of CHECKLIST_DEFINITIONS) {
      const isApplicable = def.requiresSpouse ? hasSpouse : def.required;
      // If document is not required and not applicable, skip or only include if required is true
      if (!def.required && !def.requiresSpouse) {
        continue; // Only evaluate mandatory requirements for the official checklist report
      }
      if (def.requiresSpouse && !hasSpouse) {
        continue; // Not required if no spouse
      }

      // Find matching uploaded document
      const matchingDocs = lot.documents.filter(d => {
        const cat = (d.category || '').toLowerCase();
        const typeName = (d.documentType?.name || '').toLowerCase();
        return def.categories.some(c => cat.includes(c) || typeName.includes(c));
      });

      const bestDoc = matchingDocs[0] || null;

      let situation: 'Não entregue' | 'Em análise' | 'Aprovado' | 'Precisa de correção' = 'Não entregue';
      let situationCode: 'NOT_DELIVERED' | 'UNDER_REVIEW' | 'APPROVED' | 'CORRECTION_NEEDED' = 'NOT_DELIVERED';
      let pendingReason: string | null = null;
      let deliveryDate: string | null = null;

      if (!bestDoc) {
        situation = 'Não entregue';
        situationCode = 'NOT_DELIVERED';
        pendingReason = 'Documento obrigatório ainda não foi anexado ao dossiê.';
      } else {
        deliveryDate = bestDoc.createdAt.toISOString().slice(0, 10);
        if (bestDoc.status === 'APPROVED') {
          // Check expiration
          if (bestDoc.expirationDate && bestDoc.expirationDate < now) {
            situation = 'Precisa de correção';
            situationCode = 'CORRECTION_NEEDED';
            pendingReason = 'Documento vencido (validade expirada). Necessário renovar.';
          } else {
            situation = 'Aprovado';
            situationCode = 'APPROVED';
          }
        } else if (bestDoc.status === 'REJECTED' || bestDoc.status === 'ILLEGIBLE' || bestDoc.status === 'EXPIRED') {
          situation = 'Precisa de correção';
          situationCode = 'CORRECTION_NEEDED';
          pendingReason = bestDoc.notes || (bestDoc.status === 'ILLEGIBLE' ? 'Documento ilegível. Reenviar digitalização com maior resolução.' : 'Documento rejeitado na análise técnica.');
        } else {
          situation = 'Em análise';
          situationCode = 'UNDER_REVIEW';
          pendingReason = bestDoc.notes || 'Documento em fila de validação técnica.';
        }
      }

      rows.push({
        id: `${lot.id}-${def.key}`,
        lotId: lot.id,
        projectId: lot.project.id,
        projectName: lot.project.name,
        blockNumber: lot.block.number,
        lotNumber: lot.number,
        quadraLote: `Q${lot.block.number} L${lot.number}`,
        occupant: occupantName,
        occupantCpf,
        hasSpouse,
        requiredDocKey: def.key,
        requiredDocLabel: def.label,
        isRequired: true,
        situation,
        situationCode,
        deliveryDate,
        documentId: bestDoc?.id || null,
        fileName: bestDoc?.originalName || null,
        filePath: bestDoc?.filePath || null,
        pendingReason
      });
    }
  }

  // Apply filters
  let filteredRows = rows;

  if (filters.docType && filters.docType !== 'ALL') {
    filteredRows = filteredRows.filter(r => r.requiredDocKey === filters.docType || r.requiredDocLabel.toLowerCase().includes(filters.docType!.toLowerCase()));
  }

  if (filters.situation && filters.situation !== 'ALL') {
    filteredRows = filteredRows.filter(r => r.situationCode === filters.situation || r.situation.toLowerCase() === filters.situation!.toLowerCase());
  }

  if (filters.search) {
    const s = filters.search.toLowerCase().trim();
    filteredRows = filteredRows.filter(r =>
      r.projectName.toLowerCase().includes(s) ||
      r.quadraLote.toLowerCase().includes(s) ||
      r.occupant.toLowerCase().includes(s) ||
      r.requiredDocLabel.toLowerCase().includes(s)
    );
  }

  // Indicators
  const notDeliveredCount = filteredRows.filter(r => r.situationCode === 'NOT_DELIVERED').length;
  const underReviewCount = filteredRows.filter(r => r.situationCode === 'UNDER_REVIEW').length;
  const correctionNeededCount = filteredRows.filter(r => r.situationCode === 'CORRECTION_NEEDED').length;
  const approvedCount = filteredRows.filter(r => r.situationCode === 'APPROVED').length;

  return {
    reportType: 'document-checklist',
    title: 'Relatório de Checklist Documental',
    category: 'Documentos',
    generatedAt: now.toISOString(),
    filterPeriodUsed: 'Data de entrega do documento (upload) ou criação do lote',
    indicators: {
      notDeliveredCount,
      underReviewCount,
      correctionNeededCount,
      approvedCount,
      totalChecked: filteredRows.length
    },
    totalRecords: filteredRows.length,
    rows: filteredRows
  };
}

// ---------------------------------------------------------------------------
// 3. PARCELAS EM ATRASO (CATEGORIA FINANCEIRO)
// ---------------------------------------------------------------------------
export async function getOverdueInstallmentsReport(filters: ReportFilterParams) {
  const refDate = filters.referenceDate ? new Date(filters.referenceDate + 'T23:59:59.999Z') : new Date();

  // Installments with dueDate < refDate and status not CANCELED or RENEGOTIATED
  const installments = await prisma.installment.findMany({
    where: {
      dueDate: {
        lt: refDate,
        ...(filters.startDate ? { gte: new Date(filters.startDate) } : {}),
        ...(filters.endDate ? { lte: new Date(filters.endDate + 'T23:59:59.999Z') } : {})
      },
      status: {
        in: ['PENDING', 'OVERDUE', 'PARTIALLY_PAID']
      },
      negotiation: {
        contract: {
          projectId: filters.projectId || undefined,
          status: { notIn: ['CANCELED', 'CANCELADO', 'DISTRATTO'] }
        }
      }
    },
    include: {
      negotiation: {
        include: {
          contract: {
            include: {
              project: { select: { id: true, name: true } },
              person: { select: { id: true, fullName: true, cpf: true, phone: true } },
              lot: { select: { id: true, number: true, block: { select: { number: true } } } }
            }
          }
        }
      }
    },
    orderBy: { dueDate: 'asc' }
  });

  interface OverdueRow {
    id: string;
    contractId: string;
    contractNumber: string;
    personId: string;
    personName: string;
    personPhone: string;
    projectId: string;
    projectName: string;
    lotId: string;
    quadraLote: string;
    installmentNumber: number;
    installmentLabel: string;
    dueDate: string;
    dueAmount: number;
    paidAmount: number;
    openAmount: number;
    daysOverdue: number;
    agingBracket: 'Até 30 dias' | '31–60 dias' | '61–90 dias' | 'Acima de 90 dias';
    status: string;
  }

  const rows: OverdueRow[] = [];

  for (const inst of installments) {
    const openAmount = Math.round((inst.amount - inst.paidAmount) * 100) / 100;
    // Only consider overdue if positive open balance
    if (openAmount <= 0.01) continue;

    const dDate = new Date(inst.dueDate);
    const daysOverdue = Math.max(1, Math.floor((refDate.getTime() - dDate.getTime()) / (1000 * 60 * 60 * 24)));

    let agingBracket: 'Até 30 dias' | '31–60 dias' | '61–90 dias' | 'Acima de 90 dias' = 'Até 30 dias';
    if (daysOverdue <= 30) {
      agingBracket = 'Até 30 dias';
    } else if (daysOverdue <= 60) {
      agingBracket = '31–60 dias';
    } else if (daysOverdue <= 90) {
      agingBracket = '61–90 dias';
    } else {
      agingBracket = 'Acima de 90 dias';
    }

    const contract = inst.negotiation.contract;

    rows.push({
      id: inst.id,
      contractId: contract.id,
      contractNumber: contract.contractNumber,
      personId: contract.person.id,
      personName: contract.person.fullName,
      personPhone: contract.person.phone || '',
      projectId: contract.project.id,
      projectName: contract.project.name,
      lotId: contract.lot.id,
      quadraLote: `Q${contract.lot.block.number} L${contract.lot.number}`,
      installmentNumber: inst.installmentNumber,
      installmentLabel: inst.installmentNumber === 0 ? 'Entrada' : `Parcela ${inst.installmentNumber}`,
      dueDate: dDate.toISOString().slice(0, 10),
      dueAmount: inst.amount,
      paidAmount: inst.paidAmount,
      openAmount,
      daysOverdue,
      agingBracket,
      status: inst.status
    });
  }

  // Filter by aging bracket or search
  let filteredRows = rows;
  if (filters.agingBracket && filters.agingBracket !== 'ALL') {
    filteredRows = filteredRows.filter(r => r.agingBracket === filters.agingBracket);
  }

  if (filters.search) {
    const s = filters.search.toLowerCase().trim();
    filteredRows = filteredRows.filter(r =>
      r.contractNumber.toLowerCase().includes(s) ||
      r.personName.toLowerCase().includes(s) ||
      r.projectName.toLowerCase().includes(s) ||
      r.quadraLote.toLowerCase().includes(s)
    );
  }

  // Calculate Aging Summary
  const agingBuckets = {
    upTo30: { count: 0, amount: 0 },
    from31to60: { count: 0, amount: 0 },
    from61to90: { count: 0, amount: 0 },
    over90: { count: 0, amount: 0 }
  };

  for (const r of filteredRows) {
    if (r.agingBracket === 'Até 30 dias') {
      agingBuckets.upTo30.count++;
      agingBuckets.upTo30.amount += r.openAmount;
    } else if (r.agingBracket === '31–60 dias') {
      agingBuckets.from31to60.count++;
      agingBuckets.from31to60.amount += r.openAmount;
    } else if (r.agingBracket === '61–90 dias') {
      agingBuckets.from61to90.count++;
      agingBuckets.from61to90.amount += r.openAmount;
    } else {
      agingBuckets.over90.count++;
      agingBuckets.over90.amount += r.openAmount;
    }
  }

  const totalOverdueAmount = Math.round(filteredRows.reduce((sum, r) => sum + r.openAmount, 0) * 100) / 100;
  const distinctContracts = new Set(filteredRows.map(r => r.contractId)).size;

  return {
    reportType: 'overdue-installments',
    title: 'Relatório de Parcelas em Atraso (Inadimplência)',
    category: 'Financeiro',
    generatedAt: new Date().toISOString(),
    referenceDate: refDate.toISOString().slice(0, 10),
    filterPeriodUsed: 'Data de Vencimento da Parcela',
    indicators: {
      totalOverdueAmount,
      overdueInstallmentsCount: filteredRows.length,
      distinctContractsCount: distinctContracts,
      agingBuckets: {
        upTo30: { count: agingBuckets.upTo30.count, amount: Math.round(agingBuckets.upTo30.amount * 100) / 100 },
        from31to60: { count: agingBuckets.from31to60.count, amount: Math.round(agingBuckets.from31to60.amount * 100) / 100 },
        from61to90: { count: agingBuckets.from61to90.count, amount: Math.round(agingBuckets.from61to90.amount * 100) / 100 },
        over90: { count: agingBuckets.over90.count, amount: Math.round(agingBuckets.over90.amount * 100) / 100 }
      }
    },
    totalRecords: filteredRows.length,
    rows: filteredRows
  };
}

// ---------------------------------------------------------------------------
// 4. EVOLUÇÃO CONTRATUAL (CATEGORIA CONTRATOS)
// ---------------------------------------------------------------------------
export async function getContractsEvolutionReport(filters: ReportFilterParams) {
  const contracts = await prisma.contract.findMany({
    where: {
      projectId: filters.projectId || undefined,
      ...(filters.status && filters.status !== 'ALL' ? {
        signed: filters.status === 'SIGNED' ? true : filters.status === 'NOT_SIGNED' ? false : undefined
      } : {}),
      ...(filters.startDate || filters.endDate ? {
        createdAt: {
          gte: filters.startDate ? new Date(filters.startDate) : undefined,
          lte: filters.endDate ? new Date(filters.endDate + 'T23:59:59.999Z') : undefined
        }
      } : {})
    },
    include: {
      project: { select: { id: true, name: true } },
      person: { select: { id: true, fullName: true, phone: true } },
      lot: { select: { id: true, number: true, block: { select: { number: true } } } },
      negotiations: {
        include: {
          installments: { select: { amount: true, paidAmount: true, status: true } }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  const rows = contracts.map(c => {
    let totalPaid = 0;
    let totalInstallments = 0;
    let paidInstallments = 0;

    for (const n of c.negotiations) {
      for (const i of n.installments) {
        totalInstallments++;
        totalPaid += i.paidAmount;
        if (i.status === 'PAID') paidInstallments++;
      }
    }

    return {
      id: c.id,
      contractNumber: c.contractNumber,
      projectName: c.project.name,
      quadraLote: `Q${c.lot.block.number} L${c.lot.number}`,
      lotId: c.lot.id,
      personName: c.person.fullName,
      signed: c.signed,
      signedLabel: c.signed ? 'Assinado' : 'Pendente de Assinatura',
      signedAt: c.signedAt ? c.signedAt.toISOString().slice(0, 10) : null,
      totalValue: c.totalValue,
      totalPaid: Math.round(totalPaid * 100) / 100,
      balanceRemaining: Math.round(Math.max(0, c.totalValue - totalPaid) * 100) / 100,
      installmentsProgress: `${paidInstallments}/${totalInstallments}`,
      createdAt: c.createdAt.toISOString().slice(0, 10)
    };
  });

  const signedCount = rows.filter(r => r.signed).length;
  const unsignedCount = rows.filter(r => !r.signed).length;
  const totalValue = Math.round(rows.reduce((s, r) => s + r.totalValue, 0) * 100) / 100;
  const totalPaid = Math.round(rows.reduce((s, r) => s + r.totalPaid, 0) * 100) / 100;

  return {
    reportType: 'contracts-evolution',
    title: 'Relatório de Evolução Contratual',
    category: 'Contratos',
    generatedAt: new Date().toISOString(),
    filterPeriodUsed: 'Data de Emissão do Contrato',
    indicators: {
      signedCount,
      unsignedCount,
      totalContracts: rows.length,
      totalValue,
      totalPaid
    },
    totalRecords: rows.length,
    rows
  };
}

// ---------------------------------------------------------------------------
// 5. ATENDIMENTOS E CONTATOS (CATEGORIA ATENDIMENTOS)
// ---------------------------------------------------------------------------
export async function getServiceRecordsReport(filters: ReportFilterParams) {
  const records = await prisma.serviceRecord.findMany({
    where: {
      projectId: filters.projectId || undefined,
      userId: filters.responsibleId || undefined,
      ...(filters.startDate || filters.endDate ? {
        serviceDate: {
          gte: filters.startDate ? new Date(filters.startDate) : undefined,
          lte: filters.endDate ? new Date(filters.endDate + 'T23:59:59.999Z') : undefined
        }
      } : {})
    },
    include: {
      project: { select: { id: true, name: true } },
      lot: { select: { id: true, number: true, block: { select: { number: true } } } },
      person: { select: { id: true, fullName: true, phone: true } },
      user: { select: { id: true, name: true } }
    },
    orderBy: { serviceDate: 'desc' }
  });

  const rows = records.map(r => ({
    id: r.id,
    serviceDate: r.serviceDate.toISOString().slice(0, 10),
    projectName: r.project.name,
    quadraLote: `Q${r.lot.block.number} L${r.lot.number}`,
    lotId: r.lot.id,
    personName: r.person.fullName,
    description: r.description,
    pendingActions: r.pendingActions || 'Nenhuma',
    nextContactDate: r.nextContactDate ? r.nextContactDate.toISOString().slice(0, 10) : '-',
    responsible: r.user.name
  }));

  const distinctPeople = new Set(records.map(r => r.personId)).size;
  const withNextContact = records.filter(r => r.nextContactDate !== null).length;

  return {
    reportType: 'service-records',
    title: 'Relatório Histórico de Atendimentos',
    category: 'Atendimentos',
    generatedAt: new Date().toISOString(),
    filterPeriodUsed: 'Data do Atendimento Realizado',
    indicators: {
      totalServices: rows.length,
      distinctPeople,
      withNextContact
    },
    totalRecords: rows.length,
    rows
  };
}

// ---------------------------------------------------------------------------
// 6. EXPORT ENGINE: EXCEL (.xlsx)
// ---------------------------------------------------------------------------
export function exportReportToExcel(reportData: any): Buffer {
  const wb = XLSX.utils.book_new();

  // Format rows based on report type
  let formattedRows: any[] = [];

  if (reportData.reportType === 'lot-pendencies') {
    formattedRows = reportData.rows.map((r: any) => ({
      'Projeto': r.projectName,
      'Quadra/Lote': r.quadraLote,
      'Titular': r.occupant,
      'Tipo de Pendência': r.type,
      'Descrição': r.description,
      'Responsável': r.responsible,
      'Prazo': r.deadline ? new Date(r.deadline + 'T12:00:00') : '',
      'Situação': r.situation,
      'Dias em Aberto': r.daysOpen,
      'Data de Abertura': new Date(r.createdAt + 'T12:00:00')
    }));
  } else if (reportData.reportType === 'document-checklist') {
    formattedRows = reportData.rows.map((r: any) => ({
      'Projeto': r.projectName,
      'Quadra/Lote': r.quadraLote,
      'Titular': r.occupant,
      'Documento Exigido': r.requiredDocLabel,
      'Situação': r.situation,
      'Data de Entrega': r.deliveryDate ? new Date(r.deliveryDate + 'T12:00:00') : 'Não entregue',
      'Motivo / Observação': r.pendingReason || ''
    }));
  } else if (reportData.reportType === 'overdue-installments') {
    formattedRows = reportData.rows.map((r: any) => ({
      'Contrato': r.contractNumber,
      'Titular': r.personName,
      'Telefone': r.personPhone,
      'Projeto': r.projectName,
      'Quadra/Lote': r.quadraLote,
      'Parcela': r.installmentLabel,
      'Vencimento': new Date(r.dueDate + 'T12:00:00'),
      'Valor Devido (R$)': Number(r.dueAmount.toFixed(2)),
      'Valor Pago (R$)': Number(r.paidAmount.toFixed(2)),
      'Saldo em Aberto (R$)': Number(r.openAmount.toFixed(2)),
      'Dias de Atraso': r.daysOverdue,
      'Faixa de Atraso': r.agingBracket
    }));
  } else if (reportData.reportType === 'contracts-evolution') {
    formattedRows = reportData.rows.map((r: any) => ({
      'Contrato': r.contractNumber,
      'Projeto': r.projectName,
      'Quadra/Lote': r.quadraLote,
      'Titular': r.personName,
      'Situação': r.signedLabel,
      'Data Assinatura': r.signedAt ? new Date(r.signedAt + 'T12:00:00') : '',
      'Valor Contratado (R$)': Number(r.totalValue.toFixed(2)),
      'Valor Pago (R$)': Number(r.totalPaid.toFixed(2)),
      'Saldo Restante (R$)': Number(r.balanceRemaining.toFixed(2)),
      'Parcelas Pagas': r.installmentsProgress
    }));
  } else {
    formattedRows = reportData.rows;
  }

  const ws = XLSX.utils.json_to_sheet(formattedRows, { cellDates: true });

  // Auto-fit columns
  if (formattedRows.length > 0) {
    const keys = Object.keys(formattedRows[0]);
    ws['!cols'] = keys.map(key => {
      const maxLen = Math.max(
        key.length,
        ...formattedRows.map(row => String(row[key] || '').length)
      );
      return { wch: Math.min(Math.max(maxLen + 2, 12), 45) };
    });
    // Add auto-filter on table headers
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    ws['!autofilter'] = { ref: XLSX.utils.encode_range(range) };
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Relatório');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// ---------------------------------------------------------------------------
// 7. EXPORT ENGINE: PDF (.pdf)
// ---------------------------------------------------------------------------
export async function exportReportToPDF(reportData: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 30,
      bufferPages: true
    });

    const buffers: Buffer[] = [];
    doc.on('data', chunk => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', err => reject(err));

    const primaryColor = '#0f5964';
    const darkTextColor = '#1e293b';
    const grayColor = '#64748b';
    const lightBg = '#f8fafc';

    // --- CABEÇALHO ---
    doc.rect(30, 25, doc.page.width - 60, 45).fill(primaryColor);
    doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold')
       .text('GÊNESIS ENGENHARIA E REGULARIZAÇÃO FUNDIÁRIA (REURB)', 45, 33);
    doc.fontSize(11).font('Helvetica')
       .text(`${reportData.title.toUpperCase()} | Central de Relatórios`, 45, 52);

    // Metadata Bar
    doc.fillColor(darkTextColor).fontSize(9).font('Helvetica');
    const genDateStr = new Date().toLocaleString('pt-BR');
    let metaText = `Data de emissão: ${genDateStr} | Categoria: ${reportData.category}`;
    if (reportData.referenceDate) {
      metaText += ` | Data de Referência: ${new Date(reportData.referenceDate + 'T12:00:00').toLocaleDateString('pt-BR')}`;
    }
    doc.text(metaText, 30, 80);

    // Indicator Summary Box
    doc.rect(30, 95, doc.page.width - 60, 32).fill(lightBg).stroke('#cbd5e1');
    doc.fillColor(primaryColor).fontSize(9).font('Helvetica-Bold');
    
    let summaryText = `Total de Registros: ${reportData.totalRecords}`;
    if (reportData.reportType === 'lot-pendencies') {
      summaryText += `  |  Lotes Distintos com Pendência: ${reportData.indicators.lotsWithPendencies}  |  Pendências em Aberto: ${reportData.indicators.openPendencies}  |  Vencidas: ${reportData.indicators.overduePendencies}`;
    } else if (reportData.reportType === 'document-checklist') {
      summaryText += `  |  Não Entregues: ${reportData.indicators.notDeliveredCount}  |  Em Análise: ${reportData.indicators.underReviewCount}  |  Precisa de Correção: ${reportData.indicators.correctionNeededCount}  |  Aprovados: ${reportData.indicators.approvedCount}`;
    } else if (reportData.reportType === 'overdue-installments') {
      const valStr = reportData.indicators.totalOverdueAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      summaryText += `  |  Saldo Vencido Total: ${valStr}  |  Parcelas Vencidas: ${reportData.indicators.overdueInstallmentsCount}  |  Contratos com Atraso: ${reportData.indicators.distinctContractsCount}`;
    }
    doc.text(summaryText, 40, 106);

    // --- TABELA ---
    let y = 140;
    const bottomLimit = doc.page.height - 45;

    // Define table columns based on report
    let columns: Array<{ title: string; key: string; width: number; align?: string }> = [];

    if (reportData.reportType === 'lot-pendencies') {
      columns = [
        { title: 'Projeto', key: 'projectName', width: 140 },
        { title: 'Qd / Lote', key: 'quadraLote', width: 70 },
        { title: 'Titular / Ocupante', key: 'occupant', width: 150 },
        { title: 'Tipo', key: 'type', width: 90 },
        { title: 'Descrição da Pendência', key: 'description', width: 180 },
        { title: 'Responsável', key: 'responsible', width: 100 },
        { title: 'Prazo', key: 'deadline', width: 65 },
        { title: 'Situação', key: 'situation', width: 85 }
      ];
    } else if (reportData.reportType === 'document-checklist') {
      columns = [
        { title: 'Projeto', key: 'projectName', width: 140 },
        { title: 'Qd / Lote', key: 'quadraLote', width: 75 },
        { title: 'Titular / Ocupante', key: 'occupant', width: 160 },
        { title: 'Documento Exigido', key: 'requiredDocLabel', width: 170 },
        { title: 'Situação', key: 'situation', width: 100 },
        { title: 'Data Entrega', key: 'deliveryDate', width: 80 },
        { title: 'Motivo / Pendência', key: 'pendingReason', width: 155 }
      ];
    } else if (reportData.reportType === 'overdue-installments') {
      columns = [
        { title: 'Contrato', key: 'contractNumber', width: 110 },
        { title: 'Titular', key: 'personName', width: 160 },
        { title: 'Projeto', key: 'projectName', width: 130 },
        { title: 'Qd/Lote', key: 'quadraLote', width: 65 },
        { title: 'Parcela', key: 'installmentLabel', width: 75 },
        { title: 'Vencimento', key: 'dueDate', width: 75 },
        { title: 'Devido', key: 'dueAmount', width: 65, align: 'right' },
        { title: 'Saldo Aberto', key: 'openAmount', width: 75, align: 'right' },
        { title: 'Atraso', key: 'daysOverdue', width: 50, align: 'right' },
        { title: 'Faixa', key: 'agingBracket', width: 75 }
      ];
    }

    const drawHeader = (currY: number) => {
      doc.rect(30, currY, doc.page.width - 60, 20).fill('#e2e8f0');
      let currX = 35;
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8);
      columns.forEach(col => {
        doc.text(col.title, currX, currY + 6, { width: col.width - 6, align: (col.align as any) || 'left' });
        currX += col.width;
      });
      return currY + 22;
    };

    y = drawHeader(y);

    reportData.rows.forEach((row: any, idx: number) => {
      if (y > bottomLimit) {
        doc.addPage();
        y = 35;
        y = drawHeader(y);
      }

      const isEven = idx % 2 === 0;
      if (isEven) {
        doc.rect(30, y, doc.page.width - 60, 18).fill('#f8fafc');
      }

      doc.fillColor('#334155').font('Helvetica').fontSize(7.5);
      let currX = 35;
      columns.forEach(col => {
        let val = row[col.key];
        if (col.key === 'dueAmount' || col.key === 'openAmount' || col.key === 'paidAmount') {
          val = Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        } else if (col.key === 'daysOverdue') {
          val = `${val} d`;
        } else if (col.key === 'dueDate' || col.key === 'deliveryDate' || col.key === 'deadline') {
          val = val ? new Date(val + 'T12:00:00').toLocaleDateString('pt-BR') : '-';
        }
        doc.text(String(val ?? '-'), currX, y + 4, {
          width: col.width - 6,
          align: (col.align as any) || 'left',
          ellipsis: true
        });
        currX += col.width;
      });

      y += 18;
    });

    // Page numbering on all pages
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.fillColor(grayColor).fontSize(7.5).font('Helvetica')
         .text(`Gênesis REURB · Página ${i + 1} de ${range.count}`, 30, doc.page.height - 25, {
           align: 'center',
           width: doc.page.width - 60
         });
    }

    doc.end();
  });
}
