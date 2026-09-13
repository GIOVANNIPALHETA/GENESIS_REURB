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
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

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

  const renderNavGroup = (group: NavGroup, onNavigate?: () => void) => (
    <div key={group.title} className="mb-5">
      <div className="px-3 pb-2 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
        {group.title}
      </div>
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
              className={`flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors ${
                isActive
                  ? 'bg-[#edf7f7] text-[#0f5964] font-semibold shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-normal'
              }`}
            >
              <Icon
                size={18}
                className={`shrink-0 ${isActive ? 'text-[#0f5964]' : 'text-slate-400'}`}
              />
              <span className="truncate">{item.label}</span>
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
              {NAV_GROUPS.map((grp) => renderNavGroup(grp, () => setMobileMenuOpen(false)))}
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
                className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 rounded-lg transition mt-2"
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
        {/* BARRA LATERAL FIXA NO DESKTOP (LARGURA RESERVADA, SEM COBRIR CONTEÚDO) */}
        <aside className="hidden lg:flex w-64 shrink-0 flex-col justify-between border-r border-slate-200 bg-white sticky top-0 h-screen overflow-y-auto">
          <div>
            {/* LOGO INSTITUCIONAL OFICIAL */}
            <div className="p-5 border-b border-slate-100">
              <img
                src="/genesis-logo.png"
                alt="Gênesis Engenharia e Consultoria"
                className="h-10 w-auto object-contain"
              />
            </div>

            {/* ITENS DE MENU AGRUPADOS */}
            <nav className="p-3.5 pt-4">
              {NAV_GROUPS.map((grp) => renderNavGroup(grp))}
            </nav>
          </div>

          {/* RODAPÉ DO MENU / USUÁRIO E LOGOUT */}
          <div className="p-3.5 border-t border-slate-100 bg-slate-50/50">
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
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </aside>

        {/* ÁREA DE CONTEÚDO */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* BARRA DE NAVEGAÇÃO DE TOPO DESKTOP (BREADCRUMB + PERFIL) */}
          <header className="hidden lg:flex h-14 items-center justify-between border-b border-slate-200/80 bg-white px-8">
            <div className="text-xs font-medium text-slate-500 flex items-center gap-2">
              {breadcrumb}
            </div>

            <div className="flex items-center gap-3">
              <UserDropdown
                user={user}
                userInitials={userInitials}
                onLogout={handleLogout}
              />
            </div>
          </header>

          {/* CONTEÚDO DA PÁGINA */}
          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

