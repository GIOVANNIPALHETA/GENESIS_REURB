import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import 'leaflet/dist/leaflet.css';
import { AuthProvider } from './contexts/AuthContext';

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: any }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('RootErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, fontFamily: 'sans-serif', color: '#1e293b', background: '#fff', minHeight: '100vh' }}>
          <h2 style={{ color: '#dc2626', fontSize: 18, fontWeight: 'bold' }}>
            Erro ao carregar o aplicativo
          </h2>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            Ocorreu uma falha ao renderizar a tela:
          </p>
          <pre style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: 12, borderRadius: 8, fontSize: 12, overflowX: 'auto', marginTop: 12, color: '#b91c1c' }}>
            {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 16, padding: '10px 18px', background: '#0f5964', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 'bold', fontSize: 14, cursor: 'pointer' }}
          >
            Tentar Recarregar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </RootErrorBoundary>
  </React.StrictMode>,
);
