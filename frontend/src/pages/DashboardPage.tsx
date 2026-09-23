import React, { useEffect, useState } from 'react';
import { Legend, ResponsiveContainer, Line, LineChart, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import axios from 'axios';
import { LayoutDashboard, MapPin } from 'lucide-react';
import { MapPage } from './MapPage';

type DashboardData = {
  projectsCount: number;
  lotsCount: number;
  peopleCount: number;
  signedContracts: number;
  totalContractValue: number;
  financeData: Array<{ month: string; received: number; due: number }>;
  documentStatus: Array<{ name: string; value: number }>;
  financialSummary: { received: number; outstanding: number; overdue: number };
  pending: { documents: number; incompletePeople: number; unsignedContracts: number; overdueInstallments: number };
  recent: { people: number; documents: number; contracts: number; payments: number };
};

const COLORS = ['#1c3b45', '#2a8a7f', '#f59e0b'];

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'map'>('overview');

  useEffect(() => {
    async function load() {
      try {
        const res = await axios.get('/api/dashboard');
        setData(res.data.data);
      } catch (err) {
        setError('Falha ao carregar dashboard');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const stats = data
    ? [
        { label: 'Projetos ativos', value: data.projectsCount },
        { label: 'Total de lotes', value: data.lotsCount },
        { label: 'Famílias cadastradas', value: data.peopleCount },
        { label: 'Contratos assinados', value: data.signedContracts },
      ]
    : [
        { label: 'Projetos ativos', value: 0 },
        { label: 'Total de lotes', value: 0 },
        { label: 'Famílias cadastradas', value: 0 },
        { label: 'Contratos assinados', value: 0 },
      ];

  const financeData = data?.financeData || [];
  const documentStatus = data?.documentStatus || [];
  const money = (value = 0) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  if (loading) return <p>Carregando dashboard...</p>;
  if (error) return <p className="text-red-500">{error}</p>;

  return (
    <div className="space-y-6">
      {/* Top View Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl font-bold text-[#1c3b45]">Painel de Controle</h1>
          <p className="text-xs text-slate-500">Gestão e acompanhamento operacional dos projetos</p>
        </div>

        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-white text-[#1c3b45] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            Visão Geral
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('map')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeTab === 'map'
                ? 'bg-[#0f5964] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            Mapa dos Projetos
          </button>
        </div>
      </div>

      {activeTab === 'map' ? (
        <MapPage />
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-4">
        {stats.map((item) => (
          <div key={item.label} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
            <p className="text-sm text-slate-500">{item.label}</p>
            <p className="mt-4 text-3xl font-semibold text-[#1c3b45]">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2 rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#1c3b45]">Recebimentos por mês</h2>
              <p className="text-sm text-slate-500">Pagamentos registrados e saldo por vencimento · últimos 6 meses</p>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={financeData}>
                <Legend />
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value: number) => `R$ ${value.toLocaleString('pt-BR')}`} />
                <Line type="monotone" dataKey="received" name="Recebido" stroke="#2a8a7f" strokeWidth={3} dot />
                <Line type="monotone" dataKey="due" name="Saldo por vencimento" stroke="#f59e0b" strokeWidth={3} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-[#1c3b45]">Situação documental</h2>
            <p className="text-sm text-slate-500">Percentual de documentos por status</p>
          </div>
          <div className="h-72">
            {documentStatus.length === 0 ? <p className="text-sm text-slate-500">Nenhum documento cadastrado.</p> : <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Legend />
                <Pie data={documentStatus} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} fill="#8884d8">
                  {documentStatus.map((entry, index) => (
                    <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => `${value} documentos`} />
              </PieChart>
            </ResponsiveContainer>}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
          <h3 className="text-base font-semibold text-[#1c3b45]">Pendências</h3>
          <ul className="mt-5 space-y-4 text-sm text-slate-600">
            <li>Documentos com pendências: {data?.pending.documents ?? 0}</li>
            <li>Pessoas sem CPF ou telefone: {data?.pending.incompletePeople ?? 0}</li>
            <li>Contratos não assinados: {data?.pending.unsignedContracts ?? 0}</li>
            <li>Parcelas vencidas: {data?.pending.overdueInstallments ?? 0}</li>
          </ul>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
          <h3 className="text-base font-semibold text-[#1c3b45]">Atividades · últimos 7 dias</h3>
          <ul className="mt-5 space-y-4 text-sm text-slate-600">
            <li>Novos cadastros: {data?.recent.people ?? 0}</li>
            <li>Documentos enviados: {data?.recent.documents ?? 0}</li>
            <li>Contratos assinados: {data?.recent.contracts ?? 0}</li>
            <li>Pagamentos registrados: {data?.recent.payments ?? 0}</li>
          </ul>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
          <h3 className="text-base font-semibold text-[#1c3b45]">Resumo financeiro</h3>
          <div className="mt-5 space-y-4 text-sm text-slate-600">
            <div className="flex items-center justify-between">
              <span>Total contratado</span>
              <strong>{money(data?.totalContractValue)}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span>Valor recebido</span>
              <strong>{money(data?.financialSummary.received)}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span>Saldo a receber</span>
              <strong>{money(data?.financialSummary.outstanding)}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span>Valor vencido</span>
              <strong className="text-warning-orange">{money(data?.financialSummary.overdue)}</strong>
            </div>
          </div>
        </div>
      </div>
    </>
  )}
</div>
);
}
