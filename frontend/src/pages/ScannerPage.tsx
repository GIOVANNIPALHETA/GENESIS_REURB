import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import axios from 'axios';
import {
  Camera,
  ScanLine,
  FileText,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Layers,
  ArrowRight,
  UploadCloud,
  FileCheck,
  ShieldCheck,
  Smartphone,
  ChevronRight,
  ExternalLink,
  MapPin
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { DocumentScannerModal } from '../components/DocumentScannerModal';
import { formatCpf } from '../utils/cpf';

interface RecentDocument {
  id: string;
  originalName: string;
  category?: string;
  createdAt: string;
  size: number;
  filePath: string;
  lot?: {
    id: string;
    number: string;
    block?: {
      number?: string;
      project?: {
        id?: string;
        name?: string;
      };
    } | null;
  } | null;
  person?: {
    id: string;
    fullName: string;
    cpf?: string | null;
  } | null;
}

const QUICK_SCAN_MODES = [
  {
    id: 'RG_TITULAR',
    category: 'RG/CPF ou CNH do Titular',
    title: 'RG / Identidade',
    badge: 'Frente & Verso',
    badgeColor: 'bg-teal-50 text-teal-700 border-teal-200',
    description: 'Guia retangular ID-1. Extrai CPF, RG, Órgão e Nome do beneficiário.',
    icon: UserCheck,
    color: 'border-teal-500/30 hover:border-teal-500 bg-gradient-to-br from-teal-50/50 to-white',
    iconColor: 'text-teal-600 bg-teal-100',
  },
  {
    id: 'CNH_TITULAR',
    category: 'RG/CPF ou CNH do Titular',
    title: 'CNH (Habilitação)',
    badge: 'Frente & Verso',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    description: 'Leitura de CPF, Registro Geral e Nome completo com reconhecimento OCR.',
    icon: ScanLine,
    color: 'border-emerald-500/30 hover:border-emerald-500 bg-gradient-to-br from-emerald-50/50 to-white',
    iconColor: 'text-emerald-600 bg-emerald-100',
  },
  {
    id: 'RESIDENCE',
    category: 'Comprovante de Residência',
    title: 'Comprovante Residencial',
    badge: 'Página Única',
    badgeColor: 'bg-sky-50 text-sky-700 border-sky-200',
    description: 'Fatura de energia, água ou telefone para comprovação de endereço da posse.',
    icon: MapPin,
    color: 'border-sky-500/30 hover:border-sky-500 bg-gradient-to-br from-sky-50/50 to-white',
    iconColor: 'text-sky-600 bg-sky-100',
  },
  {
    id: 'PURCHASE_CONTRACT',
    category: 'Contrato de Compra e Venda do Lote',
    title: 'Contrato de Compra e Venda',
    badge: 'Múltiplas Páginas',
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
    description: 'Fotografe página a página. Converte automaticamente para PDF único A4.',
    icon: FileText,
    color: 'border-amber-500/30 hover:border-amber-500 bg-gradient-to-br from-amber-50/50 to-white',
    iconColor: 'text-amber-600 bg-amber-100',
  },
  {
    id: 'CHAIN_CONTRACT',
    category: 'Sequência de Contrato (Cadeia Dominial)',
    title: 'Cadeia Dominial',
    badge: 'Múltiplas Páginas',
    badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    description: 'Contratos anteriores, recibos de quitação e cessões de direitos de posse.',
    icon: Layers,
    color: 'border-indigo-500/30 hover:border-indigo-500 bg-gradient-to-br from-indigo-50/50 to-white',
    iconColor: 'text-indigo-600 bg-indigo-100',
  },
  {
    id: 'CIVIL_CERT',
    category: 'Certidão de Casamento ou Nascimento',
    title: 'Certidão de Estado Civil',
    badge: 'Página Completa',
    badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
    description: 'Certidão de nascimento ou casamento com averbação para dossiê cartorial.',
    icon: FileCheck,
    color: 'border-purple-500/30 hover:border-purple-500 bg-gradient-to-br from-purple-50/50 to-white',
    iconColor: 'text-purple-600 bg-purple-100',
  },
];

export function ScannerPage() {
  const [searchParams] = useSearchParams();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('RG/CPF ou CNH do Titular');
  const [recentDocs, setRecentDocs] = useState<RecentDocument[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  // URL parameters for pre-linking
  const initialProjectId = searchParams.get('projectId') || undefined;
  const initialBlockId = searchParams.get('blockId') || undefined;
  const initialLotId = searchParams.get('lotId') || undefined;
  const initialPersonId = searchParams.get('personId') || undefined;
  const initialCategoryParam = searchParams.get('category') || undefined;

  // Automatically open modal if parameters are passed in URL
  useEffect(() => {
    if (initialLotId || initialCategoryParam) {
      if (initialCategoryParam) {
        setSelectedCategory(initialCategoryParam);
      }
      setIsModalOpen(true);
    }
  }, [initialLotId, initialCategoryParam]);

  // Load recently uploaded documents
  const loadRecentDocuments = async () => {
    try {
      setLoadingRecent(true);
      const res = await axios.get('/api/documents?limit=8');
      const docs = res.data.data || [];
      setRecentDocs(docs);
    } catch (err) {
      console.error('Erro ao buscar documentos recentes:', err);
    } finally {
      setLoadingRecent(false);
    }
  };

  useEffect(() => {
    loadRecentDocuments();
  }, []);

  const handleOpenScanner = (category?: string) => {
    if (category) {
      setSelectedCategory(category);
    }
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-8 pb-12">
      {/* PAGE HEADER */}
      <PageHeader
        title="Scanner Inteligente de Documentos"
        subtitle="Digitalização móvel com IA: capture fotos pelo celular, extraia dados por OCR e vincule automaticamente à Quadra, Lote e Titular."
      >
        <button
          type="button"
          onClick={() => handleOpenScanner()}
          className="flex items-center gap-2 rounded-xl bg-[#0f5964] px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#0c4952] transition cursor-pointer"
        >
          <Camera size={16} /> Abrir Câmera Agora
        </button>
      </PageHeader>

      {/* MOBILE HERO BANNER */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0c343d] via-[#0f5964] to-[#1a7f8e] p-6 sm:p-8 text-white shadow-lg">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-md px-3 py-1 text-xs font-semibold text-teal-200 border border-white/15">
              <Sparkles size={14} className="text-teal-300" />
              <span>Otimizado para Celulares e Tablets em Campo</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Escanear Documentos no Celular
            </h2>
            <p className="text-sm text-teal-100/90 leading-relaxed">
              Use a câmera do seu smartphone diretamente no navegador. O scanner aplica filtro P&amp;B de alto contraste, gira o documento, lê o CPF e RG via OCR e compila frente e verso em um único arquivo PDF padrão A4 para o dossiê cartorial.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleOpenScanner('RG/CPF ou CNH do Titular')}
                className="flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-xs font-bold text-[#0f5964] shadow-md hover:bg-slate-50 transition cursor-pointer"
              >
                <Camera size={16} /> Escanear RG / CNH Agora
              </button>
              <button
                type="button"
                onClick={() => handleOpenScanner('Contrato de Compra e Venda do Lote')}
                className="flex items-center gap-2 rounded-xl bg-teal-800/60 hover:bg-teal-800/90 border border-teal-300/30 px-4 py-2.5 text-xs font-semibold text-white transition cursor-pointer"
              >
                <FileText size={16} /> Escanear Contrato (Multi-páginas)
              </button>
            </div>
          </div>

          <div className="hidden lg:flex items-center justify-center p-6 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10 shrink-0">
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="p-3.5 rounded-2xl bg-white/20 text-white">
                <Smartphone size={36} />
              </div>
              <span className="text-xs font-bold text-white">Acesse pelo celular</span>
              <span className="text-[11px] text-teal-200">Compatível com Chrome, Safari e Edge</span>
            </div>
          </div>
        </div>

        {/* Decorative background circle */}
        <div className="absolute -right-20 -bottom-20 w-80 h-80 rounded-full bg-white/5 pointer-events-none blur-2xl" />
      </div>

      {/* QUICK SELECTION MODES */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Modos de Captura Rápida</h3>
            <p className="text-xs text-slate-500">Selecione o tipo de documento para ajustar o enquadramento ideal da câmera</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {QUICK_SCAN_MODES.map((mode) => {
            const IconComponent = mode.icon;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => handleOpenScanner(mode.category)}
                className={`text-left p-5 rounded-2xl border shadow-xs transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 group cursor-pointer ${mode.color}`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className={`p-2.5 rounded-xl ${mode.iconColor} transition-transform group-hover:scale-105`}>
                    <IconComponent size={22} />
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${mode.badgeColor}`}>
                    {mode.badge}
                  </span>
                </div>

                <h4 className="font-bold text-sm text-slate-900 group-hover:text-[#0f5964] transition">
                  {mode.title}
                </h4>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                  {mode.description}
                </p>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-[#0f5964]">
                  <span>Iniciar captura</span>
                  <ChevronRight size={14} className="transition-transform group-hover:translate-x-1" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* HOW IT WORKS / STEPS */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-soft space-y-6">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Sparkles size={18} className="text-[#0f5964]" /> Como funciona o Scanner Inteligente
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Fluxo automatizado projetado para garantir validade jurídica e conformidade cartorial na REURB
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-[#0f5964]">
                1
              </span>
              <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider">Captura Guiada</h4>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              O enquadrador visual orienta a posição do RG (frente e verso) ou folhas de contratos, evitando cortes ou distorções.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-[#0f5964]">
                2
              </span>
              <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider">Filtro de Contraste</h4>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Filtro P&amp;B profissional que limpa sombras e amarelamento de papel, simulando um scanner de mesa de alta resolução.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-[#0f5964]">
                3
              </span>
              <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider">Extração OCR</h4>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              A inteligência lê o texto do documento e identifica CPF válido, número de RG e Nome completo da pessoa.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-[#0f5964]">
                4
              </span>
              <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider">Vinculação Direta</h4>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Cruza o CPF com o banco e sugere o Titular, Quadra e Lote correspondentes com 1 clique, atualizando o cadastro.
            </p>
          </div>
        </div>
      </div>

      {/* RECENT SCANNED DOCUMENTS */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">Documentos Recentes no Sistema</h3>
            <p className="text-xs text-slate-500">Últimos arquivos digitalizados ou anexados nos lotes</p>
          </div>
          <Link
            to="/documents"
            className="flex items-center gap-1 text-xs font-semibold text-[#0f5964] hover:underline"
          >
            <span>Ver todos os dossiês</span>
            <ChevronRight size={14} />
          </Link>
        </div>

        {loadingRecent ? (
          <div className="py-8 text-center text-xs text-slate-400">
            Carregando lista de documentos...
          </div>
        ) : recentDocs.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            Nenhum documento registrado ainda. Clique em "Abrir Câmera Agora" para começar!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead>
                <tr className="border-b bg-slate-50/80 font-bold uppercase tracking-wider text-slate-600">
                  <th className="px-4 py-3">Documento</th>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3">Lote / Quadra</th>
                  <th className="px-4 py-3">Beneficiário</th>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentDocs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50/70 transition">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900 truncate max-w-[200px]">
                        {doc.originalName}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {(doc.size / 1024).toFixed(0)} KB
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-md bg-teal-50 px-2 py-1 text-[11px] font-semibold text-[#0f5964] border border-teal-200">
                        {doc.category || 'Geral'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {doc.lot ? (
                        <Link
                          to={`/lots/${doc.lot.id}`}
                          className="font-medium text-slate-900 hover:text-[#0f5964] hover:underline"
                        >
                          Lote {doc.lot.number}{doc.lot.block?.number ? ` (Qd ${doc.lot.block.number})` : ''}
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {doc.person ? (
                        <div>
                          <div className="font-medium text-slate-900">{doc.person.fullName}</div>
                          {doc.person.cpf && (
                            <div className="text-[10px] text-slate-400">
                              CPF: {formatCpf(doc.person.cpf)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(doc.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {doc.lot && (
                          <Link
                            to={`/lots/${doc.lot.id}`}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-[#0f5964] hover:bg-slate-50 transition"
                            title="Ver no Lote"
                          >
                            <ExternalLink size={14} />
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SCANNER MODAL */}
      <DocumentScannerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialProjectId={initialProjectId}
        initialBlockId={initialBlockId}
        initialLotId={initialLotId}
        initialPersonId={initialPersonId}
        initialCategory={selectedCategory}
        onScanComplete={() => {
          loadRecentDocuments();
        }}
      />
    </div>
  );
}

