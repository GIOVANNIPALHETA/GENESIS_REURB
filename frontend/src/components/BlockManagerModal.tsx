import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  X,
  Plus,
  Edit3,
  Trash2,
  Building,
  Check,
  AlertCircle,
  RefreshCw,
  Search,
  Layers
} from 'lucide-react';

interface Block {
  id: string;
  number: string;
  description?: string | null;
  active: boolean;
  projectId: string;
  _count?: {
    lots: number;
  };
}

interface BlockManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName?: string;
  onSuccess?: () => void;
}

export function BlockManagerModal({
  isOpen,
  onClose,
  projectId,
  projectName,
  onSuccess
}: BlockManagerModalProps) {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Mode: 'list' | 'create' | 'edit' | 'bulk'
  const [activeTab, setActiveTab] = useState<'list' | 'create' | 'bulk'>('list');
  const [editingBlock, setEditingBlock] = useState<Block | null>(null);

  // Single Block Form state
  const [formData, setFormData] = useState({
    number: '',
    description: '',
    active: true
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Bulk Form state
  const [bulkData, setBulkData] = useState({
    quantity: '20',
    startNumber: '1'
  });

  const loadBlocks = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await axios.get(`/api/blocks?projectId=${projectId}`);
      const list: Block[] = res.data.data || [];
      // Sort numerically if possible
      list.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
      setBlocks(list);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Falha ao carregar as quadras.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && projectId) {
      loadBlocks();
      setActiveTab('list');
      setEditingBlock(null);
      setFormData({ number: '', description: '', active: true });
    }
  }, [isOpen, projectId]);

  const handleStartCreate = () => {
    setEditingBlock(null);
    setFormData({ number: '', description: '', active: true });
    setActiveTab('create');
    setError(null);
  };

  const handleStartEdit = (b: Block) => {
    setEditingBlock(b);
    setFormData({
      number: b.number,
      description: b.description || '',
      active: b.active
    });
    setActiveTab('create');
    setError(null);
  };

  const handleSaveSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.number.trim()) {
      setError('Informe o número ou identificador da quadra.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      if (editingBlock) {
        await axios.put(`/api/blocks/${editingBlock.id}`, {
          projectId,
          number: formData.number.trim(),
          description: formData.description,
          active: formData.active
        });
      } else {
        await axios.post('/api/blocks', {
          projectId,
          number: formData.number.trim(),
          description: formData.description,
          active: formData.active
        });
      }

      await loadBlocks();
      setActiveTab('list');
      setEditingBlock(null);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Erro ao salvar quadra.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveBulk = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseInt(bulkData.quantity, 10);
    const start = parseInt(bulkData.startNumber, 10);

    if (isNaN(qty) || qty < 1 || qty > 200) {
      setError('A quantidade deve ser entre 1 e 200.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await axios.post('/api/blocks/bulk', {
        projectId,
        quantity: qty,
        startNumber: isNaN(start) ? 1 : start
      });

      await loadBlocks();
      setActiveTab('list');
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Erro ao cadastrar quadras em lote.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteBlock = async (b: Block) => {
    if (!window.confirm(`Tem certeza que deseja excluir a Quadra ${b.number}? Esta ação não pode ser desfeita.`)) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await axios.delete(`/api/blocks/${b.id}`);
      await loadBlocks();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Não foi possível excluir esta quadra. Verifique se ela possui lotes associados.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const filteredBlocks = blocks.filter((b) =>
    b.number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (b.description && b.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-3 sm:p-4">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-teal-50 text-[#0f5964]">
              <Building className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                Gerenciar Quadras
              </h3>
              <p className="text-xs text-slate-500">
                {projectName ? `Projeto: ${projectName}` : 'Quadras do projeto'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-200 bg-slate-50/50 px-4 pt-2 gap-2 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setActiveTab('list');
              setEditingBlock(null);
            }}
            className={`pb-2.5 px-3 border-b-2 transition cursor-pointer ${
              activeTab === 'list'
                ? 'border-[#0f5964] text-[#0f5964]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Listar Quadras ({blocks.length})
          </button>

          <button
            type="button"
            onClick={handleStartCreate}
            className={`pb-2.5 px-3 border-b-2 transition cursor-pointer ${
              activeTab === 'create'
                ? 'border-[#0f5964] text-[#0f5964]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {editingBlock ? `Editar Quadra ${editingBlock.number}` : '+ Nova Quadra'}
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('bulk');
              setEditingBlock(null);
            }}
            className={`pb-2.5 px-3 border-b-2 transition cursor-pointer ${
              activeTab === 'bulk'
                ? 'border-[#0f5964] text-[#0f5964]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            + Várias em Lote
          </button>
        </div>

        {/* Error notice */}
        {error && (
          <div className="mx-4 sm:mx-5 mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {/* TAB 1: LIST */}
          {activeTab === 'list' && (
            <div className="space-y-3">
              {/* Search and Action */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filtrar quadra pelo número ou descrição..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0f5964]/20 text-slate-800"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleStartCreate}
                  className="py-1.5 px-3 rounded-xl bg-[#0f5964] hover:bg-[#0c4750] text-white text-xs font-semibold flex items-center gap-1 shadow-xs transition cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Nova Quadra
                </button>
              </div>

              {/* Table / List */}
              {loading ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400 text-xs gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin text-[#0f5964]" />
                  Carregando quadras...
                </div>
              ) : filteredBlocks.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  {blocks.length === 0
                    ? 'Nenhuma quadra cadastrada neste projeto ainda.'
                    : 'Nenhuma quadra encontrada para o filtro informado.'}
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                  <div className="bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                    <span>Identificação</span>
                    <span>Ações</span>
                  </div>

                  {filteredBlocks.map((b) => (
                    <div
                      key={b.id}
                      className="px-3 py-2.5 flex items-center justify-between hover:bg-slate-50/80 transition"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">
                            Quadra {b.number}
                          </span>
                          {!b.active && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-200 text-slate-600">
                              Inativa
                            </span>
                          )}
                          {b._count && b._count.lots !== undefined && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] bg-teal-50 text-[#0f5964] font-medium border border-teal-100">
                              {b._count.lots} {b._count.lots === 1 ? 'lote' : 'lotes'}
                            </span>
                          )}
                        </div>
                        {b.description && (
                          <p className="text-xs text-slate-500 line-clamp-1">{b.description}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(b)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-[#0f5964] hover:bg-teal-50 border border-slate-200 transition cursor-pointer"
                          title="Editar quadra"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteBlock(b)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-200 transition cursor-pointer"
                          title="Excluir quadra"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CREATE / EDIT */}
          {activeTab === 'create' && (
            <form onSubmit={handleSaveSingle} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Identificação da Quadra *
                </label>
                <input
                  type="text"
                  required
                  value={formData.number}
                  onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                  placeholder="Ex: 01, 02A, 15..."
                  className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0f5964]/20 text-slate-900 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Observações / Descrição
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Informações adicionais sobre esta quadra (opcional)..."
                  rows={3}
                  className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0f5964]/20 text-slate-900"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="blockActive"
                  checked={formData.active}
                  onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                  className="w-4 h-4 rounded text-[#0f5964] focus:ring-[#0f5964]"
                />
                <label htmlFor="blockActive" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  Quadra Ativa no Projeto
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('list');
                    setEditingBlock(null);
                  }}
                  className="py-2 px-4 rounded-xl border border-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="py-2 px-5 rounded-xl bg-[#0f5964] hover:bg-[#0c4750] disabled:opacity-50 text-white text-xs font-bold shadow-sm transition cursor-pointer flex items-center gap-1.5"
                >
                  {isSubmitting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  {editingBlock ? 'Salvar Alterações' : 'Cadastrar Quadra'}
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: BULK CREATE */}
          {activeTab === 'bulk' && (
            <form onSubmit={handleSaveBulk} className="space-y-4">
              <div className="p-3 bg-teal-50/70 border border-teal-200/80 rounded-xl text-xs text-[#0f5964] leading-relaxed">
                Esta função cria múltiplas quadras numeradas sequencialmente em lote para o projeto atual.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Começar pela identificação *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={bulkData.startNumber}
                    onChange={(e) => setBulkData({ ...bulkData, startNumber: e.target.value })}
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0f5964]/20 text-slate-900"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Ex: 1</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Quantidade de Quadras *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="200"
                    required
                    value={bulkData.quantity}
                    onChange={(e) => setBulkData({ ...bulkData, quantity: e.target.value })}
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0f5964]/20 text-slate-900"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Ex: 20 (cria do 1 ao 20)</p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setActiveTab('list')}
                  className="py-2 px-4 rounded-xl border border-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="py-2 px-5 rounded-xl bg-[#0f5964] hover:bg-[#0c4750] disabled:opacity-50 text-white text-xs font-bold shadow-sm transition cursor-pointer flex items-center gap-1.5"
                >
                  {isSubmitting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  Criar Quadras em Lote
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

