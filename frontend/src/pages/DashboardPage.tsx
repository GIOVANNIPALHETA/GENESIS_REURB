import React, { useEffect, useState } from 'react';
import { Bar, ResponsiveContainer, Line, LineChart, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import axios from 'axios';

type DashboardData = {
  projectsCount: number;
  lotsCount: number;
  peopleCount: number;
  signedContracts: number;
  totalContractValue: number;
};

const COLORS = ['#1c3b45', '#2a8a7f', '#f59e0b'];

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const financeData = [
    { month: 'Jan', received: data ? Math.round(data.totalContractValue * 0.08) : 12000, due: 4500 },
    { month: 'Fev', received: data ? Math.round(data.totalContractValue * 0.09) : 13500, due: 3800 },
    { month: 'Mar', received: data ? Math.round(data.totalContractValue * 0.1) : 15000, due: 5200 },
    { month: 'Abr', received: data ? Math.round(data.totalContractValue * 0.095) : 14200, due: 4000 },
    { month: 'Mai', received: data ? Math.round(data.totalContractValue * 0.11) : 15800, due: 6200 },
  ];

  const documentStatus = [
    { name: 'Pendentes', value: 22 },
    { name: 'Aprovados', value: 58 },
    { name: 'Em revisão', value: 14 },
  ];

  if (loading) return <p>Carregando dashboard...</p>;
  if (error) return <p className="text-red-500">{error}</p>;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-4">
        {stats.map((item) => (
          <div key={item.label} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
            <p className="text-sm text-slate-500">{item.label}</p>
            <p className="mt-4 text-3xl font-semibold text-[#1c3b45]">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="col-span-2 rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#1c3b45]">Recebimentos por mês</h2>
              <p className="text-sm text-slate-500">Visão financeira dos últimos meses</p>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={financeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value: number) => `R$ ${value.toLocaleString('pt-BR')}`} />
                <Line type="monotone" dataKey="received" stroke="#2a8a7f" strokeWidth={3} dot />
                <Line type="monotone" dataKey="due" stroke="#f59e0b" strokeWidth={3} dot />
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
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={documentStatus} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} fill="#8884d8">
                  {documentStatus.map((entry, index) => (
                    <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => `${value} documentos`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
          <h3 className="text-base font-semibold text-[#1c3b45]">Pendências</h3>
          <ul className="mt-5 space-y-4 text-sm text-slate-600">
            <li>Documentos pendentes: 22</li>
            <li>Cadastros incompletos: 15</li>
            <li>Contratos não assinados: 12</li>
            <li>Parcelas vencidas: 8</li>
          </ul>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
          <h3 className="text-base font-semibold text-[#1c3b45]">Atividades recentes</h3>
          <ul className="mt-5 space-y-4 text-sm text-slate-600">
            <li>Novos cadastros: 3</li>
            <li>Documentos enviados: 7</li>
            <li>Contratos assinados: 2</li>
            <li>Pagamentos recebidos: 4</li>
          </ul>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
          <h3 className="text-base font-semibold text-[#1c3b45]">Resumo financeiro</h3>
          <div className="mt-5 space-y-4 text-sm text-slate-600">
            <div className="flex items-center justify-between">
              <span>Total contratado</span>
              <strong>R$ {data ? data.totalContractValue.toLocaleString('pt-BR') : '0'}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span>Valor recebido</span>
              <strong>R$ 720.000,00</strong>
            </div>
            <div className="flex items-center justify-between">
              <span>Saldo a receber</span>
              <strong>R$ 330.000,00</strong>
            </div>
            <div className="flex items-center justify-between">
              <span>Valor vencido</span>
              <strong className="text-warning-orange">R$ 45.000,00</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
