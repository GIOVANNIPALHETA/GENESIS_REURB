import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  MapPin,
  Layers,
  FileText,
  DollarSign,
  AlertCircle,
  RefreshCw,
  Image as ImageIcon,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  BarChart2
} from 'lucide-react';
import { ProjectMap } from '../components/ProjectMap';

interface ProjectOption {
  id: string;
  name: string;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  status: string;
  hasMap: boolean;
  hasAerialImage: boolean;
  lotsCount: number;
  linkedLotsCount: number;
}

export function MapPage() {
  const { projectId: routeProjectId } = useParams<{ projectId?: string }>();
  const navigate = useNavigate();

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [mapData, setMapData] = useState<any>(null);
  const [loadingProjects, setLoadingProjects] = useState<boolean>(true);
  const [loadingMap, setLoadingMap] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetailedKpis, setShowDetailedKpis] = useState<boolean>(false);

  // Fetch all projects with map availability
  useEffect(() => {
    async function loadProjects() {
      try {
        setLoadingProjects(true);
        const res = await axios.get('/api/map/projects');
        const list: ProjectOption[] = res.data.data || [];
        setProjects(list);

        // Pick initial project
        if (routeProjectId && list.some((p) => p.id === routeProjectId)) {
          setSelectedProjectId(routeProjectId);
        } else {
          // Prefer project with map, or Vila Nova
          const defaultProject =
            list.find((p) => p.id === 'project-vila-nova-aripuana') ||
            list.find((p) => p.hasMap) ||
            list[0];
          if (defaultProject) {
            setSelectedProjectId(defaultProject.id);
          }
        }
      } catch (err) {
        setError('Falha ao carregar lista de projetos.');
      } finally {
        setLoadingProjects(false);
      }
    }
    loadProjects();
  }, [routeProjectId]);

  // Load map data when selected project changes
  const loadMapData = useCallback(async () => {
    if (!selectedProjectId) return;
    try {
      setLoadingMap(true);
      setError(null);
      const res = await axios.get(`/api/map/${selectedProjectId}`);
      setMapData(res.data.data);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Falha ao carregar dados do mapa.');
    } finally {
      setLoadingMap(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    loadMapData();
  }, [loadMapData]);

  const handleProjectSelect = (id: string) => {
    setSelectedProjectId(id);
    navigate(`/map/${id}`, { replace: true });
  };

  const currentProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <div className="space-y-3">
      {/* Page Header with Project Selector & Quick Metrics */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="p-2 rounded-xl bg-teal-50 text-[#0f5964]">
            <MapPin className="w-5 h-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-slate-900">
                Mapa 2D dos Projetos
              </h1>
              {mapData?.hasMap && (
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3" /> Planta Ativa
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Visualização vetorial interativa integrada aos contratos e financeiro
            </p>
          </div>
        </div>

        {/* Quick KPI pills & Project Selector */}
        <div className="flex items-center flex-wrap gap-2">
          {mapData?.hasMap && mapData.stats && (
            <div className="hidden lg:flex items-center gap-2 border-r border-slate-200 pr-3 mr-1 text-xs">
              <div className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-400 font-medium">Lotes: </span>
                <span className="font-bold text-slate-800">{mapData.stats.contractual.total}</span>
                <span className="text-slate-400 text-[11px]"> ({mapData.linkedLotsCount} vinc.)</span>
              </div>
              <div className="px-2.5 py-1 rounded-lg bg-teal-50/70 border border-teal-200/80">
                <span className="text-teal-600 font-medium">Contratos: </span>
                <span className="font-bold text-teal-800">{mapData.stats.contractual.signed} assinados</span>
              </div>
              <div className="px-2.5 py-1 rounded-lg bg-emerald-50/70 border border-emerald-200/80">
                <span className="text-emerald-600 font-medium">Financeiro: </span>
                <span className="font-bold text-emerald-800">{mapData.stats.financial.paid + mapData.stats.financial.upToDate} em dia</span>
              </div>
              <button
                type="button"
                onClick={() => setShowDetailedKpis(!showDetailedKpis)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                title={showDetailedKpis ? 'Ocultar cards de métricas' : 'Exibir cards de métricas'}
              >
                {showDetailedKpis ? <ChevronUp className="w-4 h-4" /> : <BarChart2 className="w-4 h-4" />}
              </button>
            </div>
          )}

          {/* Project Selector dropdown */}
          <div className="relative min-w-[200px] sm:min-w-[240px]">
            <select
              value={selectedProjectId}
              onChange={(e) => handleProjectSelect(e.target.value)}
              disabled={loadingProjects}
              className="w-full text-xs sm:text-sm py-1.5 sm:py-2 px-3 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-[#0f5964]/20 transition cursor-pointer"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.hasMap ? '✓ (Planta 2D)' : ''}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={loadMapData}
            disabled={loadingMap}
            className="p-1.5 sm:p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition cursor-pointer"
            title="Recarregar dados do mapa"
          >
            <RefreshCw className={`w-4 h-4 ${loadingMap ? 'animate-spin text-[#0f5964]' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Cards (Collapsible) */}
      {showDetailedKpis && mapData?.hasMap && mapData.stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 animate-in fade-in duration-200">
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Lotes na Planta</span>
              <Layers className="w-4 h-4 text-slate-400" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {mapData.stats.contractual.total}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {mapData.linkedLotsCount} vinculados ao sistema
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Contratos Assinados</span>
              <FileText className="w-4 h-4 text-teal-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-teal-700">
              {mapData.stats.contractual.signed}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {mapData.stats.contractual.notSigned} pendentes de assinatura
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Quitados / Em Dia</span>
              <DollarSign className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-emerald-700">
              {mapData.stats.financial.paid + mapData.stats.financial.upToDate}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {mapData.stats.financial.overdue} lotes em atraso
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Ortofoto de Drone</span>
              <ImageIcon className="w-4 h-4 text-[#0f5964]" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {mapData.hasAerialImage ? 'Disponível' : 'Ausente'}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {mapData.hasAerialImage ? 'Alinhamento 1:1 milimétrico' : 'Exibindo fundo neutro'}
            </p>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {loadingMap ? (
        <div className="h-[calc(100vh-140px)] min-h-[620px] flex flex-col items-center justify-center bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <RefreshCw className="w-8 h-8 text-[#0f5964] animate-spin" />
          <p className="text-sm font-medium text-slate-600">Carregando planta e ortofoto...</p>
        </div>
      ) : error ? (
        <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <span>{error}</span>
        </div>
      ) : mapData?.hasMap ? (
        <ProjectMap
          mapData={mapData}
          projectId={selectedProjectId}
          onRefreshData={loadMapData}
        />
      ) : (
        /* Empty state when project doesn't have interactive map yet */
        <div className="p-8 sm:p-12 bg-white rounded-2xl border border-slate-200 shadow-xs text-center max-w-2xl mx-auto space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <MapPin className="w-7 h-7" />
          </div>

          <div>
            <h3 className="text-lg font-bold text-slate-900">
              Planta interativa ainda não configurada
            </h3>
            <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
              O projeto <span className="font-semibold text-slate-800">{currentProject?.name}</span> ainda não possui arquivo vetorial (GeoJSON) ou ortofoto aérea configurados em <code className="text-xs bg-slate-100 px-1 py-0.5 rounded font-mono">uploads/mapasinterativos/</code>.
            </p>
          </div>

          <div className="pt-2 flex justify-center gap-3">
            {projects.some((p) => p.id === 'project-vila-nova-aripuana') && (
              <button
                type="button"
                onClick={() => handleProjectSelect('project-vila-nova-aripuana')}
                className="py-2.5 px-4 rounded-xl bg-[#0f5964] hover:bg-[#0c4750] text-white text-sm font-semibold flex items-center gap-2 shadow-sm transition cursor-pointer"
              >
                Abrir Vila Nova Aripuanã (Planta Ativa)
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

