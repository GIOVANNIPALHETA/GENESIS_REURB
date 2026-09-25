import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useMemo, useState, useRef } from 'react';
import {
  LogOut,
  LayoutDashboard,
  Layers,
  Users,
  CreditCard,
  FileText,
  Folder,
  BarChart3,
  Activity,
  Settings,
  ShieldCheck,
  Menu,
  X,
  Plus,
  MapPin,
  Map,
  Camera,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { AIAssistantModal } from '../components/AIAssistantModal';

type NavItem = {
  id: string;
  label: string;
  path: string;
  icon: any;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'OPERAÇÃO',
    items: [
      { id: 'dashboard', label: 'Painel principal', path: '/', icon: LayoutDashboard },
      { id: 'map', label: 'Mapa Interativo 2D', path: '/map', icon: Map },
      { id: 'projects', label: 'Projetos', path: '/projects', icon: Layers },
      { id: 'people', label: 'Pessoas', path: '/people', icon: Users },
      { id: 'lots', label: 'Quadras e lotes', path: '/lots', icon: MapPin },
      { id: 'blocks', label: 'Quadras', path: '/blocks', icon: Layers },
    ],
  },
  {
    title: 'GESTÃO',
    items: [
      { id: 'finance', label: 'Financeiro', path: '/finance', icon: CreditCard },
      { id: 'contracts', label: 'Contratos', path: '/contracts', icon: FileText },
      { id: 'documents', label: 'Documentos', path: '/documents', icon: Folder },
      { id: 'scanner', label: 'Scanner Mobile', path: '/scanner', icon: Camera },
      { id: 'reports', label: 'Relatórios', path: '/reports', icon: BarChart3 },
      { id: 'service', label: 'Atendimentos', path: '/service', icon: Activity },
    ],
  },
];

function UserDropdown({
  user,
  userInitials,
  onLogout,
}: {
  user: any;
  userInitials: string;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Abrir menu do usuário e sistema"
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-700 shadow-xs hover:border-[#0f5964] hover:text-[#0f5964] hover:bg-slate-50 transition focus:outline-none focus:ring-2 focus:ring-[#0f5964]/20 cursor-pointer"
        title={user?.name || 'Usuário'}
      >
        {userInitials}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-lg border border-slate-200 bg-white py-1.5 shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100">
          {/* Informações do Usuário */}
          <div className="px-4 py-2.5 border-b border-slate-100">
            <p className="text-xs font-bold text-slate-900 truncate">
              {user?.name || 'Administrador'}
            </p>
            <p className="text-[11px] text-slate-400 truncate mt-0.5">
              {user?.email || 'admin@genesisreurb.com.br'}
            </p>
          </div>

          {/* Grupo SISTEMA */}
          <div className="py-1">
            <div className="px-4 py-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
              SISTEMA
            </div>
            <NavLink
              to="/users"
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2 text-xs transition ${
                  isActive
                    ? 'bg-[#edf7f7] text-[#0f5964] font-semibold'
                    : 'text-slate-700 hover:bg-slate-50'
                }`
              }
            >
              <ShieldCheck size={16} className="text-[#0f5964]" />
              <span>Usuários</span>
            </NavLink>
            <NavLink
              to="/settings"
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2 text-xs transition ${
                  isActive
                    ? 'bg-[#edf7f7] text-[#0f5964] font-semibold'
                    : 'text-slate-700 hover:bg-slate-50'
                }`
              }
            >
              <Settings size={16} className="text-[#0f5964]" />
              <span>Configurações</span>
            </NavLink>
          </div>

          {/* Sair do Sistema */}
          <div className="border-t border-slate-100 pt-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="w-full flex items-center gap-3 px-4 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 transition text-left"
            >
              <LogOut size={16} />
              <span>Sair do sistema</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function DefaultLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAIAssistantOpen, setIsAIAssistantOpen] = useState(false);

  // Estado de recolhimento da barra lateral desktop (persistido no localStorage)
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    const saved = localStorage.getItem('genesis_sidebar_collapsed');
    if (saved !== null) {
      return saved === 'true';
    }
    // No mapa interativo, inicia recolhido para liberar a área total da planta
    return window.location.pathname.startsWith('/map');
  });

  const [isHovered, setIsHovered] = useState(false);

  // A barra fica expandida visualmente se NÃO estiver colapsada (fixada) OU se o cursor estiver sobre ela
  const isExpanded = !isCollapsed || isHovered;

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('genesis_sidebar_collapsed', String(next));
      return next;
    });
  };

  // Dispara redimensionamento após animação da barra lateral para o Leaflet ajustar a tela
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 320);
    return () => clearTimeout(timer);
  }, [isCollapsed]);

  // Iniciais do usuário para o avatar
  const userInitials = useMemo(() => {
    if (!user?.name) return 'GV';
    const parts = user.name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }, [user]);

  // Breadcrumb contextual da rota atual
  const breadcrumb = useMemo(() => {
    const p = location.pathname;
    if (p.startsWith('/lots') || p.startsWith('/lotes')) return 'Operação / Quadras e lotes';
    if (p.startsWith('/projects')) return 'Operação / Projetos';
    if (p.startsWith('/people')) return 'Operação / Pessoas';
    if (p.startsWith('/blocks')) return 'Operação / Quadras';
    if (p.startsWith('/finance')) return 'Gestão / Financeiro';
    if (p.startsWith('/contracts')) return 'Gestão / Contratos';
    if (p.startsWith('/documents')) return 'Gestão / Documentos';
    if (p.startsWith('/scanner')) return 'Gestão / Scanner Mobile';
    if (p.startsWith('/reports')) return 'Gestão / Relatórios';
    if (p.startsWith('/service')) return 'Gestão / Atendimentos';
    if (p.startsWith('/settings')) return 'Sistema / Configurações';
    if (p.startsWith('/users')) return 'Sistema / Usuários';
    return 'Operação / Painel principal';
  }, [location.pathname]);

  // Bloqueia rolagem da página quando o menu móvel está aberto
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  // Suporte a fechar menu móvel com ESC
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  function handleLogout() {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    navigate('/login');
  }

  const renderNavGroup = (group: NavGroup, isNavExpanded: boolean, onNavigate?: () => void) => (
    <div key={group.title} className={isNavExpanded ? 'mb-4' : 'mb-2'}>
      {isNavExpanded ? (
        <div className="px-3 pb-1.5 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
          {group.title}
        </div>
      ) : (
        <div className="my-1.5 border-t border-slate-100 mx-1.5" />
      )}
      <div className="space-y-0.5">
        {group.items.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path);

          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => {
                if (onNavigate) onNavigate();
              }}
              title={!isNavExpanded ? item.label : undefined}
              className={`flex items-center rounded-lg transition-colors ${
                isNavExpanded
                  ? 'gap-3 px-3 py-2 text-sm'
                  : 'justify-center w-10 h-10 mx-auto'
              } ${
                isActive
                  ? 'bg-[#edf7f7] text-[#0f5964] font-semibold shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-normal'
              }`}
            >
              <Icon
                size={isNavExpanded ? 18 : 20}
                className={`shrink-0 ${isActive ? 'text-[#0f5964]' : 'text-slate-400'}`}
              />
              {isNavExpanded && <span className="truncate">{item.label}</span>}
            </NavLink>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 flex flex-col antialiased">
      {/* CABEÇALHO SUPERIOR PARA MOBILE (< lg) */}
      <header className="lg:hidden sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-xs">
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Abrir menu de navegação"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
        >
          <Menu size={22} />
        </button>

        <div className="flex items-center">
          <img
            src="/genesis-logo.png"
            alt="Gênesis Engenharia e Consultoria"
            className="h-8 w-auto max-w-[170px] object-contain"
          />
        </div>

        <UserDropdown
          user={user}
          userInitials={userInitials}
          onLogout={handleLogout}
        />
      </header>

      {/* MENU DRAWER MOBILE (FUNDO OPACO + FECHAMENTO) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer Content */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu principal"
            className="fixed inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white p-4 shadow-xl z-50"
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <img
                src="/genesis-logo.png"
                alt="Gênesis Engenharia"
                className="h-8 w-auto object-contain"
              />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Fechar menu"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <X size={20} />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto pr-1">
              {NAV_GROUPS.map((grp) => renderNavGroup(grp, true, () => setMobileMenuOpen(false)))}
            </nav>

            <div className="pt-3 border-t border-slate-100 space-y-1">
              <div className="px-3 pb-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                SISTEMA
              </div>
              <NavLink
                to="/users"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition"
              >
                <ShieldCheck size={18} className="text-slate-400" />
                <span>Usuários</span>
              </NavLink>
              <NavLink
                to="/settings"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition"
              >
                <Settings size={18} className="text-slate-400" />
                <span>Configurações</span>
              </NavLink>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleLogout();
                }}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 rounded-lg transition mt-2 cursor-pointer"
              >
                <LogOut size={18} />
                <span>Sair do sistema</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ESTRUTURA PRINCIPAL DESKTOP + CONTEÚDO */}
      <div className="flex min-h-screen flex-1">
        {/* ESPAÇADOR DESKTOP (RESERVA O ESPAÇO PARA O CONTEÚDO NÃO SOFRER REFLOW/PULO) */}
        <div
          className={`hidden lg:block shrink-0 transition-all duration-300 ease-in-out ${
            isCollapsed ? 'w-16' : 'w-64'
          }`}
          aria-hidden="true"
        />

        {/* BARRA LATERAL DESKTOP RETRÁTIL (ESTILO SISTEMA ESO: TRILHO W-16 EXPANSÍVEL NO HOVER OU FIXAÇÃO) */}
        <aside
          onMouseEnter={() => {
            if (isCollapsed) setIsHovered(true);
          }}
          onMouseLeave={() => {
            if (isCollapsed) setIsHovered(false);
          }}
          className={`hidden lg:flex flex-col justify-between border-r border-slate-200 bg-white fixed top-0 left-0 h-screen z-40 transition-all duration-300 ease-in-out select-none overflow-x-hidden ${
            isExpanded ? 'w-64 shadow-2xl' : 'w-16 shadow-none'
          }`}
        >
          <div className="flex flex-col flex-1 min-h-0">
            {/* CABEÇALHO DO MENU / LOGO + BOTÃO FIXAR/RECOLHER */}
            <div
              className={`flex items-center border-b border-slate-100 transition-all duration-300 ${
                isExpanded ? 'justify-between px-4 py-3 h-14' : 'justify-center py-3 h-14'
              }`}
            >
              {isExpanded ? (
                <>
                  <div className="flex items-center gap-2 overflow-hidden">
                    <img
                      src="/genesis-logo.png"
                      alt="Gênesis Engenharia e Consultoria"
                      className="h-8 w-auto object-contain max-w-[160px]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={toggleCollapse}
                    title={isCollapsed ? 'Fixar menu lateral aberto' : 'Recolher menu lateral'}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-[#0f5964] hover:bg-[#edf7f7] transition cursor-pointer"
                  >
                    <ChevronLeft size={18} />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={toggleCollapse}
                  title="Expandir e fixar menu lateral"
                  className="flex items-center justify-center p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer group"
                >
                  <img
                    src="/favicon.svg"
                    alt="Gênesis REURB"
                    className="h-7 w-7 object-contain transition-transform group-hover:scale-110"
                  />
                </button>
              )}
            </div>

            {/* ITENS DE MENU AGRUPADOS */}
            <nav className="flex-1 overflow-y-auto overflow-x-hidden p-2 pt-3 space-y-1">
              {NAV_GROUPS.map((grp) => renderNavGroup(grp, isExpanded))}
            </nav>
          </div>

          {/* RODAPÉ DO MENU / USUÁRIO E LOGOUT */}
          {isExpanded ? (
            <div className="p-3 border-t border-slate-100 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-700 shadow-xs">
                    {userInitials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">
                      {user?.name || 'Administrador'}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">{user?.email || 'genesis'}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  title="Sair do sistema"
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                >
                  <LogOut size={16} />
                </button>
              </div>
            </div>
          ) : (
            <div className="p-2 border-t border-slate-100 bg-slate-50/50 flex flex-col items-center gap-1.5">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-700 shadow-xs hover:border-[#0f5964] transition cursor-pointer"
                title={`${user?.name || 'Usuário'} (${user?.email || ''})`}
              >
                {userInitials}
              </div>
              <button
                type="button"
                onClick={handleLogout}
                title="Sair do sistema"
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
              >
                <LogOut size={16} />
              </button>
            </div>
          )}
        </aside>

        {/* ÁREA DE CONTEÚDO */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* BARRA DE NAVEGAÇÃO DE TOPO DESKTOP (BREADCRUMB + PERFIL) */}
          <header className="hidden lg:flex h-14 items-center justify-between border-b border-slate-200/80 bg-white px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={toggleCollapse}
                aria-label={isCollapsed ? 'Expandir e fixar menu lateral' : 'Recolher menu lateral'}
                title={isCollapsed ? 'Expandir e fixar menu lateral' : 'Recolher menu lateral'}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer"
              >
                <Menu size={18} />
              </button>

              <div className="text-xs font-medium text-slate-500 flex items-center gap-2">
                {breadcrumb}
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setIsAIAssistantOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-teal-200 bg-teal-50/80 hover:bg-teal-100 text-[#0f5964] text-xs font-bold shadow-2xs transition cursor-pointer"
                title="Abrir Assistente Gênesis IA (Google Gemini)"
              >
                <Sparkles size={14} className="text-[#0f5964] animate-pulse" />
                <span>Gênesis IA</span>
              </button>

              <UserDropdown
                user={user}
                userInitials={userInitials}
                onLogout={handleLogout}
              />
            </div>
          </header>

          {/* CONTEÚDO DA PÁGINA */}
          <main
            className={`flex-1 w-full ${
              location.pathname.startsWith('/map')
                ? 'p-2 sm:p-2.5 max-w-none flex flex-col min-w-0'
                : 'p-3 sm:p-4 lg:px-6 lg:py-4 max-w-[1600px] mx-auto'
            }`}
          >
            <Outlet />
          </main>
        </div>
      </div>

      {/* BOTÃO FLUTUANTE DO ASSISTENTE IA (CANTO INFERIOR DIREITO) */}
      {!isAIAssistantOpen && (
        <button
          type="button"
          onClick={() => setIsAIAssistantOpen(true)}
          className="fixed bottom-5 right-5 z-40 bg-gradient-to-r from-[#0f5964] via-[#136b78] to-[#0f5964] hover:from-[#0c4750] hover:to-[#0f5964] text-white px-4 py-3 rounded-full shadow-2xl hover:scale-105 transition-all duration-200 flex items-center gap-2 group cursor-pointer border border-teal-300/40"
          title="Abrir Assistente Gênesis IA (Google Gemini)"
        >
          <Sparkles size={18} className="text-teal-200 group-hover:rotate-12 transition-transform duration-300" />
          <span className="text-xs font-bold tracking-wide">Gênesis IA</span>
        </button>
      )}

      {/* MODAL / CHAT DO ASSISTENTE GEMINI */}
      <AIAssistantModal
        isOpen={isAIAssistantOpen}
        onClose={() => setIsAIAssistantOpen(false)}
      />
    </div>
  );
}

