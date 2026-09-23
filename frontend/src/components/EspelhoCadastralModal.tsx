import React from 'react';
import { X, Printer, Building2, MapPin, User, FileText, DollarSign, Calendar, CheckCircle2 } from 'lucide-react';
import { LotDrawerData } from './LotMapDrawer';

interface EspelhoCadastralModalProps {
  isOpen: boolean;
  onClose: () => void;
  lotData: LotDrawerData | null;
  projectName?: string;
  projectCity?: string;
}

export function EspelhoCadastralModal({
  isOpen,
  onClose,
  lotData,
  projectName = 'Vila Nova',
  projectCity = 'Aripuanã - MT'
}: EspelhoCadastralModalProps) {
  if (!isOpen || !lotData) return null;

  const lot = lotData.lotData;
  const occupant = lot?.occupant;
  const contract = lot?.contract;
  const financial = lot?.financial;

  // Format currency
  const fmtCurrency = (val?: number | null) => {
    if (val === undefined || val === null) return 'R$ 0,00';
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Format date
  const fmtDate = (val?: string | null) => {
    if (!val) return 'Não informada';
    return new Date(val).toLocaleDateString('pt-BR');
  };

  const handlePrint = () => {
    window.print();
  };

  const now = new Date();
  const emissionDate = now.toLocaleDateString('pt-BR') + ' às ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const authCode = `REURB-${(lotData.featureId || 'LOTE').toUpperCase()}-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      {/* Print Styles injected for clean A4 print */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-espelho, #printable-espelho * {
            visibility: visible !important;
          }
          #printable-espelho {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 1.5cm !important;
            background: #ffffff !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Modal Dialog Card */}
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* Top Header Actions (Hidden in Print) */}
        <div className="no-print shrink-0 px-6 py-4 bg-slate-800 text-white flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center gap-2.5">
            <Building2 className="w-5 h-5 text-teal-400" />
            <div>
              <h2 className="text-base font-bold">Espelho Cadastral do Imóvel</h2>
              <p className="text-xs text-slate-300">Ficha Técnica Oficial para Vistoria e Arquivo Cadastral</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-xs transition cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Imprimir / Salvar PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-700 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Document Body */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 text-slate-800 bg-white" id="printable-espelho">
          {/* Institutional Document Header */}
          <div className="border-b-2 border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-[#0f5964] text-white flex items-center justify-center font-black text-xl tracking-tighter">
                GR
              </div>
              <div>
                <h1 className="text-sm font-black tracking-wider uppercase text-slate-900">
                  GÊNESIS REURB - REGULARIZAÇÃO FUNDIÁRIA URBANA
                </h1>
                <p className="text-xs font-semibold text-slate-600">
                  Sistema Integrado de Informações Geográficas e Cadastro Imobiliário
                </p>
                <p className="text-[11px] text-slate-500">
                  Município: <span className="font-semibold text-slate-700">{projectCity}</span> | Projeto: <span className="font-semibold text-slate-700">{projectName}</span>
                </p>
              </div>
            </div>

            <div className="text-right sm:border-l sm:border-slate-200 sm:pl-4">
              <span className="inline-block px-2.5 py-1 rounded bg-slate-100 text-slate-800 text-[10px] font-mono font-bold tracking-wide border border-slate-300">
                {authCode}
              </span>
              <p className="text-[10px] text-slate-500 mt-1">Emissão: {emissionDate}</p>
            </div>
          </div>

          {/* Title Banner */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
            <h2 className="text-base font-extrabold text-slate-900 uppercase tracking-wide">
              ESPELHO DO CADASTRO IMOBILIÁRIO (FICHA TÉCNICA)
            </h2>
            <p className="text-xs text-slate-600">
              Certidão Descritiva e Situacional do Imóvel para Processo de Regularização Fundiária
            </p>
          </div>

          {/* SECTION 1: IDENTIFICAÇÃO BÁSICA */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0f5964] border-b border-slate-200 pb-1 mb-2.5 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> 1. IDENTIFICAÇÃO DO IMÓVEL
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Loteamento</span>
                <span className="font-bold text-slate-900">{projectName}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Quadra Oficial</span>
                <span className="font-extrabold text-[#0f5964] text-sm">
                  {lotData.blockNumber ? `Quadra ${lotData.blockNumber}` : 'A Definir'}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Lote Nº</span>
                <span className="font-extrabold text-[#0f5964] text-sm">
                  {lotData.lotNumber || lotData.label || 'S/N'}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Inscrição / ID</span>
                <span className="font-mono text-slate-700 font-semibold">{lot?.registration || lotData.featureId}</span>
              </div>
            </div>
          </div>

          {/* SECTION 2: LOCALIZAÇÃO E ENDEREÇO */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0f5964] border-b border-slate-200 pb-1 mb-2.5 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" /> 2. LOCALIZAÇÃO E LOGRADOURO
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 sm:col-span-2">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Endereço / Logradouro</span>
                <span className="font-semibold text-slate-800">
                  {lot?.address || `Rua Projetada, Quadra ${lotData.blockNumber || '-'}, Lote ${lotData.lotNumber || '-'}`}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Bairro / Setor</span>
                <span className="font-semibold text-slate-800">{projectName}</span>
              </div>
            </div>
          </div>

          {/* SECTION 3: DADOS FÍSICOS E TOPOGRÁFICOS */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0f5964] border-b border-slate-200 pb-1 mb-2.5 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> 3. DADOS FÍSICOS, DIMENSÕES E COORDENADAS
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Área Territorial</span>
                <span className="text-sm font-extrabold text-slate-900">
                  {lotData.areaM2 ? `${lotData.areaM2.toFixed(2)} m²` : 'Não informada'}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Perímetro</span>
                <span className="text-sm font-bold text-slate-900">
                  {lotData.perimeterM ? `${lotData.perimeterM.toFixed(2)} m` : 'Calculado em planta'}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 sm:col-span-2">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Centróide UTM (SIRGAS 2000 Fuso 21S)</span>
                <span className="font-mono text-slate-700 font-medium">
                  {lotData.utmCenter
                    ? `X (E): ${lotData.utmCenter[0].toFixed(2)} m | Y (N): ${lotData.utmCenter[1].toFixed(2)} m`
                    : 'Disponível no SIGWeb'}
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 4: TITULAR / OCUPANTE */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0f5964] border-b border-slate-200 pb-1 mb-2.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" /> 4. DADOS DO TITULAR / OCUPANTE
            </h3>
            {occupant ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Nome Completo</span>
                  <span className="font-extrabold text-slate-900">{occupant.name}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">CPF / CNPJ</span>
                  <span className="font-mono font-bold text-slate-800">{occupant.cpf || 'Não informado'}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Telefone / WhatsApp</span>
                  <span className="font-semibold text-slate-800">{occupant.phone || 'Não informado'}</span>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
                <span>Imóvel sem ocupante ou titular vinculado no sistema de cadastro até o momento.</span>
              </div>
            )}
          </div>

          {/* SECTION 5: SITUAÇÃO CONTRATUAL E JURÍDICA */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0f5964] border-b border-slate-200 pb-1 mb-2.5 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> 5. REGULARIZAÇÃO FUNDIÁRIA E SITUAÇÃO CONTRATUAL
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Status Contratual</span>
                <span className="font-bold text-slate-900">
                  {lotData.statusContract === 'CONTRACT_SIGNED'
                    ? 'Contrato Assinado'
                    : lotData.statusContract === 'NOT_SIGNED'
                    ? 'Pendente de Assinatura'
                    : lotData.statusContract === 'DISTRATTO'
                    ? 'Distratado'
                    : 'Não Vinculado'}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Nº do Contrato</span>
                <span className="font-mono font-semibold text-slate-800">
                  {contract?.contractNumber || 'Não gerado'}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Data Assinatura</span>
                <span className="font-medium text-slate-800">{fmtDate(contract?.signedAt)}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Modalidade REURB</span>
                <span className="font-semibold text-slate-800">REURB-S (Social)</span>
              </div>
            </div>
          </div>

          {/* SECTION 6: RESUMO FINANCEIRO */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0f5964] border-b border-slate-200 pb-1 mb-2.5 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5" /> 6. SITUAÇÃO FINANCEIRA E PARCELAMENTO
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Status Financeiro</span>
                <span className="font-bold text-slate-900">
                  {lotData.statusFinancial === 'PAID'
                    ? 'Quitado'
                    : lotData.statusFinancial === 'UP_TO_DATE'
                    ? 'Em dia'
                    : lotData.statusFinancial === 'OVERDUE'
                    ? 'Em atraso'
                    : 'Sem cobrança'}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Valor Total</span>
                <span className="font-bold text-slate-900">{fmtCurrency(financial?.totalAmount || contract?.totalValue)}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Parcelas Pagas</span>
                <span className="font-bold text-emerald-700">
                  {financial ? `${financial.paidInstallments} de ${financial.totalInstallments}` : '-'}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Saldo Restante</span>
                <span className="font-bold text-slate-800">{fmtCurrency(financial?.remainingAmount)}</span>
              </div>
            </div>
          </div>

          {/* SECTION 7: TERMO DE VISTORIA E ASSINATURAS */}
          <div className="pt-4 border-t border-slate-200">
            <p className="text-[10px] text-slate-500 leading-relaxed text-justify mb-8">
              Atestamos que os dados constantes neste espelho cadastral refletem fielmente as informações topográficas,
              urbanísticas e cadastrais levantadas in loco e georreferenciadas no Sistema Integrado de Regularização
              Fundiária Urbana (Gênesis REURB), nos termos da Lei Federal nº 13.465/2017 e Decreto nº 9.310/2018.
            </p>

            <div className="grid grid-cols-2 gap-8 text-center text-xs">
              <div className="border-t border-slate-400 pt-2">
                <p className="font-bold text-slate-800">
                  {occupant?.name || 'Titular / Ocupante do Imóvel'}
                </p>
                <p className="text-[10px] text-slate-500">CPF: {occupant?.cpf || '_______________________'}</p>
              </div>

              <div className="border-t border-slate-400 pt-2">
                <p className="font-bold text-slate-800">Responsável Técnico / REURB</p>
                <p className="text-[10px] text-slate-500">CREA / CAU / Departamento de Regularização</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions (Hidden in Print) */}
        <div className="no-print shrink-0 px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Documento gerado automaticamente pelo módulo SIGWeb do Gênesis REURB
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition cursor-pointer"
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0f5964] hover:bg-[#0c4750] text-white text-xs font-bold shadow-xs transition cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Imprimir Espelho
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

