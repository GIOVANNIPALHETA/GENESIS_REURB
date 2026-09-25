import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';
import { prisma } from '../prisma/client';
import { syncDocumentAdded } from './googleDriveSync.service';

export interface ChatMessage {
  role: 'user' | 'model' | 'assistant';
  content: string;
}

// ============================================================================
// TOOL DECLARATIONS FOR GEMINI FUNCTION CALLING
// ============================================================================

export const getProjectSummaryDeclaration: FunctionDeclaration = {
  name: 'getProjectSummary',
  description: 'Retorna um resumo de um loteamento/projeto de REURB (ex: Vila Nova, Tatão, Dardanelos) incluindo total de lotes, quadras, contratos assinados, quitados e em atraso.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      projectName: {
        type: Type.STRING,
        description: 'Nome aproximado do projeto ou loteamento (ex: "Vila Nova", "Tatão", "Dardanelos")',
      },
    },
    required: ['projectName'],
  },
};

export const searchLotsDeclaration: FunctionDeclaration = {
  name: 'searchLots',
  description: 'Pesquisa e lista lotes em um loteamento filtrando por quadra, número, atraso financeiro, falta de contrato ou termo de busca.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      projectName: {
        type: Type.STRING,
        description: 'Nome do projeto (ex: "Vila Nova", "Tatão", "Dardanelos")',
      },
      blockNumber: {
        type: Type.STRING,
        description: 'Número ou identificador da quadra (ex: "1", "01", "2")',
      },
      overdueOnly: {
        type: Type.BOOLEAN,
        description: 'Se true, filtra apenas lotes que possuem parcelas financeiras vencidas em atraso',
      },
      notSignedOnly: {
        type: Type.BOOLEAN,
        description: 'Se true, filtra apenas lotes cujos titulares ainda não assinaram contrato',
      },
      query: {
        type: Type.STRING,
        description: 'Texto de busca geral (nome do morador, CPF, quadra ou lote)',
      },
      limit: {
        type: Type.NUMBER,
        description: 'Quantidade máxima de resultados a retornar (padrão: 15)',
      },
    },
  },
};

export const getLotDetailsDeclaration: FunctionDeclaration = {
  name: 'getLotDetails',
  description: 'Consulta todos os dados cadastrais, titular, contrato e histórico financeiro de um lote específico.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      projectName: {
        type: Type.STRING,
        description: 'Nome do loteamento ou projeto',
      },
      blockNumber: {
        type: Type.STRING,
        description: 'Número da quadra (ex: "1", "01")',
      },
      lotNumber: {
        type: Type.STRING,
        description: 'Número do lote (ex: "01", "1A", "15")',
      },
    },
    required: ['blockNumber', 'lotNumber'],
  },
};

export const getFinancialSummaryDeclaration: FunctionDeclaration = {
  name: 'getFinancialSummary',
  description: 'Obtém indicadores e métricas financeiras consolidadas (receitas, despesas, parcelas vencidas por faixa de atraso, saldo devedor) de um projeto ou do sistema.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      projectName: {
        type: Type.STRING,
        description: 'Nome opcional do projeto para filtrar (ex: "Vila Nova", "Tatão", "Dardanelos")',
      },
      referenceDate: {
        type: Type.STRING,
        description: 'Data de referência para cálculo do atraso no formato YYYY-MM-DD (padrão: hoje)',
      },
    },
  },
};

export const searchPersonDeclaration: FunctionDeclaration = {
  name: 'searchPerson',
  description: 'Localiza titulares ou beneficiários cadastrados por nome ou CPF, retornando seus lotes vinculados, telefones e contratos.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'Nome completo, parte do nome ou CPF do titular',
      },
    },
    required: ['query'],
  },
};

export const getDocumentChecklistDeclaration: FunctionDeclaration = {
  name: 'getDocumentChecklist',
  description: 'Verifica o checklist documental de uma família ou lote (documentos entregues, em análise, aprovados ou pendentes de correção).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      projectName: {
        type: Type.STRING,
        description: 'Nome do projeto',
      },
      blockNumber: {
        type: Type.STRING,
        description: 'Número da quadra',
      },
      lotNumber: {
        type: Type.STRING,
        description: 'Número do lote',
      },
    },
  },
};

export const uploadLotDocumentDeclaration: FunctionDeclaration = {
  name: 'uploadLotDocument',
  description: 'Salva e vincula oficialmente o arquivo anexado pelo usuário ao Lote e Quadra informados no sistema Gênesis REURB, atualizando o checklist documental da família.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      blockNumber: {
        type: Type.STRING,
        description: 'Número ou identificador da quadra mencionada pelo usuário (ex: "XX", "01", "1", "4")',
      },
      lotNumber: {
        type: Type.STRING,
        description: 'Número do lote mencionado pelo usuário (ex: "11", "01", "1A", "15")',
      },
      projectName: {
        type: Type.STRING,
        description: 'Nome aproximado do projeto ou loteamento se especificado (ex: "Vila Nova", "Tatão", "Dardanelos")',
      },
      personName: {
        type: Type.STRING,
        description: 'Nome do titular ou pessoa a quem o documento pertence (ex: "Fulano de Tal")',
      },
      documentCategory: {
        type: Type.STRING,
        description: 'Categoria do documento (ex: "RG/CPF ou CNH do Titular", "Comprovante de Residência", "Certidão de Casamento ou Nascimento", "Contrato de Compra e Venda do Lote", "Documentos Complementares")',
      },
      notes: {
        type: Type.STRING,
        description: 'Observação cadastral sobre o documento',
      },
    },
    required: ['blockNumber', 'lotNumber'],
  },
};

const ALL_GEMINI_TOOLS = [
  getProjectSummaryDeclaration,
  searchLotsDeclaration,
  getLotDetailsDeclaration,
  getFinancialSummaryDeclaration,
  searchPersonDeclaration,
  getDocumentChecklistDeclaration,
  uploadLotDocumentDeclaration,
];

// ============================================================================
// TOOL IMPLEMENTATIONS WITH PRISMA
// ============================================================================

async function executeGetProjectSummary(args: any) {
  const nameQuery = args.projectName?.trim() || '';
  const project = await prisma.project.findFirst({
    where: {
      OR: [
        { name: { contains: nameQuery, mode: 'insensitive' } },
        { neighborhood: { contains: nameQuery, mode: 'insensitive' } },
        { city: { contains: nameQuery, mode: 'insensitive' } },
      ],
    },
    include: {
      blocks: {
        include: {
          lots: {
            where: { active: true },
            include: {
              contracts: {
                include: {
                  negotiations: {
                    include: {
                      installments: true,
                    },
                  },
                },
              },
              occupancies: {
                include: { person: true },
              },
            },
          },
        },
      },
    },
  });

  if (!project) {
    return {
      found: false,
      message: `Nenhum projeto encontrado com o nome "${nameQuery}".`,
      availableProjects: (await prisma.project.findMany({ select: { id: true, name: true } })).map((p) => p.name),
    };
  }

  const allLots = project.blocks.flatMap((b) => b.lots);
  const totalLots = allLots.length;
  const totalBlocks = project.blocks.length;

  let signedContracts = 0;
  let notSignedContracts = 0;
  let overdueLots = 0;
  let fullyPaidLots = 0;
  let totalContractedAmount = 0;
  let totalPaidAmount = 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const lot of allLots) {
    const activeContract = lot.contracts?.[0];
    if (activeContract?.signed) {
      signedContracts++;
    } else {
      notSignedContracts++;
    }

    const allInstallments = activeContract?.negotiations?.flatMap((n) => n.installments || []) || [];
    if (allInstallments.length > 0) {
      let lotOverdue = false;
      let lotPaidCount = 0;
      let lotPendingCount = 0;

      for (const inst of allInstallments) {
        totalContractedAmount += inst.amount || 0;
        totalPaidAmount += inst.paidAmount || 0;

        const due = new Date(inst.dueDate);
        due.setHours(0, 0, 0, 0);

        if (inst.status === 'OVERDUE' || (inst.status === 'PENDING' && due.getTime() < today.getTime())) {
          lotOverdue = true;
        } else if (inst.status === 'PAID') {
          lotPaidCount++;
        } else {
          lotPendingCount++;
        }
      }

      if (lotOverdue) overdueLots++;
      if (lotPendingCount === 0 && lotPaidCount > 0) fullyPaidLots++;
    }
  }

  return {
    found: true,
    projectId: project.id,
    projectName: project.name,
    city: project.city,
    state: project.state,
    status: project.status,
    totalQuadras: totalBlocks,
    totalLotes: totalLots,
    contratosAssinados: signedContracts,
    semContrato: notSignedContracts,
    lotesComParcelasEmAtraso: overdueLots,
    lotesQuitados: fullyPaidLots,
    valorTotalContratado: Number(totalContractedAmount.toFixed(2)),
    valorTotalRecebido: Number(totalPaidAmount.toFixed(2)),
    taxaInadimplenciaLotes: totalLots > 0 ? `${((overdueLots / totalLots) * 100).toFixed(1)}%` : '0%',
  };
}

function getNumberVariants(val: string | number | undefined | null): string[] {
  if (val === undefined || val === null) return [];
  const s = String(val).trim();
  if (!s) return [];
  const noLeadingZero = s.replace(/^0+/, '') || '0';
  const withLeadingZero = s.length === 1 && /^\d+$/.test(s) ? '0' + s : s;
  return Array.from(new Set([s, noLeadingZero, withLeadingZero])).filter(Boolean);
}

async function executeSearchLots(args: any) {
  const limit = Math.min(Number(args.limit) || 15, 50);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let projectFilterId: string | undefined;
  if (args.projectName) {
    const p = await prisma.project.findFirst({
      where: { name: { contains: args.projectName.trim(), mode: 'insensitive' } },
      select: { id: true },
    });
    if (p) projectFilterId = p.id;
  }

  const blockVariants = getNumberVariants(args.blockNumber);

  const lots = await prisma.lot.findMany({
    where: {
      active: true,
      projectId: projectFilterId,
      ...(blockVariants.length > 0
        ? {
            block: {
              number: { in: blockVariants, mode: 'insensitive' },
            },
          }
        : {}),
      ...(args.query
        ? {
            OR: [
              { number: { contains: args.query.trim(), mode: 'insensitive' } },
              {
                occupancies: {
                  some: {
                    person: {
                      OR: [
                        { fullName: { contains: args.query.trim(), mode: 'insensitive' } },
                        { cpf: { contains: args.query.trim() } },
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
      project: { select: { name: true } },
      block: { select: { number: true } },
      occupancies: {
        include: { person: { select: { fullName: true, cpf: true, phone: true } } },
      },
      contracts: {
        include: {
          negotiations: {
            include: {
              installments: true,
            },
          },
        },
      },
    },
    take: 100,
  });

  const results: any[] = [];

  for (const lot of lots) {
    const occupant = lot.occupancies?.[0]?.person;
    const contract = lot.contracts?.[0];
    const installments = contract?.negotiations?.flatMap((n) => n.installments || []) || [];

    let overdueCount = 0;
    let overdueAmount = 0;
    let paidAmount = 0;
    let totalDue = 0;

    for (const inst of installments) {
      totalDue += inst.amount;
      paidAmount += inst.paidAmount;
      const due = new Date(inst.dueDate);
      due.setHours(0, 0, 0, 0);

      const isOver = inst.status === 'OVERDUE' || (inst.status === 'PENDING' && due.getTime() < today.getTime());
      if (isOver) {
        overdueCount++;
        overdueAmount += Math.max(0, inst.amount - inst.paidAmount);
      }
    }

    const isSigned = Boolean(contract?.signed);

    if (args.overdueOnly && overdueCount === 0) continue;
    if (args.notSignedOnly && isSigned) continue;

    results.push({
      lote: lot.number,
      quadra: lot.block.number,
      projeto: lot.project.name,
      titular: occupant?.fullName || 'Sem titular cadastrado',
      cpf: occupant?.cpf ? `${occupant.cpf.slice(0, 3)}.***.***-${occupant.cpf.slice(-2)}` : null,
      telefone: occupant?.phone || null,
      contratoAssinado: isSigned,
      situacaoFinanceira: overdueCount > 0 ? `${overdueCount} parcelas em atraso (R$ ${overdueAmount.toFixed(2)})` : installments.length > 0 ? 'Em dia / Quitado' : 'Sem plano financeiro',
      saldoVencido: Number(overdueAmount.toFixed(2)),
      totalParcelas: installments.length,
    });

    if (results.length >= limit) break;
  }

  return {
    totalEncontrados: results.length,
    lotes: results,
  };
}

async function executeGetLotDetails(args: any) {
  const blockNum = String(args.blockNumber || '').trim();
  const lotNum = String(args.lotNumber || '').trim();
  const blockVariants = getNumberVariants(args.blockNumber);
  const lotVariants = getNumberVariants(args.lotNumber);
  const projQuery = args.projectName?.trim();

  const lot = await prisma.lot.findFirst({
    where: {
      number: { in: lotVariants, mode: 'insensitive' },
      block: { number: { in: blockVariants, mode: 'insensitive' } },
      ...(projQuery ? { project: { name: { contains: projQuery, mode: 'insensitive' } } } : {}),
      active: true,
    },
    include: {
      project: { select: { id: true, name: true, city: true, state: true } },
      block: { select: { id: true, number: true } },
      occupancies: {
        include: { person: true },
      },
      contracts: {
        include: {
          person: true,
          negotiations: {
            include: {
              installments: {
                orderBy: { installmentNumber: 'asc' },
              },
            },
          },
        },
      },
      serviceRecords: {
        take: 5,
        orderBy: { serviceDate: 'desc' },
      },
    },
  });

  if (!lot) {
    return {
      found: false,
      message: `Lote ${lotNum} na Quadra ${blockNum} não foi encontrado.`,
    };
  }

  const occupant = lot.occupancies?.[0]?.person;
  const contract = lot.contracts?.[0];
  const installments = contract?.negotiations?.flatMap((n) => n.installments || []) || [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const installmentList = installments.map((i) => {
    const due = new Date(i.dueDate);
    due.setHours(0, 0, 0, 0);
    const isOverdue = i.status === 'OVERDUE' || (i.status === 'PENDING' && due.getTime() < today.getTime());

    return {
      numero: i.installmentNumber,
      valor: i.amount,
      valorPago: i.paidAmount,
      vencimento: i.dueDate.toISOString().slice(0, 10),
      status: isOverdue ? 'ATRASADA' : i.status,
    };
  });

  const totalAmount = installments.reduce((acc, i) => acc + i.amount, 0);
  const totalPaid = installments.reduce((acc, i) => acc + i.paidAmount, 0);
  const overdueTotal = installments
    .filter((i) => {
      const due = new Date(i.dueDate);
      due.setHours(0, 0, 0, 0);
      return i.status === 'OVERDUE' || (i.status === 'PENDING' && due.getTime() < today.getTime());
    })
    .reduce((acc, i) => acc + (i.amount - i.paidAmount), 0);

  return {
    found: true,
    projeto: lot.project.name,
    quadra: lot.block.number,
    lote: lot.number,
    areaM2: lot.area,
    perimetroM: lot.perimeter,
    titular: {
      nome: occupant?.fullName || 'Não informado',
      cpf: occupant?.cpf || 'Não informado',
      telefone: occupant?.phone || 'Não informado',
    },
    contrato: {
      numero: contract?.contractNumber || 'Não gerado',
      assinado: Boolean(contract?.signed),
      dataAssinatura: contract?.signedAt ? contract.signedAt.toISOString().slice(0, 10) : null,
    },
    financeiro: {
      totalPlano: Number(totalAmount.toFixed(2)),
      totalPago: Number(totalPaid.toFixed(2)),
      saldoDevedor: Number((totalAmount - totalPaid).toFixed(2)),
      saldoVencidoEmAtraso: Number(overdueTotal.toFixed(2)),
      quantidadeParcelas: installments.length,
      parcelas: installmentList.slice(0, 12), // Primeiras 12 parcelas para síntese
    },
  };
}

async function executeGetFinancialSummary(args: any) {
  const today = new Date(args.referenceDate || new Date());
  today.setHours(0, 0, 0, 0);

  let projectFilterId: string | undefined;
  if (args.projectName) {
    const p = await prisma.project.findFirst({
      where: { name: { contains: args.projectName.trim(), mode: 'insensitive' } },
      select: { id: true, name: true },
    });
    if (p) projectFilterId = p.id;
  }

  // 1. Installments overdue and pending
  const installments = await prisma.installment.findMany({
    where: projectFilterId
      ? {
          negotiation: {
            contract: {
              lot: { projectId: projectFilterId },
            },
          },
        }
      : {},
    include: {
      negotiation: {
        include: {
          contract: {
            include: {
              lot: { select: { number: true, block: { select: { number: true } } } },
              person: { select: { fullName: true } },
            },
          },
        },
      },
    },
  });

  let totalContracted = 0;
  let totalReceived = 0;
  let totalOverdue = 0;
  let countOverdue = 0;

  const aging = {
    ate30Dias: 0,
    de31a60Dias: 0,
    de61a90Dias: 0,
    acima90Dias: 0,
  };

  for (const inst of installments) {
    totalContracted += inst.amount;
    totalReceived += inst.paidAmount;

    const remaining = Math.max(0, inst.amount - inst.paidAmount);
    const due = new Date(inst.dueDate);
    due.setHours(0, 0, 0, 0);

    if (remaining > 0 && (inst.status === 'OVERDUE' || due.getTime() < today.getTime())) {
      totalOverdue += remaining;
      countOverdue++;

      const diffDays = Math.max(1, Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
      if (diffDays <= 30) aging.ate30Dias += remaining;
      else if (diffDays <= 60) aging.de31a60Dias += remaining;
      else if (diffDays <= 90) aging.de61a90Dias += remaining;
      else aging.acima90Dias += remaining;
    }
  }

  // 2. Financial Accounts
  const accounts = await prisma.financialAccount.findMany({
    where: { active: true },
    select: { id: true, name: true, type: true, openingBalance: true },
  });

  return {
    dataReferencia: today.toISOString().slice(0, 10),
    projeto: args.projectName || 'Todos os projetos',
    totalContratado: Number(totalContracted.toFixed(2)),
    totalRecebido: Number(totalReceived.toFixed(2)),
    saldoVencidoTotal: Number(totalOverdue.toFixed(2)),
    quantidadeParcelasVencidas: countOverdue,
    inadimplenciaPorFaixaDias: {
      'Até 30 dias': Number(aging.ate30Dias.toFixed(2)),
      '31 a 60 dias': Number(aging.de31a60Dias.toFixed(2)),
      '61 a 90 dias': Number(aging.de61a90Dias.toFixed(2)),
      'Acima de 90 dias': Number(aging.acima90Dias.toFixed(2)),
    },
    contasBancariasCadastradas: accounts.map((a) => ({
      nome: a.name,
      tipo: a.type,
      saldoInicial: a.openingBalance,
    })),
  };
}

async function executeSearchPerson(args: any) {
  const query = String(args.query || '').trim();
  const people = await prisma.person.findMany({
    where: {
      OR: [
        { fullName: { contains: query, mode: 'insensitive' } },
        { cpf: { contains: query } },
      ],
    },
    include: {
      occupancies: {
        include: {
          lot: {
            include: { block: true, project: true },
          },
        },
      },
      contracts: {
        include: {
          lot: {
            include: { block: true, project: true },
          },
        },
      },
    },
    take: 10,
  });

  return {
    totalEncontrados: people.length,
    resultados: people.map((p) => ({
      id: p.id,
      nome: p.fullName,
      cpf: p.cpf || 'Não cadastrado',
      telefone: p.phone || 'Não informado',
      lotesVinculados: p.occupancies.map((o) => ({
        projeto: o.lot.project.name,
        quadra: o.lot.block.number,
        lote: o.lot.number,
      })),
      contratos: p.contracts.map((c) => ({
        numero: c.contractNumber,
        assinado: c.signed,
        projeto: c.lot.project.name,
        quadra: c.lot.block.number,
        lote: c.lot.number,
      })),
    })),
  };
}

async function executeGetDocumentChecklist(args: any) {
  let lotFilterId: string | undefined;

  if (args.blockNumber && args.lotNumber) {
    const lot = await prisma.lot.findFirst({
      where: {
        number: { equals: String(args.lotNumber).trim(), mode: 'insensitive' },
        block: { number: { equals: String(args.blockNumber).trim(), mode: 'insensitive' } },
        ...(args.projectName ? { project: { name: { contains: args.projectName.trim(), mode: 'insensitive' } } } : {}),
      },
      select: { id: true, number: true, block: { select: { number: true } }, project: { select: { name: true } } },
    });
    if (lot) lotFilterId = lot.id;
  }

  const docs = await prisma.document.findMany({
    where: lotFilterId ? { lotId: lotFilterId } : {},
    include: {
      documentType: { select: { name: true } },
      lot: { select: { number: true, block: { select: { number: true } }, project: { select: { name: true } } } },
      person: { select: { fullName: true } },
    },
    take: 25,
  });

  return {
    totalDocumentos: docs.length,
    documentos: docs.map((d) => ({
      tipo: d.documentType?.name || d.category || 'Documento',
      arquivo: d.fileName,
      status: d.status,
      titular: d.person?.fullName || 'Não vinculado',
      lote: d.lot ? `Q. ${d.lot.block.number} / Lt. ${d.lot.number} (${d.lot.project.name})` : 'Geral',
      dataEnvio: d.createdAt.toISOString().slice(0, 10),
    })),
  };
}

async function executeUploadLotDocument(
  args: any,
  uploadedFile?: any,
  userId?: string
) {
  if (!uploadedFile) {
    return {
      success: false,
      message: 'Nenhum arquivo físico foi anexado nesta mensagem para upload. Solicite ao usuário que anexe o arquivo no chat (clique no ícone de clipe ou arraste o arquivo).',
    };
  }

  const blockVariants = getNumberVariants(args.blockNumber);
  const lotVariants = getNumberVariants(args.lotNumber);
  const blockNum = String(args.blockNumber || '').trim();
  const lotNum = String(args.lotNumber || '').trim();
  const projQuery = args.projectName?.trim();
  const personName = args.personName?.trim();

  // Find lot by number and block
  const lot = await prisma.lot.findFirst({
    where: {
      number: { in: lotVariants, mode: 'insensitive' },
      block: { number: { in: blockVariants, mode: 'insensitive' } },
      ...(projQuery ? { project: { name: { contains: projQuery, mode: 'insensitive' } } } : {}),
      active: true,
    },
    include: {
      project: { select: { id: true, name: true } },
      block: { select: { id: true, number: true } },
      occupancies: {
        include: { person: true },
      },
      contracts: {
        include: { person: true },
      },
    },
  });

  if (!lot) {
    return {
      success: false,
      message: `Lote ${lotNum} na Quadra ${blockNum} não foi encontrado no sistema. Por favor, confirme o número da quadra e do lote cadastrados.`,
    };
  }

  // Determine Person / Titular
  let personId = lot.occupancies?.[0]?.personId || lot.contracts?.[0]?.personId || null;
  let personFullName = lot.occupancies?.[0]?.person?.fullName || lot.contracts?.[0]?.person?.fullName || personName || null;

  if (personName && !personId) {
    const foundPerson = await prisma.person.findFirst({
      where: { fullName: { contains: personName, mode: 'insensitive' } },
    });
    if (foundPerson) {
      personId = foundPerson.id;
      personFullName = foundPerson.fullName;
    } else {
      const newPerson = await prisma.person.create({
        data: { fullName: personName },
      });
      personId = newPerson.id;
      personFullName = newPerson.fullName;
    }
  }

  // Match or create DocumentType if needed
  const category = args.documentCategory || 'Documentos Complementares';

  let finalUserId: string | null = null;
  if (userId) {
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (existing) finalUserId = existing.id;
  }
  if (!finalUserId) {
    const adminUser = await prisma.user.findFirst({ where: { active: true } });
    finalUserId = adminUser?.id || '';
  }

  // Create document record
  const doc = await prisma.document.create({
    data: {
      lotId: lot.id,
      personId: personId,
      category: category,
      originalName: uploadedFile.originalname,
      fileName: uploadedFile.filename,
      filePath: uploadedFile.path,
      mimeType: uploadedFile.mimetype,
      size: uploadedFile.size,
      status: 'UNDER_REVIEW',
      uploadedById: finalUserId,
      notes: args.notes || 'Enviado e vinculado via Assistente Gênesis IA',
    },
  });

  // Sync to Drive
  syncDocumentAdded(doc.id).catch((err) =>
    console.error('[Gemini AI Upload] Erro ao sincronizar com Google Drive:', err)
  );

  return {
    success: true,
    documentId: doc.id,
    arquivo: uploadedFile.originalname,
    categoria: category,
    quadra: lot.block.number,
    lote: lot.number,
    projeto: lot.project.name,
    titular: personFullName || 'Titular do lote',
    situacao: 'EM ANÁLISE (UNDER_REVIEW)',
    mensagem: `Arquivo ${uploadedFile.originalname} salvo com sucesso e vinculado ao Lote ${lot.number}, Quadra ${lot.block.number} (${lot.project.name}), titular ${personFullName || 'do lote'}. O checklist documental foi atualizado.`,
  };
}

// Router for tool calls
async function dispatchToolCall(toolName: string, args: any, uploadedFile?: any, userId?: string) {
  try {
    switch (toolName) {
      case 'uploadLotDocument':
        return await executeUploadLotDocument(args, uploadedFile, userId);
      case 'getProjectSummary':
        return await executeGetProjectSummary(args);
      case 'searchLots':
        return await executeSearchLots(args);
      case 'getLotDetails':
        return await executeGetLotDetails(args);
      case 'getFinancialSummary':
        return await executeGetFinancialSummary(args);
      case 'searchPerson':
        return await executeSearchPerson(args);
      case 'getDocumentChecklist':
        return await executeGetDocumentChecklist(args);
      default:
        return { error: `Ferramenta desconhecida: ${toolName}` };
    }
  } catch (err: any) {
    console.error(`[Gemini dispatchToolCall] Erro ao executar ${toolName}:`, err?.message || err);
    return {
      error: `Erro ao executar ${toolName}: ${err?.message || 'Falha interna'}`,
    };
  }
}

// ============================================================================
// MAIN GEMINI CHAT HANDLER
// ============================================================================

const SYSTEM_INSTRUCTION = `
Você é o Assistente Oficial com Inteligência Artificial do **Gênesis REURB**, especialista técnico e jurídico em Regularização Fundiária Urbana (Lei Federal nº 13.465/2017 e Decreto nº 9.310/2018), loteamentos (Vila Nova, Tatão, Dardanelos, etc.) e na gestão da plataforma.

Sua missão é responder a dúvidas dos usuários e operadores do sistema, prestando orientações claras, consultando os dados reais do banco de dados e realizando ações autorizadas (como upload e vinculação de documentos a lotes).

Diretrizes estritas:
1. **Upload e Vinculação de Documentos**: Se o usuário enviar um arquivo anexado e solicitar upload/vinculação (ex: "Esse documento é de Fulano da Qd XX Lt 11 faça upload"), você DEVE extrair a quadra, o lote, o titular e chamar a ferramenta "uploadLotDocument". Em seguida, confirme o sucesso com detalhes formatados em tópicos (Lote, Quadra, Projeto, Titular, Status no Checklist).
2. **Consulta aos Dados do Sistema**: Quando o usuário perguntar sobre lotes, quadras, contratos, inadimplência, titulares, pessoas ou financeiro, você DEVE utilizar as ferramentas disponíveis (function calling) para consultar os dados reais. NUNCA invente números, lotes ou informações cadastrais.
3. **Lei 13.465/2017**: Se o usuário tiver dúvidas jurídicas ou processuais sobre REURB (ex: diferença entre REURB-S e REURB-E, CRF - Certidão de Regularização Fundiária, termo de adesão, memorial descritivo, notificação de confrontantes, registro em cartório), fundamente sua resposta com precisão na legislação.
4. **Formatação Elegante**: Responda sempre em português do Brasil, de forma clara, amigável e profissional. Use tabelas Markdown para listas de lotes/valores, tópicos numerados ou com marcadores, e destaque valores em negrito.
5. **Segurança**: Nunca exponha senhas ou dados confidenciais de credenciais.
`;

export async function processGeminiChatMessage(
  userMessage: string,
  history: ChatMessage[] = [],
  uploadedFile?: any,
  userId?: string
) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    return {
      text: 'Olá! Sou o Assistente de Inteligência Artificial do **Gênesis REURB**.\n\nPara que eu possa responder às suas perguntas e consultar os dados de lotes, contratos e financeiro em tempo real com o Google Gemini, configure a chave `GEMINI_API_KEY` no arquivo `.env` do backend.\n\nEnquanto isso, você pode continuar utilizando o sistema normalmente!',
      toolCallsExecuted: [],
      apiKeyConfigured: false,
    };
  }

  // Model hierarchy: Prefer fast and reliable gemini-3.5-flash-lite, fallback to gemini-3.5-flash or gemini-3.8-flash
  const modelsToTry = [
    process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.8-flash',
    'gemini-flash-latest',
  ];

  const ai = new GoogleGenAI({ apiKey });
  const executedToolNames: string[] = [];

  // Build contents history
  const contents: any[] = [];

  for (const h of history) {
    contents.push({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.content }],
    });
  }

  // Add current message with file context if attached
  let promptText = userMessage;
  if (uploadedFile) {
    promptText += `\n\n[SISTEMA - ARQUIVO ANEXADO PELO USUÁRIO]:
- Nome original: "${uploadedFile.originalname}"
- Tamanho: ${Math.round(uploadedFile.size / 1024)} KB
- Tipo MIME: ${uploadedFile.mimetype}
O usuário enviou este arquivo anexo. Se ele solicitar upload, cadastro ou vinculação a uma quadra/lote/titular, acione a ferramenta "uploadLotDocument".`;
  }

  contents.push({
    role: 'user',
    parts: [{ text: promptText }],
  });

  for (const modelName of modelsToTry) {
    try {
      // Step 1: Initial call with function declarations
      const response = await ai.models.generateContent({
        model: modelName,
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: [{ functionDeclarations: ALL_GEMINI_TOOLS }],
        },
      });

      // Check if model requested a tool call
      const functionCalls = response.functionCalls;

      if (functionCalls && functionCalls.length > 0) {
        // Execute tool calls
        const functionResponseParts: any[] = [];

        // Save model's function call turn
        contents.push(response.candidates?.[0]?.content || {
          role: 'model',
          parts: functionCalls.map((fc) => ({ functionCall: fc })),
        });

        for (const call of functionCalls) {
          const toolName = call.name || '';
          executedToolNames.push(toolName);
          const toolResult = await dispatchToolCall(toolName, call.args || {}, uploadedFile, userId);

          functionResponseParts.push({
            functionResponse: {
              name: toolName,
              response: toolResult,
              id: (call as any).id,
            },
          });
        }

        // Add function execution results to contents (role 'user' required by Google GenAI SDK for functionResponse)
        contents.push({
          role: 'user',
          parts: functionResponseParts,
        });

        // Step 2: Final response with tool results included
        const secondResponse = await ai.models.generateContent({
          model: modelName,
          contents,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
          },
        });

        return {
          text: secondResponse.text || 'Operação realizada com sucesso.',
          toolCallsExecuted: executedToolNames,
          apiKeyConfigured: true,
          modelUsed: modelName,
        };
      }

      // No tool calls needed, direct answer
      return {
        text: response.text || 'Olá, como posso ajudar com o Gênesis REURB?',
        toolCallsExecuted: [],
        apiKeyConfigured: true,
        modelUsed: modelName,
      };
    } catch (err: any) {
      console.warn(`[Gemini Assistant] Falha no modelo ${modelName}:`, err?.message || err);
      // If error is about model not found, loop to next fallback model
      continue;
    }
  }

  throw new Error('Não foi possível conectar aos modelos do Gemini. Verifique sua chave de API e conexão de internet.');
}
