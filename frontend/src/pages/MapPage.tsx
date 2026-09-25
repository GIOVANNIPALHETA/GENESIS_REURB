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
  ChevronRight
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
    <div className="space-y-2">
      {/* Compact Page Header with Project Selector & Quick Metrics */}
      <div className="bg-white py-2 px-3 sm:px-4 rounded-xl border border-slate-200/90 shadow-2xs flex flex-wrap items-center justify-between gap-2.5">
        {/* Title and Active Status */}
        <div className="flex items-center gap-2.5">
          <span className="p-1.5 rounded-lg bg-teal-50 text-[#0f5964]">
            <MapPin className="w-4 h-4" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
                Mapa 2D dos Projetos
              </h1>
              {mapData?.hasMap && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3" /> Planta Ativa
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 hidden sm:block">
              Visualização vetorial interativa integrada aos contratos e financeiro
            </p>
          </div>
        </div>

        {/* Quick Compact KPI pills */}
        {mapData?.hasMap && mapData.stats && (
          <div className="flex items-center flex-wrap gap-1.5 text-xs">
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-700" title="Total de lotes e vinculados ao cadastro">
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <span className="font-semibold text-slate-900">{mapData.stats.contractual.total}</span>
              <span className="text-[10px] text-slate-500">lotes</span>
              <span className="text-[10px] text-teal-700 font-medium">({mapData.linkedLotsCount} vinc.)</span>
            </div>

            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-teal-50/70 border border-teal-200/80 text-teal-800" title="Situação contratual dos lotes">
              <FileText className="w-3.5 h-3.5 text-teal-600" />
              <span className="font-semibold text-teal-900">{mapData.stats.contractual.signed}</span>
              <span className="text-[10px] text-teal-700">ass.</span>
              {mapData.stats.contractual.notSigned > 0 && (
                <span className="text-[10px] text-slate-500">({mapData.stats.contractual.notSigned} pend.)</span>
              )}
            </div>

            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50/70 border border-emerald-200/80 text-emerald-800" title="Situação de adimplência financeira">
              <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
              <span className="font-semibold text-emerald-900">
                {mapData.stats.financial.paid + mapData.stats.financial.upToDate}
              </span>
              <span className="text-[10px] text-emerald-700">em dia</span>
              {mapData.stats.financial.overdue > 0 && (
                <span className="text-[10px] text-red-600 font-bold">({mapData.stats.financial.overdue} atraso)</span>
              )}
            </div>

            <div className="hidden xl:flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 text-[11px]" title="Ortofoto aérea de drone">
              <ImageIcon className="w-3.5 h-3.5 text-[#0f5964]" />
              <span>Drone: </span>
              <span className="font-semibold text-slate-800">{mapData.hasAerialImage ? '1:1 Ativo' : 'Neutro'}</span>
            </div>
          </div>
        )}

        {/* Project Selector dropdown & Refresh */}
        <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
          <div className="relative min-w-[170px] sm:min-w-[210px]">
            <select
              value={selectedProjectId}
              onChange={(e) => handleProjectSelect(e.target.value)}
              disabled={loadingProjects}
              className="w-full text-xs py-1.5 px-2.5 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-lg text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-[#0f5964]/20 transition cursor-pointer"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.hasMap ? '✓ (Planta)' : ''}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={loadMapData}
            disabled={loadingMap}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition cursor-pointer"
            title="Recarregar dados do mapa"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingMap ? 'animate-spin text-[#0f5964]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Content Area - Maximized Map Height */}
      {loadingMap ? (
        <div className="h-[calc(100vh-100px)] min-h-[580px] flex flex-col items-center justify-center bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2">
          <RefreshCw className="w-7 h-7 text-[#0f5964] animate-spin" />
          <p className="text-xs font-semibold text-slate-600">Carregando planta e ortofoto...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
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

