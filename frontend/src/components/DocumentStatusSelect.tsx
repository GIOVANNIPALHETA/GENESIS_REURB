import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

const statuses: Record<string, string> = { PENDING: 'Pendente', UNDER_REVIEW: 'Em análise', APPROVED: 'Aprovado', REJECTED: 'Rejeitado', NOT_APPLICABLE: 'Não aplicável', EXPIRED: 'Vencido', ILLEGIBLE: 'Ilegível' };
export function DocumentStatusSelect({ document, onUpdated }: { document: { id: string; status?: string }; onUpdated: () => void | Promise<void> }) {
  const { user } = useAuth();
  const [status, setStatus] = useState(document.status || 'PENDING');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setStatus(document.status || 'PENDING'), [document.id, document.status]);
  if (!user || !['ADMIN', 'GESTOR', 'DOCUMENTAL', 'JURIDICO'].includes(user.role)) return <span>{statuses[status] || status}</span>;
  async function changeStatus(value: string) {
    setSaving(true);
    setError('');
    try {
      await axios.patch(`/api/documents/${encodeURIComponent(document.id)}/status`, { status: value });
      setStatus(value);
      await onUpdated();
    } catch { setError('Não foi possível atualizar a situação. Tente novamente.'); }
    finally { setSaving(false); }
  }
  return <div><select aria-label="Situação do documento" value={status} disabled={saving} onChange={event => changeStatus(event.target.value)} className="max-w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800">{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{error && <span role="alert" className="block text-xs text-red-600">{error}</span>}</div>;
}
