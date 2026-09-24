import { Request, Response, NextFunction } from 'express';
import {
  getLotPendenciesReport,
  getDocumentChecklistReport,
  getOverdueInstallmentsReport,
  getContractsEvolutionReport,
  getServiceRecordsReport,
  exportReportToExcel,
  exportReportToPDF,
  ReportFilterParams
} from '../services/reports.service';

const AVAILABLE_REPORTS = [
  {
    id: 'lot-pendencies',
    title: 'Pendências por Lote',
    category: 'Projetos',
    description: 'Acompanhamento detalhado de pendências cadastrais, técnicas, de atendimento e documentais por lote com prazo e responsável.',
    dateFilterLabel: 'Data de registro da pendência',
    supportsReferenceDate: false,
    supportsResponsible: true,
    supportsSituation: true,
    supportsOverdueToggle: true,
    situations: ['Todas', 'Em aberto', 'Vencida', 'Precisa de correção', 'Em análise']
  },
  {
    id: 'document-checklist',
    title: 'Checklist Documental',
    category: 'Documentos',
    description: 'Controle de exigências documentais obrigatórias da REURB por lote, titular e situação de entrega.',
    dateFilterLabel: 'Data de entrega do documento (upload)',
    supportsReferenceDate: false,
    supportsResponsible: false,
    supportsSituation: true,
    supportsDocType: true,
    situations: ['Todas', 'Não entregue', 'Em análise', 'Aprovado', 'Precisa de correção']
  },
  {
    id: 'overdue-installments',
    title: 'Parcelas em Atraso (Inadimplência)',
    category: 'Financeiro',
    description: 'Levantamento de parcelas com vencimento anterior à data de referência com saldo em aberto e distribuição por faixa de atraso.',
    dateFilterLabel: 'Data de vencimento da parcela',
    supportsReferenceDate: true,
    supportsResponsible: false,
    supportsAgingBracket: true,
    agingBrackets: ['Todas', 'Até 30 dias', '31–60 dias', '61–90 dias', 'Acima de 90 dias']
  },
  {
    id: 'contracts-evolution',
    title: 'Evolução Contratual (Assinados vs Pendentes)',
    category: 'Contratos',
    description: 'Posição dos contratos emitidos, situação de assinatura, valores globais e progresso financeiro de amortização.',
    dateFilterLabel: 'Data de emissão do contrato',
    supportsReferenceDate: false,
    supportsResponsible: false,
    supportsStatus: true,
    statuses: ['Todos', 'Assinados', 'Pendentes']
  },
  {
    id: 'service-records',
    title: 'Histórico de Atendimentos',
    category: 'Atendimentos',
    description: 'Registros cronológicos de atendimentos, orientações e contatos agendados com as famílias ocupantes.',
    dateFilterLabel: 'Data do atendimento realizado',
    supportsReferenceDate: false,
    supportsResponsible: true
  }
];

export async function getReportCategories(_req: Request, res: Response) {
  const categories = [
    { id: 'Projetos', name: 'Projetos', icon: 'Layers', description: 'Regularização física, pendências cadastrais e lotes' },
    { id: 'Documentos', name: 'Documentos', icon: 'Folder', description: 'Checklist, conformidade documental e dossiês' },
    { id: 'Financeiro', name: 'Financeiro', icon: 'CreditCard', description: 'Inadimplência, cobranças e fluxo financeiro' },
    { id: 'Contratos', name: 'Contratos', icon: 'FileText', description: 'Assinaturas, minutas e evolução contratual' },
    { id: 'Atendimentos', name: 'Atendimentos', icon: 'Activity', description: 'Histórico de atendimentos e contatos com as famílias' }
  ];

  return res.json({
    success: true,
    data: {
      categories,
      reports: AVAILABLE_REPORTS
    },
    message: 'Metadados da central de relatórios carregados com sucesso'
  });
}

export async function getReportData(req: Request, res: Response, next: NextFunction) {
  try {
    const reportType = (req.query.reportType as string) || 'lot-pendencies';
    const filters: ReportFilterParams = {
      projectId: req.query.projectId as string,
      responsibleId: req.query.responsibleId as string,
      situation: req.query.situation as string,
      status: req.query.status as string,
      referenceDate: req.query.referenceDate as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      docType: req.query.docType as string,
      isOverdueOnly: req.query.isOverdueOnly === 'true',
      agingBracket: req.query.agingBracket as string,
      search: req.query.search as string
    };

    let reportResult: any;

    switch (reportType) {
      case 'lot-pendencies':
        reportResult = await getLotPendenciesReport(filters);
        break;
      case 'document-checklist':
        reportResult = await getDocumentChecklistReport(filters);
        break;
      case 'overdue-installments':
        reportResult = await getOverdueInstallmentsReport(filters);
        break;
      case 'contracts-evolution':
        reportResult = await getContractsEvolutionReport(filters);
        break;
      case 'service-records':
        reportResult = await getServiceRecordsReport(filters);
        break;
      default:
        return res.status(400).json({ success: false, message: `Tipo de relatório inválido: ${reportType}` });
    }

    // Optional pagination
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const startIndex = (page - 1) * limit;
    const paginatedRows = reportResult.rows.slice(startIndex, startIndex + limit);

    return res.json({
      success: true,
      data: {
        ...reportResult,
        page,
        limit,
        totalPages: Math.ceil(reportResult.totalRecords / limit),
        rows: paginatedRows,
        allRowsCount: reportResult.totalRecords
      },
      message: 'Dados do relatório gerados com sucesso'
    });
  } catch (err) {
    return next(err);
  }
}

export async function exportReportExcel(req: Request, res: Response, next: NextFunction) {
  try {
    const reportType = (req.query.reportType as string) || 'lot-pendencies';
    const filters: ReportFilterParams = {
      projectId: req.query.projectId as string,
      responsibleId: req.query.responsibleId as string,
      situation: req.query.situation as string,
      status: req.query.status as string,
      referenceDate: req.query.referenceDate as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      docType: req.query.docType as string,
      isOverdueOnly: req.query.isOverdueOnly === 'true',
      agingBracket: req.query.agingBracket as string,
      search: req.query.search as string
    };

    let reportResult: any;
    switch (reportType) {
      case 'lot-pendencies':
        reportResult = await getLotPendenciesReport(filters);
        break;
      case 'document-checklist':
        reportResult = await getDocumentChecklistReport(filters);
        break;
      case 'overdue-installments':
        reportResult = await getOverdueInstallmentsReport(filters);
        break;
      case 'contracts-evolution':
        reportResult = await getContractsEvolutionReport(filters);
        break;
      case 'service-records':
        reportResult = await getServiceRecordsReport(filters);
        break;
      default:
        return res.status(400).json({ success: false, message: `Tipo de relatório inválido: ${reportType}` });
    }

    const excelBuffer = exportReportToExcel(reportResult);
    const timestamp = new Date().toISOString().slice(0, 10);
    const fileName = `relatorio_${reportType}_${timestamp}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(excelBuffer);
  } catch (err) {
    return next(err);
  }
}

export async function exportReportPDF(req: Request, res: Response, next: NextFunction) {
  try {
    const reportType = (req.query.reportType as string) || 'lot-pendencies';
    const filters: ReportFilterParams = {
      projectId: req.query.projectId as string,
      responsibleId: req.query.responsibleId as string,
      situation: req.query.situation as string,
      status: req.query.status as string,
      referenceDate: req.query.referenceDate as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      docType: req.query.docType as string,
      isOverdueOnly: req.query.isOverdueOnly === 'true',
      agingBracket: req.query.agingBracket as string,
      search: req.query.search as string
    };

    let reportResult: any;
    switch (reportType) {
      case 'lot-pendencies':
        reportResult = await getLotPendenciesReport(filters);
        break;
      case 'document-checklist':
        reportResult = await getDocumentChecklistReport(filters);
        break;
      case 'overdue-installments':
        reportResult = await getOverdueInstallmentsReport(filters);
        break;
      case 'contracts-evolution':
        reportResult = await getContractsEvolutionReport(filters);
        break;
      case 'service-records':
        reportResult = await getServiceRecordsReport(filters);
        break;
      default:
        return res.status(400).json({ success: false, message: `Tipo de relatório inválido: ${reportType}` });
    }

    const pdfBuffer = await exportReportToPDF(reportResult);
    const timestamp = new Date().toISOString().slice(0, 10);
    const fileName = `relatorio_${reportType}_${timestamp}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(pdfBuffer);
  } catch (err) {
    return next(err);
  }
}
