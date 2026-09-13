import { Route, Routes, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectDashboardPage } from './pages/ProjectDashboardPage';
import { LotsPage } from './pages/LotsPage';
import { LotDetailPage } from './pages/LotDetailPage';
import { BlocksPage } from './pages/BlocksPage';
import { UsersPage } from './pages/UsersPage';
import { PeoplePage } from './pages/PeoplePage';
import { DocumentsPage } from './pages/DocumentsPage';
import { ContractsPage } from './pages/ContractsPage';
import { FinancePage } from './pages/FinancePage';
import { ServicePage } from './pages/ServicePage';
import { SettingsPage } from './pages/SettingsPage';
import { DefaultLayout } from './layouts/DefaultLayout';
import { useAuth } from './contexts/AuthContext';

function App() {
  let isAuthenticated = false;
  try {
    // prefer context when available
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const ctx = useAuth();
    isAuthenticated = !!ctx.isAuthenticated;
  } catch {
    // fallback to storage when context not available yet
    isAuthenticated = !!localStorage.getItem('token') || !!sessionStorage.getItem('token');
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={isAuthenticated ? <DefaultLayout /> : <Navigate to="/login" />}>
        <Route index element={<DashboardPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:projectId" element={<ProjectDashboardPage />} />
        <Route path="lots" element={<LotsPage />} />
        <Route path="lots/:id" element={<LotDetailPage />} />
        <Route path="lotes/:id" element={<LotDetailPage />} />
        <Route path="blocks" element={<BlocksPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="people" element={<PeoplePage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="contracts" element={<ContractsPage />} />
        <Route path="finance" element={<FinancePage />} />
        <Route path="service" element={<ServicePage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to={isAuthenticated ? '/' : '/login'} />} />
    </Routes>
  );
}

export default App;
