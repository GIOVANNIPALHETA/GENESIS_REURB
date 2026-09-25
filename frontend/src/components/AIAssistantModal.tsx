import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  Sparkles,
  X,
  Send,
  Trash2,
  RefreshCw,
  Database,
  CheckCircle2,
  AlertTriangle,
  Layers,
  MapPin,
  DollarSign,
  FileText,
  User,
  ExternalLink,
  ChevronRight,
  HelpCircle,
  Maximize2,
  Minimize2,
  Paperclip,
  UploadCloud,
} from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: string[];
  fileName?: string;
  fileSize?: string;
  timestamp: string;
}

interface AIStatus {
  configured: boolean;
  model: string;
  provider: string;
}

const INITIAL_WELCOME: ChatMessage = {
  id: 'welcome-1',
  role: 'assistant',
  content:
    'Olá! Sou o **Assistente IA do Gênesis REURB**, integrado ao **Google Gemini** e ao banco de dados em tempo real.\n\n' +
    'Além de tirar dúvidas sobre a **Lei 13.465/2017** e consultar lotes/inadimplência, agora você pode **anexar documentos diretamente aqui no chat (📎)** e pedir:\n\n' +
    '👉 *"Esse documento é de Fulano de Tal Qd XX Lt 11 faça upload"*\n\n' +
    'Eu salvarei o arquivo e vincularei ao lote e titular automaticamente no checklist documental!',
  timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
};

const SUGGESTED_PROMPTS = [
  'Resumo geral do loteamento Vila Nova',
  'Quais lotes estão em atraso no Tatão?',
  'Como funciona a REURB-S segundo a Lei 13.465?',
  'Qual o saldo vencido no projeto Dardanelos?',
  'Quem é o titular do Lote 01 da Quadra 1 no Vila Nova?',
];

// Lightweight, safe Markdown renderer for chat responses
function renderMarkdown(text: string) {
  const lines = text.split('\n');
  const renderedElements: React.ReactNode[] = [];
  let inTable = false;
  let tableHeader: string[] = [];
  let tableRows: string[][] = [];

  const flushTable = (keyPrefix: number) => {
    if (inTable && tableHeader.length > 0) {
      renderedElements.push(
        <div key={`table-${keyPrefix}`} className="my-2.5 overflow-x-auto rounded-lg border border-slate-200 shadow-2xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                {tableHeader.map((h, idx) => (
                  <th key={idx} className="px-2.5 py-1.5 whitespace-nowrap">
                    {formatInline(h.trim())}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {tableRows.map((row, rIdx) => (
                <tr key={rIdx} className={rIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="px-2.5 py-1.5 text-slate-700 whitespace-nowrap">
                      {formatInline(cell.trim())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      inTable = false;
      tableHeader = [];
      tableRows = [];
    }
  };

  const formatInline = (inlineText: string): React.ReactNode => {
    const parts = inlineText.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
    return parts.map((part, pIdx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={pIdx} className="font-semibold text-slate-900">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <em key={pIdx}>{part.slice(1, -1)}</em>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={pIdx} className="px-1 py-0.5 rounded bg-slate-100 text-teal-800 font-mono text-[11px]">
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const cells = line
        .trim()
        .slice(1, -1)
        .split('|');

      if (cells.every((c) => c.trim().match(/^:?-+:?$/))) {
        continue;
      }

      if (!inTable) {
        inTable = true;
        tableHeader = cells;
      } else {
        tableRows.push(cells);
      }
      continue;
    } else {
      if (inTable) {
        flushTable(i);
      }
    }

    if (line.startsWith('### ')) {
      renderedElements.push(
        <h4 key={i} className="text-sm font-bold text-slate-900 mt-2 mb-1">
          {formatInline(line.slice(4))}
        </h4>
      );
    } else if (line.startsWith('## ')) {
      renderedElements.push(
        <h3 key={i} className="text-base font-bold text-slate-900 mt-3 mb-1">
          {formatInline(line.slice(3))}
        </h3>
      );
    } else if (line.startsWith('# ')) {
      renderedElements.push(
        <h2 key={i} className="text-lg font-bold text-slate-900 mt-3 mb-1.5">
          {formatInline(line.slice(2))}
        </h2>
      );
    } else if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      renderedElements.push(
        <li key={i} className="ml-4 list-disc text-slate-700 text-xs sm:text-sm my-0.5">
          {formatInline(line.trim().slice(2))}
        </li>
      );
    } else if (line.trim().match(/^\d+\.\s/)) {
      const content = line.trim().replace(/^\d+\.\s/, '');
      renderedElements.push(
        <li key={i} className="ml-4 list-decimal text-slate-700 text-xs sm:text-sm my-0.5">
          {formatInline(content)}
        </li>
      );
    } else if (line.trim() === '') {
      renderedElements.push(<div key={i} className="h-1.5" />);
    } else {
      renderedElements.push(
        <p key={i} className="text-xs sm:text-sm text-slate-700 leading-relaxed">
          {formatInline(line)}
        </p>
      );
    }
  }

  if (inTable) {
    flushTable(lines.length);
  }

  return <div className="space-y-1">{renderedElements}</div>;
}

export function AIAssistantModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = sessionStorage.getItem('genesis_ai_chat_history');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [INITIAL_WELCOME];
      }
    }
    return [INITIAL_WELCOME];
  });

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check backend Gemini status on mount
  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await axios.get('/api/ai/status');
        if (res.data?.success) {
          setStatus(res.data.data);
        }
      } catch (err) {
        console.warn('Falha ao obter status da IA:', err);
      }
    }
    if (isOpen) {
      checkStatus();
    }
  }, [isOpen]);

  // Persist messages in session
  useEffect(() => {
    sessionStorage.setItem('genesis_ai_chat_history', JSON.stringify(messages));
  }, [messages]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading, isOpen]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const prompt = (textToSend || input).trim();
    if ((!prompt && !selectedFile) || loading) return;

    const currentFile = selectedFile;
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: prompt || (currentFile ? `Envio do documento: ${currentFile.name}` : ''),
      fileName: currentFile?.name,
      fileSize: currentFile ? `${(currentFile.size / 1024).toFixed(0)} KB` : undefined,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setLoading(true);

    try {
      const historyPayload = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      let res;

      if (currentFile) {
        // Envio com multipart/form-data
        const formData = new FormData();
        formData.append('message', prompt || `Envio de documento para cadastro.`);
        formData.append('history', JSON.stringify(historyPayload));
        formData.append('file', currentFile);

        res = await axios.post('/api/ai/chat', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        // Envio padrão JSON
        res = await axios.post('/api/ai/chat', {
          message: prompt,
          history: historyPayload,
        });
      }

      const data = res.data?.data;
      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        role: 'assistant',
        content: data?.text || 'Sem resposta do assistente.',
        toolCalls: data?.toolCallsExecuted || [],
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content:
          err?.response?.data?.message ||
          'Desculpe, ocorreu um erro ao se comunicar com o Google Gemini. Verifique a chave de API ou tente novamente.',
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([INITIAL_WELCOME]);
    sessionStorage.removeItem('genesis_ai_chat_history');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:justify-end p-0 sm:p-4 pointer-events-none">
      {/* Backdrop for mobile */}
      <div
        className="fixed inset-0 bg-slate-900/30 backdrop-blur-2xs pointer-events-auto sm:hidden"
        onClick={onClose}
      />

      {/* Floating Chat Container */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`pointer-events-auto w-full bg-white shadow-2xl border border-slate-200/80 rounded-t-2xl sm:rounded-2xl flex flex-col transition-all duration-300 overflow-hidden relative ${
          isExpanded
            ? 'h-[95vh] sm:h-[90vh] sm:w-[780px]'
            : 'h-[85vh] sm:h-[620px] sm:w-[480px]'
        }`}
      >
        {/* Drag Overlay */}
        {isDragging && (
          <div className="absolute inset-0 bg-[#0f5964]/90 z-50 flex flex-col items-center justify-center text-white backdrop-blur-2xs p-6 border-4 border-dashed border-teal-200 m-2 rounded-2xl animate-in fade-in duration-150">
            <UploadCloud size={48} className="text-teal-200 animate-bounce mb-3" />
            <h4 className="text-lg font-bold">Solte o documento aqui</h4>
            <p className="text-xs text-teal-100 mt-1">PDF, imagem (PNG, JPG) ou documento</p>
          </div>
        )}

        {/* Header */}
        <div className="bg-gradient-to-r from-[#0f5964] via-[#136b78] to-[#0f5964] px-4 py-3 text-white flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 backdrop-blur-xs text-white shadow-inner">
              <Sparkles size={20} className="text-teal-200 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold tracking-tight">Gênesis IA</h3>
                {status?.configured ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-200 border border-emerald-400/30">
                    <CheckCircle2 size={10} />
                    Gemini Ativo
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-200 border border-amber-400/30">
                    <AlertTriangle size={10} />
                    Configurar Key
                  </span>
                )}
              </div>
              <p className="text-[11px] text-teal-100/80">
                Assistente de Regularização Fundiária & Dados
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 text-teal-100">
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              title={isExpanded ? 'Restaurar tamanho' : 'Expandir janela'}
              className="p-1.5 rounded-lg hover:bg-white/10 hover:text-white transition cursor-pointer"
            >
              {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button
              type="button"
              onClick={handleClearChat}
              title="Limpar histórico de conversa"
              className="p-1.5 rounded-lg hover:bg-white/10 hover:text-white transition cursor-pointer"
            >
              <Trash2 size={16} />
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Fechar assistente"
              className="p-1.5 rounded-lg hover:bg-white/10 hover:text-white transition cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Status banner when API key is not yet set */}
        {status && !status.configured && (
          <div className="bg-amber-50 border-b border-amber-200 px-3.5 py-2 flex items-center justify-between text-xs text-amber-800">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-amber-600 shrink-0" />
              <span>Chave <code className="font-mono bg-amber-100 px-1 rounded">GEMINI_API_KEY</code> não detectada no .env.</span>
            </div>
          </div>
        )}

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/50">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${
                msg.role === 'user' ? 'items-end' : 'items-start'
              }`}
            >
              <div
                className={`max-w-[90%] sm:max-w-[85%] rounded-2xl p-3 sm:p-3.5 shadow-2xs ${
                  msg.role === 'user'
                    ? 'bg-[#0f5964] text-white rounded-br-none'
                    : 'bg-white border border-slate-200/90 text-slate-800 rounded-bl-none'
                }`}
              >
                {/* User file attachment badge */}
                {msg.fileName && (
                  <div className="mb-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-800/60 border border-teal-400/30 text-teal-100 text-xs">
                    <Paperclip size={13} className="text-teal-200 shrink-0" />
                    <span className="font-medium truncate max-w-[220px]">{msg.fileName}</span>
                    {msg.fileSize && <span className="text-teal-300/70 text-[10px]">({msg.fileSize})</span>}
                  </div>
                )}

                {/* Tool calls badge if executed */}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold text-teal-700 bg-teal-50 border border-teal-200/80 px-2 py-0.5 rounded-md">
                    <Database size={11} className="text-teal-600" />
                    <span>Ação realizada: {msg.toolCalls.join(', ')}</span>
                  </div>
                )}

                {/* Content */}
                {msg.role === 'user' ? (
                  <p className="text-xs sm:text-sm whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  renderMarkdown(msg.content)
                )}
              </div>

              <span className="text-[10px] text-slate-400 mt-1 px-1">
                {msg.timestamp}
              </span>
            </div>
          ))}

          {/* Thinking / Loading Indicator */}
          {loading && (
            <div className="flex items-start gap-2 animate-in fade-in duration-200">
              <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-none p-3 shadow-2xs flex items-center gap-2.5">
                <Sparkles size={16} className="text-[#0f5964] animate-spin" />
                <span className="text-xs text-slate-600 font-medium">
                  Processando com o Gemini e atualizando o sistema...
                </span>
                <span className="flex gap-1 ml-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-500 animate-bounce [animation-delay:-0.3s]"></span>
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-500 animate-bounce [animation-delay:-0.15s]"></span>
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-500 animate-bounce"></span>
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestion Chips (when only welcome message is present) */}
        {messages.length === 1 && !loading && (
          <div className="px-3.5 py-2 bg-slate-100/70 border-t border-slate-200/60 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
            <span className="text-[10px] font-bold text-slate-400 uppercase shrink-0">
              Sugestões:
            </span>
            {SUGGESTED_PROMPTS.map((prompt, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendMessage(prompt)}
                className="whitespace-nowrap text-[11px] font-medium text-slate-700 bg-white hover:bg-[#edf7f7] hover:text-[#0f5964] hover:border-teal-300 border border-slate-200 px-2.5 py-1 rounded-full transition shadow-2xs cursor-pointer shrink-0"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        {/* Input Bar */}
        <div className="p-3 bg-white border-t border-slate-200 shrink-0">
          {/* File Selected Badge */}
          {selectedFile && (
            <div className="flex items-center justify-between px-3 py-1.5 bg-teal-50 border border-teal-200 rounded-xl mb-2 text-xs text-teal-800 animate-in fade-in duration-150">
              <div className="flex items-center gap-2 truncate">
                <FileText size={15} className="text-[#0f5964] shrink-0" />
                <span className="font-semibold truncate max-w-[220px]">{selectedFile.name}</span>
                <span className="text-slate-400 text-[11px]">({(selectedFile.size / 1024).toFixed(0)} KB)</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="p-1 hover:bg-teal-100 rounded-lg text-teal-700 transition cursor-pointer"
                title="Remover anexo"
              >
                <X size={14} />
              </button>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            {/* Hidden file input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
              className="hidden"
            />

            {/* Paperclip attachment button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className={`flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl border transition cursor-pointer shrink-0 ${
                selectedFile
                  ? 'bg-teal-50 border-teal-300 text-[#0f5964]'
                  : 'border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-800'
              }`}
              title="Anexar documento (PDF, foto, comprovante)"
            >
              <Paperclip size={18} />
            </button>

            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              placeholder={
                selectedFile
                  ? 'Digite: "Esse documento é de [Nome] Qd [XX] Lt [YY] faça upload"...'
                  : 'Pergunte sobre lotes, parcelas ou anexe um documento (📎)...'
              }
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#0f5964] focus:ring-2 focus:ring-[#0f5964]/20 outline-none transition disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={(!input.trim() && !selectedFile) || loading}
              className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-[#0f5964] hover:bg-[#0c4750] text-white shadow-xs transition disabled:opacity-40 disabled:hover:bg-[#0f5964] cursor-pointer shrink-0"
              title="Enviar mensagem"
            >
              <Send size={16} />
            </button>
          </form>
          <div className="flex items-center justify-between mt-1.5 px-1 text-[10px] text-slate-400">
            <span>📎 Arraste arquivos ou clique no clipe para upload</span>
            <span>Gênesis REURB • Google Gemini</span>
          </div>
        </div>
      </div>
    </div>
  );
}
