export const menuItems = [
  { id: 'dashboard', label: 'Painel Principal', path: '/', icon: 'home' },
  { id: 'map', label: 'Mapa Interativo', path: '/map', icon: 'map' },
  { id: 'projects', label: 'Projetos', path: '/projects', icon: 'layers' },
  { id: 'people', label: 'Pessoas', path: '/people', icon: 'users' },
  { id: 'users', label: 'Usuários', path: '/users', icon: 'users' },
  { id: 'lots', label: 'Gestão de lotes', path: '/lots', icon: 'list' },
  { id: 'blocks', label: 'Quadras', path: '/blocks', icon: 'layers' },
  { id: 'contracts', label: 'Contratos', path: '/contracts', icon: 'file-text' },
  { id: 'finance', label: 'Financeiro', path: '/finance', icon: 'credit-card' },
  { id: 'documents', label: 'Documentos', path: '/documents', icon: 'folder' },
  { id: 'scanner', label: 'Scanner Mobile', path: '/scanner', icon: 'camera' },
  { id: 'service', label: 'Atendimentos', path: '/service', icon: 'activity' },
  { id: 'reports', label: 'Relatórios', path: '/reports', icon: 'bar-chart-3' },
] as const;

export type MenuItemId = (typeof menuItems)[number]['id'];
export const menuOrderStorageKey = 'genesis-reurb-menu-order';

export function getMenuOrder(): MenuItemId[] {
  try {
    const stored = JSON.parse(localStorage.getItem(menuOrderStorageKey) || 'null');
    if (!Array.isArray(stored)) return menuItems.map((item) => item.id);
    const validStored = stored.filter((id): id is MenuItemId => menuItems.some((item) => item.id === id));
    return [...validStored, ...menuItems.map((item) => item.id).filter((id) => !validStored.includes(id))];
  } catch {
    return menuItems.map((item) => item.id);
  }
}
