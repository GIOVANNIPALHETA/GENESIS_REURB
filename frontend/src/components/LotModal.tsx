import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Plus, Search } from 'lucide-react';
import { QuickPersonModal, QuickPerson } from './QuickPersonModal';
import { normalizeText } from '../utils/text';

interface Project {
  id: string;
  name: string;
}

interface Block {
  id: string;
  number: string;
  projectId: string;
}

interface LotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function LotModal({ isOpen, onClose, onSuccess }: LotModalProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [people, setPeople] = useState<QuickPerson[]>([]);
  
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedBlockId, setSelectedBlockId] = useState('');
  const [lotNumber, setLotNumber] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  
  const [searchPerson, setSearchPerson] = useState('');
  const [isQuickPersonOpen, setIsQuickPersonOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadDependencies();
      resetForm();
    }
  }, [isOpen]);

  const loadDependencies = async () => {
    try {
      const [projRes, blockRes, peopleRes] = await Promise.all([
        axios.get('/api/projects'),
        axios.get('/api/blocks'),
        axios.get('/api/people'),
      ]);
      setProjects(projRes.data.data || []);
      setBlocks(blockRes.data.data || []);
      setPeople(peopleRes.data.data || []);
    } catch (err) {
      console.error('Error loading dependencies', err);
    }
  };

  const resetForm = () => {
    setSelectedProjectId('');
    setSelectedBlockId('');
    setLotNumber('');
    setSelectedPersonId('');
    setSearchPerson('');
    setError('');
  };

  const filteredBlocks = blocks.filter(b => b.projectId === selectedProjectId);
  
  const filteredPeople = searchPerson.length > 0 
    ? people.filter(p => 
        normalizeText(p.fullName).includes(normalizeText(searchPerson)) || 
        (p.cpf && p.cpf.includes(searchPerson))
      ).slice(0, 5) 
    : [];

  const handleSelectPerson = (p: QuickPerson) => {
    setSelectedPersonId(p.id);
    setSearchPerson(p.fullName);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBlockId || !lotNumber || !selectedPersonId) {
      setError('Por favor, selecione uma quadra, informe o número do lote e escolha um titular.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      await axios.post('/api/lots', {
        blockId: selectedBlockId,
        number: lotNumber,
        status: 'NOT_SIGNED', // Default
        active: true,
        personId: selectedPersonId
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Erro ao cadastrar lote.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
        <div className="w-full max-w-lg rounded-lg bg-white p-5 sm:p-6 shadow-xl max-h-[90vh] overflow-y-auto">
          <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900">Novo Lote</h2>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
              <X size={18} />
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Projeto
                </label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => {
                    setSelectedProjectId(e.target.value);
                    setSelectedBlockId('');
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0f5964]"
                  required
                >
                  <option value="">Selecione um projeto...</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Quadra
                </label>
                <select
                  value={selectedBlockId}
                  onChange={(e) => setSelectedBlockId(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0f5964]"
                  required
                  disabled={!selectedProjectId}
                >
                  <option value="">Selecione uma quadra...</option>
                  {filteredBlocks.map(b => (
                    <option key={b.id} value={b.id}>Quadra {b.number}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Número do Lote
              </label>
              <input
                type="text"
                value={lotNumber}
                onChange={(e) => setLotNumber(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0f5964]"
                placeholder="Ex: 01"
                required
              />
            </div>

            <div className="border-t border-slate-100 pt-4 mt-4">
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Titular do Lote
              </label>
              
              {!selectedPersonId ? (
                <div className="space-y-3">
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar pessoa por nome ou CPF..."
                      value={searchPerson}
                      onChange={(e) => setSearchPerson(e.target.value)}
                      className="w-full rounded-md border border-slate-300 pl-9 pr-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0f5964]"
                    />
                    {filteredPeople.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {filteredPeople.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => handleSelectPerson(p)}
                            className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 border-b border-slate-100 last:border-0"
                          >
                            <div className="font-semibold text-slate-900">{p.fullName}</div>
                            {p.cpf && <div className="text-[11px] text-slate-500">CPF: {p.cpf}</div>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-slate-200"></div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold">ou</span>
                    <div className="flex-1 h-px bg-slate-200"></div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsQuickPersonOpen(true)}
                    className="w-full min-h-[42px] flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-2 text-xs font-semibold text-[#0f5964] hover:bg-[#0f5964]/5 hover:border-[#0f5964] transition"
                  >
                    <Plus size={15} /> Cadastrar Nova Pessoa
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                  <div className="text-xs font-medium text-emerald-800">
                    <span className="font-bold">Selecionado:</span> {searchPerson}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPersonId('');
                      setSearchPerson('');
                    }}
                    className="text-emerald-700 hover:text-emerald-900 text-xs font-semibold underline"
                  >
                    Trocar
                  </button>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[42px] rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                disabled={isSubmitting}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !selectedBlockId || !lotNumber || !selectedPersonId}
                className="min-h-[42px] rounded-lg bg-[#0f5964] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#0c4a53] disabled:opacity-50 transition"
              >
                {isSubmitting ? 'Salvando...' : 'Salvar Lote'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {isQuickPersonOpen && (
        <QuickPersonModal
          onClose={() => setIsQuickPersonOpen(false)}
          onCreated={(p) => {
            setPeople((prev) => [...prev, p]);
            handleSelectPerson(p);
            setIsQuickPersonOpen(false);
          }}
        />
      )}
    </>
  );
}
