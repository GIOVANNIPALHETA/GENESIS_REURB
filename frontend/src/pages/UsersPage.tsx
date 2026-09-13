import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Edit3, Plus, Trash2, X } from 'lucide-react';

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  createdAt: string;
};

type UserForm = {
  name: string;
  email: string;
  password?: string;
  role: string;
  active: boolean;
};

const emptyForm: UserForm = {
  name: '',
  email: '',
  password: '',
  role: 'ATENDENTE',
  active: true,
};

const rolesMap: Record<string, string> = {
  ADMIN: 'Administrador',
  GESTOR: 'Gestor',
  ATENDENTE: 'Atendente',
  FINANCEIRO: 'Financeiro',
  DOCUMENTAL: 'Documental',
  JURIDICO: 'Jurídico',
  CONSULTA: 'Consulta',
};

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [editing, setEditing] = useState<User | null>(null);
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  async function loadUsers() {
    try {
      const response = await axios.get('/api/users');
      setUsers(response.data.data || []);
      setError(null);
    } catch {
      setError('Não foi possível carregar os usuários.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setVisible(true);
    setError(null);
  }

  function openEdit(user: User) {
    setEditing(user);
    setForm({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
      active: user.active,
    });
    setVisible(true);
    setError(null);
  }

  function change(event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value, type } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? (event.target as HTMLInputElement).checked : value,
    }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, any> = {
        name: form.name,
        email: form.email,
        role: form.role,
        active: form.active,
      };
      if (form.password && form.password.trim().length > 0) {
        payload.password = form.password;
      }

      if (editing) {
        await axios.put(`/api/users/${editing.id}`, payload);
      } else {
        if (!form.password) {
          setError('A senha é obrigatória para novos usuários.');
          setSaving(false);
          return;
        }
        await axios.post('/api/users', payload);
      }
      setVisible(false);
      await loadUsers();
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Não foi possível salvar o usuário.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(user: User) {
    if (!window.confirm(`Excluir o usuário ${user.name}?`)) return;
    try {
      await axios.delete(`/api/users/${user.id}`);
      await loadUsers();
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Não foi possível excluir o usuário.');
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#0f8b8d]">Controle de acesso</p>
          <h1 className="text-2xl font-semibold text-[#1c3b45]">Usuários</h1>
          <p className="mt-1 text-sm text-slate-500">Gerencie acessos, perfis e status dos usuários do sistema.</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-[#1c3b45] px-4 py-2 text-white hover:bg-[#142a32] transition"
        >
          <Plus size={17} /> Novo usuário
        </button>
      </header>

      {visible && (
        <form onSubmit={submit} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-soft md:grid-cols-2">
          <div className="flex items-center justify-between md:col-span-2">
            <h2 className="font-semibold text-[#17343b]">{editing ? 'Editar Usuário' : 'Novo Usuário'}</h2>
            <button type="button" title="Fechar" onClick={() => setVisible(false)} className="text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>

          <label className="text-sm font-medium text-slate-700">
            Nome Completo
            <input
              required
              name="name"
              value={form.name}
              onChange={change}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-[#0f8b8d] focus:outline-none"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            E-mail
            <input
              required
              type="email"
              name="email"
              value={form.email}
              onChange={change}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-[#0f8b8d] focus:outline-none"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            {editing ? 'Nova Senha (deixe em branco para manter a atual)' : 'Senha (mínimo 6 caracteres)'}
            <input
              type="password"
              name="password"
              required={!editing}
              minLength={6}
              value={form.password}
              onChange={change}
              placeholder={editing ? '••••••••' : ''}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-[#0f8b8d] focus:outline-none"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Perfil de Acesso
            <select
              name="role"
              value={form.role}
              onChange={change}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-[#0f8b8d] focus:outline-none"
            >
              {Object.entries(rolesMap).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-2 md:col-span-2">
            <input
              type="checkbox"
              id="activeCheckbox"
              name="active"
              checked={form.active}
              onChange={change}
              className="h-4 w-4 rounded border-slate-300 text-[#0f8b8d]"
            />
            <label htmlFor="activeCheckbox" className="text-sm text-slate-700">
              Usuário Ativo
            </label>
          </div>

          <div className="flex gap-3 md:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#1c3b45] px-4 py-2 text-white hover:bg-[#142a32] transition disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button
              type="button"
              onClick={() => setVisible(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50 transition"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <section className="overflow-x-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        {loading ? (
          <p className="text-slate-500">Carregando usuários...</p>
        ) : users.length === 0 ? (
          <p className="text-slate-500">Nenhum usuário cadastrado.</p>
        ) : (
          <table className="w-full min-w-[720px] border-collapse text-left text-sm text-slate-700">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 font-semibold">Nome</th>
                <th className="px-4 py-3 font-semibold">E-mail</th>
                <th className="px-4 py-3 font-semibold">Função</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Criado em</th>
                <th className="px-4 py-3 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-4 font-medium text-slate-900">{user.name}</td>
                  <td className="px-4 py-4">{user.email}</td>
                  <td className="px-4 py-4">
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-800">
                      {rolesMap[user.role] || user.role}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        user.active ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {user.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-4">{new Date(user.createdAt).toLocaleDateString('pt-BR')}</td>
                  <td className="px-4 py-4">
                    <div className="flex gap-2">
                      <button
                        title="Editar"
                        onClick={() => openEdit(user)}
                        className="rounded-lg border border-slate-200 p-2 text-[#1c3b45] hover:bg-slate-50 transition"
                      >
                        <Edit3 size={16} />
                      </button>
                      <button
                        title="Excluir"
                        onClick={() => void remove(user)}
                        className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50 transition"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
