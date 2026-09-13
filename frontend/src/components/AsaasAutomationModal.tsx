import React, { useState } from 'react';
import axios from 'axios';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  CheckCircle,
  FileSpreadsheet,
  HelpCircle,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  UploadCloud,
  X,
  Zap,
} from 'lucide-react';
import { maskCurrency } from '../utils/money';
import { normalizeText } from '../utils/text';

type SyncRecordLog = {
  asaasId: string;
  clientName: string;
  cpf: string;
  lotInfo: string;
  description: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  status: string;
  action: 'CRIADA' | 'BAIXADA' | 'ATUALIZADA' | 'SEM_ALTERACAO' | 'ALERTA';
  details: string;
};

type SyncResult = {
  dryRun: boolean;
  summary: {
    totalRows: number;
    totalClients: number;
    totalAmount: number;
    totalPaidAmount: number;
    createdCount: number;
    paidCount: number;
    updatedCount: number;
    alertCount: number;
  };
  records: SyncRecordLog[];
};

type Props = {
  onClose: () => void;
  onSuccess: () => Promise<void>;
};

const actionBadges: Record<
  SyncRecordLog['action'],
  { label: string; style: string; icon: React.ReactNode }
> = {
  BAIXADA: {
    label: 'Baixa Automática',
    style: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    icon: <CheckCircle2 size={13} className="text-emerald-700" />,
  },
  CRIADA: {
    label: 'Parcela Criada',
    style: 'bg-sky-100 text-sky-800 border-sky-300',
    icon: <Sparkles size={13} className="text-sky-700" />,
  },
  ATUALIZADA: {
    label: 'Atualizada',
    style: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    icon: <RefreshCw size={13} className="text-indigo-700" />,
  },
  SEM_ALTERACAO: {
    label: 'Já Sincronizada',
    style: 'bg-slate-100 text-slate-700 border-slate-200',
    icon: <CheckCircle size={13} className="text-slate-500" />,
  },
  ALERTA: {
    label: 'Atenção / Não Localizado',
    style: 'bg-amber-100 text-amber-800 border-amber-300',
    icon: <AlertTriangle size={13} className="text-amber-700" />,
  },
};

export function AsaasAutomationModal({ onClose, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [dryRun, setDryRun] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [filterAction, setFilterAction] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  async function handleProcess(isDryRun: boolean) {
    if (!file) {
      setError('Selecione uma planilha .xlsx do Asaas antes de processar.');
      return;
    }

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('dryRun', String(isDryRun));

    try {
      const response = await axios.post('/api/finance/asaas/sync', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const data: SyncResult = response.data.data;
      setResult(data);

      if (!isDryRun) {
        await onSuccess();
      }
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          'Ocorreu um erro ao processar a planilha do Asaas. Verifique a formatação do arquivo.'
      );
    } finally {
      setLoading(false);
    }
  }

  const filteredRecords = (result?.records || []).filter((rec) => {
    const matchesAction = !filterAction || rec.action === filterAction;
    const query = normalizeText(searchTerm);
    const matchesSearch =
      !query ||
      normalizeText(rec.clientName).includes(query) ||
      normalizeText(rec.cpf).includes(query) ||
      normalizeText(rec.lotInfo).includes(query) ||
      normalizeText(rec.asaasId).includes(query) ||
      normalizeText(rec.details).includes(query);

    return matchesAction && matchesSearch;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#102a33]/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="asaas-auto-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-[#f8fffe] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0f5964] text-white shadow-md">
              <Zap size={22} className="text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="asaas-auto-title" className="text-lg font-bold text-[#17343b]">
                  Automação Financeira Asaas
                </h2>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                  Pronto para API & XLSX
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Sincronização, criação e baixa automática de parcelas vinculadas por CPF e Lote via ID/Fatura Asaas.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Fechar"
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {error && (
            <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <div>
                <strong>Erro no processamento:</strong> {error}
              </div>
            </div>
          )}

          {/* Upload Area & Execution Options */}
          <div className="grid gap-4 md:grid-cols-3">
            {/* File drop area */}
            <div className="md:col-span-2">
              <label
                className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-5 text-center transition cursor-pointer ${
                  file
                    ? 'border-[#0f5964] bg-[#f0f9fa]'
                    : 'border-slate-300 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      setFile(e.target.files[0]);
                      setResult(null);
                      setError(null);
                    }
                  }}
                />
                <FileSpreadsheet
                  size={36}
                  className={file ? 'text-[#0f5964]' : 'text-slate-400'}
                />
                {file ? (
                  <div className="mt-2">
                    <p className="text-sm font-semibold text-slate-900">{file.name}</p>
                    <p className="text-xs text-slate-500">
                      {(file.size / 1024).toFixed(1)} KB · Clique para trocar de arquivo
                    </p>
                  </div>
                ) : (
                  <div className="mt-2">
                    <p className="text-sm font-medium text-slate-800">
                      Clique ou arraste a planilha <span className="font-semibold">.xlsx</span> do Asaas
                    </p>
                    <p className="text-xs text-slate-500">
                      Relatório "Contas a Receber" exportado do Base by Asaas
                    </p>
                  </div>
                )}
              </label>
            </div>

            {/* Mode & Run Card */}
            <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Modo de Execução
                </p>
                <div className="mt-2 space-y-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                    <input
                      type="radio"
                      name="syncMode"
                      checked={dryRun}
                      onChange={() => setDryRun(true)}
                      className="text-[#0f5964]"
                    />
                    🧪 Simulação (Testar sem gravar)
                  </label>
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                    <input
                      type="radio"
                      name="syncMode"
                      checked={!dryRun}
                      onChange={() => setDryRun(false)}
                      className="text-[#0f5964]"
                    />
                    ⚡ Executar e Baixar no Banco
                  </label>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  disabled={!file || loading}
                  onClick={() => handleProcess(dryRun)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0f5964] px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-[#0c4952] disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Analisando planilha...
                    </>
                  ) : dryRun ? (
                    <>
                      <Play size={16} /> Iniciar Simulação
                    </>
                  ) : (
                    <>
                      <Zap size={16} /> Processar e Gravar
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Results Summary */}
          {result && (
            <div className="space-y-4">
              {/* Notification Banner */}
              <div
                className={`flex items-center justify-between rounded-2xl p-4 text-sm ${
                  result.dryRun
                    ? 'border border-amber-200 bg-amber-50 text-amber-900'
                    : 'border border-emerald-200 bg-emerald-50 text-emerald-900'
                }`}
              >
                <div className="flex items-center gap-2">
                  {result.dryRun ? (
                    <AlertCircle size={20} className="text-amber-600" />
                  ) : (
                    <CheckCircle2 size={20} className="text-emerald-600" />
                  )}
                  <div>
                    <strong>
                      {result.dryRun
                        ? 'Simulação Concluída (Nenhum dado foi alterado)'
                        : 'Sincronização Gravada com Sucesso no Banco!'}
                    </strong>
                    <p className="text-xs opacity-80">
                      {result.summary.totalRows} cobranças processadas de {result.summary.totalClients} clientes.
                    </p>
                  </div>
                </div>

                {result.dryRun && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handleProcess(false)}
                    className="flex items-center gap-2 rounded-xl bg-[#0f5964] px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-[#0c4952]"
                  >
                    <Zap size={14} className="text-amber-300" /> Efetivar no Banco Agora
                  </button>
                )}
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <MetricBox
                  label="Total de Contas"
                  value={String(result.summary.totalRows)}
                  color="text-slate-800"
                />
                <MetricBox
                  label="Valor Total"
                  value={maskCurrency(result.summary.totalAmount)}
                  color="text-slate-800"
                />
                <MetricBox
                  label="Baixas Automáticas"
                  value={`${result.summary.paidCount} (${maskCurrency(result.summary.totalPaidAmount)})`}
                  color="text-emerald-700"
                />
                <MetricBox
                  label="Parcelas Criadas"
                  value={String(result.summary.createdCount)}
                  color="text-sky-700"
                />
                <MetricBox
                  label="Atualizadas"
                  value={String(result.summary.updatedCount)}
                  color="text-indigo-700"
                />
                <MetricBox
                  label="Avisos"
                  value={String(result.summary.alertCount)}
                  color="text-amber-700"
                />
              </div>

              {/* Records Filter & Table */}
              <div className="rounded-2xl border border-slate-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
                  <h3 className="font-semibold text-[#17343b] text-sm">
                    Detalhamento das Operações ({filteredRecords.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      placeholder="Filtrar por cliente, CPF, lote, ID..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800"
                    />
                    <select
                      value={filterAction}
                      onChange={(e) => setFilterAction(e.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800"
                    >
                      <option value="">Todas as Ações</option>
                      <option value="BAIXADA">Baixas Automáticas</option>
                      <option value="CRIADA">Parcelas Criadas</option>
                      <option value="ATUALIZADA">Atualizadas</option>
                      <option value="SEM_ALTERACAO">Sem Alteração</option>
                      <option value="ALERTA">Avisos</option>
                    </select>
                  </div>
                </div>

                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-slate-50 uppercase text-slate-500 border-b">
                      <tr>
                        <th className="px-4 py-2.5">Cliente / CPF</th>
                        <th className="px-4 py-2.5">Imóvel / Lote</th>
                        <th className="px-4 py-2.5">ID / Fatura Asaas</th>
                        <th className="px-4 py-2.5">Vencimento / Valor</th>
                        <th className="px-4 py-2.5">Ação do Sistema</th>
                        <th className="px-4 py-2.5">Observação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRecords.map((rec, index) => {
                        const badge = actionBadges[rec.action] || actionBadges.SEM_ALTERACAO;
                        return (
                          <tr key={`${rec.asaasId}-${index}`} className="hover:bg-slate-50">
                            <td className="px-4 py-2.5">
                              <div className="font-semibold text-slate-900">{rec.clientName}</div>
                              <span className="text-[11px] text-slate-500">CPF: {rec.cpf}</span>
                            </td>
                            <td className="px-4 py-2.5 font-medium text-slate-700">
                              {rec.lotInfo}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                                {rec.asaasId}
                              </span>
                              <span className="block text-[11px] text-slate-500">{rec.description}</span>
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="font-semibold text-slate-900">
                                {maskCurrency(rec.amount)}
                              </div>
                              <span className="text-[11px] text-slate-500">
                                Venc: {new Date(rec.dueDate).toLocaleDateString('pt-BR')}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badge.style}`}
                              >
                                {badge.icon}
                                {badge.label}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-slate-600">
                              {rec.details}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
          <div className="text-xs text-slate-500">
            💡 Dica: Quando você migrar para a API do Asaas, as baixas ocorrerão em tempo real automaticamente por este mesmo motor.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

function MetricBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-soft">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`mt-1 text-sm font-bold truncate ${color}`}>{value}</p>
    </div>
  );
}
