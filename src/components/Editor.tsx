import { useState, useEffect, useRef } from 'react';
import { SavedScript } from '../types';
import { calculateStats, splitScriptIntervalsLocally } from '../utils';
import { 
  Printer, Pause, Quote, BarChart2, Info, Flag, AlertCircle, 
  Sparkles, Loader2, X, Check, Save, Trash2, ListOrdered, 
  SplitSquareVertical, Wand2, CheckCheck 
} from 'lucide-react';
import { scriptsApi } from '../lib/supabase';

interface Props {
  script: SavedScript;
  onChange: (s: SavedScript) => void;
  onDelete?: (id: string) => void;
}

export default function Editor({ script, onChange, onDelete }: Props) {
  const [showStats, setShowStats] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiPreview, setAiPreview] = useState<string | null>(null);
  const [aiActionType, setAiActionType] = useState<'split_intervals' | 'improve' | 'summarize' | 'generate' | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const stats = calculateStats(script.content);
  
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstMountRef = useRef(true);
  const lastSavedContentRef = useRef(script.content);
  const lastSavedTitleRef = useRef(script.title);

  // Auto-Save Local com Debounce - APENAS quando o usuário realmente digita/edita
  useEffect(() => {
    // Ignora na primeira montagem para evitar salvar scripts duplicados automaticamente
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      lastSavedContentRef.current = script.content;
      lastSavedTitleRef.current = script.title;
      return;
    }

    // Se o conteúdo e o título são idênticos ao já salvo, não dispara auto-save
    if (script.content === lastSavedContentRef.current && script.title === lastSavedTitleRef.current) {
      return;
    }

    setSaveStatus('saving');

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const saved = await scriptsApi.upsert(script);
        lastSavedContentRef.current = script.content;
        lastSavedTitleRef.current = script.title;
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);

        // Se o script foi salvo com um ID estável diferente de 'temp', atualiza no estado
        if (saved && saved.id && saved.id !== script.id) {
          onChange({ ...script, id: saved.id });
        }
      } catch (err) {
        console.error('Falha no auto-save local:', err);
        setSaveStatus('error');
      }
    }, 1200);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [script.content, script.title, script.id, onChange]);

  const handleManualSave = async () => {
    setSaveStatus('saving');
    try {
      const saved = await scriptsApi.upsert(script);
      lastSavedContentRef.current = script.content;
      lastSavedTitleRef.current = script.title;
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
      if (saved && saved.id && saved.id !== script.id) {
        onChange({ ...script, id: saved.id });
      }
    } catch (err) {
      setSaveStatus('error');
    }
  };

  const handleAiAction = async (type: 'split_intervals' | 'improve' | 'summarize' | 'generate') => {
    setIsAiLoading(true);
    setAiActionType(type);
    setAiNotice(null);
    setShowAiModal(true);
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          content: script.content,
          promptText: aiPrompt,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        if (type === 'split_intervals') {
          // Fallback gracioso com algoritmo inteligente de ritmo local
          console.warn('Fallback para separador de ritmo local:', data.error);
          const localProcessed = splitScriptIntervalsLocally(script.content);
          setAiPreview(localProcessed);
          setAiNotice('Ajustado com algoritmo de cadência local (100% das palavras preservadas).');
          return;
        }
        throw new Error(data.error || 'Erro ao processar com a IA.');
      }

      setAiPreview(data.text || '');
      if (type === 'split_intervals') {
        setAiNotice('Quebra automática de fala e pausas aplicadas com IA (sem alterar palavras).');
      }
    } catch (err: any) {
      console.error(err);
      if (type === 'split_intervals') {
        const localProcessed = splitScriptIntervalsLocally(script.content);
        setAiPreview(localProcessed);
        setAiNotice('Ajustado com algoritmo de cadência local (100% das palavras preservadas).');
      } else {
        alert(err.message || 'Houve um erro ao processar com a IA.');
      }
    } finally {
      setIsAiLoading(false);
      setAiPrompt("");
    }
  };

  const applyAiContent = () => {
    if (aiPreview) {
      onChange({ ...script, content: aiPreview, lastModified: Date.now() });
      setAiPreview(null);
      setShowAiModal(false);
    }
  };

  const discardAiContent = () => {
    setAiPreview(null);
  };

  const insertMarker = (marker: string) => {
    onChange({ ...script, content: script.content + '\n' + marker + '\n', lastModified: Date.now() });
  };

  const handlePrint = () => {
    const printContent = script.content
      .split('\n')
      .map(line => `<p style="font-size:16pt;line-height:2;margin-bottom:8pt">${line || '&nbsp;'}</p>`)
      .join('');
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>${script.title} - Roteiro</title>
          <style>
            body { font-family: 'Courier New', monospace; max-width: 800px; margin: 40px auto; color: #000; }
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body>
          <h1>${script.title}</h1>
          <hr/>
          ${printContent}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="flex flex-col w-full max-w-full lg:max-w-[1600px] mx-auto px-2.5 sm:px-6 py-2 sm:py-3.5 gap-2 sm:gap-3 flex-1 min-h-0 h-full overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-1.5 sm:gap-4 shrink-0">
        <div className="flex flex-col gap-0.5 sm:gap-1 w-full">
          <input 
            type="text" 
            value={script.title}
            onChange={(e) => onChange({ ...script, title: e.target.value, lastModified: Date.now() })}
            className="bg-transparent border-none text-lg sm:text-3xl font-display font-bold text-white focus:outline-none focus:ring-0 placeholder-gray-600 truncate w-full"
            placeholder="Título do Roteiro"
          />
          <div className="flex items-center gap-2 sm:gap-3 text-[10px] sm:text-xs font-mono">
          <span className="text-gray-500 truncate">
            Modificado: {new Date(script.lastModified).toLocaleTimeString()}
          </span>
          <span className="text-gray-800">•</span>
          <div className="flex items-center gap-1.5 transition-all duration-500 shrink-0">
            {saveStatus === 'saving' && (
              <>
                <Loader2 size={12} className="animate-spin text-amber-500" />
                <span className="text-amber-500/70">Salvando...</span>
              </>
            )}
            {saveStatus === 'saved' && (
              <>
                <Check size={12} className="text-green-500" />
                <span className="text-green-500/70">Salvo no Supabase</span>
              </>
            )}
            {saveStatus === 'error' && (
              <>
                <AlertCircle size={12} className="text-red-500" />
                <span className="text-red-500/70">Erro ao salvar</span>
              </>
            )}
            {saveStatus === 'idle' && script.id !== 'temp' && (
              <>
                <Save size={12} className="text-gray-600" />
                <span className="text-gray-600">Nuvem atualizada</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>

    <div className="bg-[#1E2030] border border-gray-800 rounded-xl p-1.5 sm:p-2 flex flex-col gap-1.5 sm:gap-2 shadow-md shrink-0">
      {/* Row 1: Markers & Direct AI Splitter */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth w-full whitespace-nowrap touch-manipulation py-0.5">
        <span className="text-[10px] uppercase font-mono text-gray-500 font-bold px-1 hidden sm:inline shrink-0">Marcadores:</span>
        <button onClick={() => insertMarker('[PAUSA]')} className="flex items-center gap-1 px-2.5 py-1.5 bg-black/40 hover:bg-amber-500/20 hover:text-amber-400 active:bg-amber-500/30 rounded text-xs text-gray-300 transition-colors shrink-0 touch-manipulation cursor-pointer active:scale-95" title="Inserir pausa visual">
          <Pause size={13} /> Pausa
        </button>
        <button onClick={() => insertMarker('[ÊNFASE: Texto Destaque]')} className="flex items-center gap-1 px-2.5 py-1.5 bg-black/40 hover:bg-amber-500/20 hover:text-amber-400 active:bg-amber-500/30 rounded text-xs text-gray-300 transition-colors shrink-0 touch-manipulation cursor-pointer active:scale-95" title="Texto em destaque">
          <Quote size={13} /> Ênfase
        </button>
        <button onClick={() => insertMarker('[BLOCO: Novo Bloco]')} className="flex items-center gap-1 px-2.5 py-1.5 bg-black/40 hover:bg-purple-500/20 hover:text-purple-400 active:bg-purple-500/30 rounded text-xs text-gray-300 transition-colors shrink-0 touch-manipulation cursor-pointer active:scale-95" title="Inserir bloco para escaleta">
          <ListOrdered size={13} /> Bloco
        </button>
        <button onClick={() => insertMarker('[CUE: Câmera 1]')} className="flex items-center gap-1 px-2.5 py-1.5 bg-black/40 hover:bg-blue-500/20 hover:text-blue-400 active:bg-blue-500/30 rounded text-xs text-gray-300 transition-colors shrink-0 touch-manipulation cursor-pointer active:scale-95" title="Instrução lateral de Câmera/Ação">
          <Flag size={13} /> Cue Point
        </button>
        <button onClick={() => insertMarker('[NOTA: Lembrar de sorrir]')} className="flex items-center gap-1 px-2.5 py-1.5 bg-black/40 hover:bg-gray-500/20 hover:text-gray-300 active:bg-gray-500/30 rounded text-xs text-gray-300 transition-colors shrink-0 touch-manipulation cursor-pointer active:scale-95" title="Nota interna (cinza/itálico)">
          <Info size={13} /> Nota
        </button>

        <div className="h-4 w-px bg-gray-700/80 mx-1 shrink-0" />

        {/* Separador de Ritmo e Quebra Dinâmica com IA Direto */}
        <button 
          onClick={() => handleAiAction('split_intervals')}
          disabled={isAiLoading || !script.content.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-500/20 via-orange-500/15 to-indigo-500/20 hover:from-amber-500/30 hover:to-indigo-500/30 border border-amber-500/40 text-amber-300 hover:text-white rounded-lg text-xs font-bold transition-all shrink-0 touch-manipulation cursor-pointer active:scale-95 shadow-sm disabled:opacity-50"
          title="Quebra automática de fala e marcadores de pausa [PAUSA] respeitando 100% das palavras originais"
        >
          {isAiLoading && aiActionType === 'split_intervals' ? (
            <Loader2 size={13} className="animate-spin text-amber-400" />
          ) : (
            <SplitSquareVertical size={13} className="text-amber-400" />
          )}
          <span>Separar Texto & Pausas (IA)</span>
        </button>
      </div>

      {/* Row 2: Actions (IA, Stats, Salvar, Excluir, Exportar) */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth w-full whitespace-nowrap border-t border-gray-800/80 pt-1.5 justify-start xl:justify-end touch-manipulation py-0.5">
        <button onClick={() => setShowAiModal(true)} className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600 hover:text-white active:bg-indigo-700 rounded text-xs font-bold transition-colors shrink-0 touch-manipulation cursor-pointer active:scale-95">
          <Sparkles size={14} /> Assistente IA
        </button>
        <button onClick={() => setShowStats(!showStats)} className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-800/60 hover:bg-gray-700 active:bg-gray-600 text-gray-300 hover:text-white rounded text-xs transition-colors shrink-0 touch-manipulation cursor-pointer active:scale-95">
          <BarChart2 size={14} /> Estatísticas
        </button>
        <button onClick={handleManualSave} className="flex items-center gap-1 px-3 py-1.5 bg-amber-600/30 hover:bg-amber-600/50 active:bg-amber-600/70 text-amber-300 rounded text-xs font-semibold transition-colors border border-amber-500/40 shrink-0 touch-manipulation cursor-pointer active:scale-95" title="Salvar alterações agora">
          <Save size={14} /> Salvar
        </button>
        {onDelete && (
          <button 
            onClick={() => setShowDeleteConfirm(true)} 
            className="flex items-center gap-1 px-2.5 py-1.5 bg-red-950/40 hover:bg-red-900/60 active:bg-red-900 text-red-400 hover:text-red-300 rounded text-xs font-medium transition-colors border border-red-800/50 shrink-0 touch-manipulation cursor-pointer active:scale-95" 
            title="Excluir este roteiro"
          >
            <Trash2 size={14} /> Excluir
          </button>
        )}
        <button onClick={handlePrint} className="flex items-center gap-1 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-gray-200 rounded text-xs font-medium transition-colors border border-gray-700 shrink-0 touch-manipulation cursor-pointer active:scale-95">
          <Printer size={14} /> Exportar
        </button>
      </div>
    </div>

      {/* Modal Seguro de Confirmação de Exclusão no Editor */}
      {showDeleteConfirm && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div 
            className="bg-[#181926] border border-gray-700/80 rounded-2xl p-6 max-w-md w-full shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => setShowDeleteConfirm(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <X size={18} />
            </button>
            
            <div className="flex items-center gap-3.5 mb-4">
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Excluir Roteiro</h3>
                <p className="text-xs text-gray-400">Esta ação não poderá ser desfeita</p>
              </div>
            </div>

            <div className="bg-black/50 p-3.5 rounded-xl border border-gray-800/80 mb-6">
              <p className="text-sm text-gray-300">
                Tem certeza de que deseja apagar o roteiro:
              </p>
              <p className="text-base font-semibold text-white mt-1 truncate">
                "{script.title || 'Sem Título'}"
              </p>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-sm font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  onDelete?.(script.id);
                }}
                className="px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-colors shadow-lg shadow-red-600/30"
              >
                <Trash2 size={16} />
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {showAiModal && (
        <div className="bg-[#141624] border border-indigo-900/60 rounded-xl p-4 sm:p-5 mb-2 relative animate-in fade-in slide-in-from-top-2 shadow-2xl">
          <button onClick={() => { setShowAiModal(false); setAiPreview(null); setAiNotice(null); }} className="absolute top-4 right-4 text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800">
            <X size={18} />
          </button>
          
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 bg-indigo-600/20 text-indigo-400 rounded-lg border border-indigo-500/30">
              <Sparkles size={18} />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-indigo-100">Assistente IA de Roteiro</h3>
              <p className="text-xs text-gray-400">Cadência, quebras de fala e ritmo dinâmico para teleprompter</p>
            </div>
          </div>
          
          <div className="flex flex-col gap-3.5">
            {!aiPreview ? (
              <>
                {/* DESTAQUE PRINCIPAL: Separador de Texto & Intervalos de Fala */}
                <div className="bg-gradient-to-br from-amber-500/10 via-[#1a1c2e] to-indigo-950/40 border border-amber-500/30 rounded-xl p-3.5 sm:p-4 relative overflow-hidden shadow-lg">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          Recomendado
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                          <CheckCheck size={11} /> 100% Palavras Originais
                        </span>
                      </div>
                      <h4 className="text-sm sm:text-base font-bold text-white flex items-center gap-1.5">
                        <SplitSquareVertical size={16} className="text-amber-400" />
                        Separador de Texto & Intervalos de Fala
                      </h4>
                      <p className="text-xs text-gray-300 max-w-2xl leading-relaxed">
                        A IA analisa a cadência da oratória e quebra o texto em linhas curtas e dinâmicas (3 a 7 palavras), distribuindo pausas <span className="text-amber-400 font-mono font-semibold">[PAUSA]</span> para respiração e <span className="text-amber-300 font-mono font-semibold">[ÊNFASE: ...]</span> nos termos-chave. <strong>Nenhuma palavra do seu roteiro é alterada.</strong>
                      </p>
                    </div>

                    <button 
                      onClick={() => handleAiAction('split_intervals')}
                      disabled={isAiLoading || !script.content.trim()}
                      className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-xs sm:text-sm rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 shrink-0 disabled:opacity-50 active:scale-95 cursor-pointer"
                    >
                      {isAiLoading && aiActionType === 'split_intervals' ? (
                        <>
                          <Loader2 className="animate-spin text-black" size={16} />
                          <span>Analisando Ritmo...</span>
                        </>
                      ) : (
                        <>
                          <Wand2 size={16} />
                          <span>Separar e Ajustar Pausas</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Outras Ações Secundárias */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <button 
                    onClick={() => handleAiAction('improve')} 
                    disabled={isAiLoading || !script.content.trim()} 
                    className="bg-[#1a1c2e] hover:bg-indigo-900/40 border border-indigo-800/40 text-indigo-100 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-medium transition-colors disabled:opacity-50 flex justify-center items-center gap-2 text-left"
                  >
                    {isAiLoading && aiActionType === 'improve' ? <Loader2 className="animate-spin" size={16}/> : null}
                    <div>
                      <div className="font-semibold text-white">Melhorar Fluidez do Texto</div>
                      <div className="text-[11px] text-gray-400">Aperfeiçoa a dicção para estilo telejornal/apresentação</div>
                    </div>
                  </button>

                  <button 
                    onClick={() => handleAiAction('summarize')} 
                    disabled={isAiLoading || !script.content.trim()} 
                    className="bg-[#1a1c2e] hover:bg-indigo-900/40 border border-indigo-800/40 text-indigo-100 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-medium transition-colors disabled:opacity-50 flex justify-center items-center gap-2 text-left"
                  >
                    {isAiLoading && aiActionType === 'summarize' ? <Loader2 className="animate-spin" size={16}/> : null}
                    <div>
                      <div className="font-semibold text-white">Resumir & Dinamizar</div>
                      <div className="text-[11px] text-gray-400">Corta excessos mantendo o sentido central</div>
                    </div>
                  </button>
                </div>
                
                {/* Geração a partir de Prompt */}
                <div className="flex flex-col sm:flex-row gap-2 items-stretch mt-1 border-t border-indigo-900/30 pt-3">
                  <input 
                    type="text" 
                    value={aiPrompt}
                    onChange={e => setAiPrompt(e.target.value)}
                    placeholder="Ou peça para a IA gerar um roteiro do zero sobre..."
                    className="flex-1 bg-[#0F1018] border border-indigo-900/50 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    disabled={isAiLoading}
                  />
                  <button 
                    onClick={() => handleAiAction('generate')} 
                    disabled={isAiLoading || !aiPrompt.trim()} 
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-colors disabled:opacity-50 flex justify-center items-center gap-2 sm:w-32 w-full cursor-pointer"
                  >
                    {isAiLoading && aiActionType === 'generate' ? <Loader2 className="animate-spin" size={16}/> : 'Gerar Roteiro'}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-3.5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                {/* Status e Estatísticas da Otimização */}
                <div className="bg-black/60 border border-amber-500/30 rounded-xl p-3 sm:p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
                    <h4 className="text-xs sm:text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                      <Sparkles size={14} /> 
                      {aiActionType === 'split_intervals' 
                        ? 'Texto Segmentado com Ritmo Dinâmico & Pausas' 
                        : 'Sugestão da IA'}
                    </h4>
                    
                    {aiActionType === 'split_intervals' && (
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                        <span className="bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30">
                          Linhas: {aiPreview.split('\n').filter(l => l.trim()).length}
                        </span>
                        <span className="bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30">
                          Pausas: {(aiPreview.match(/\[PAUSA\]/gi) || []).length}
                        </span>
                        <span className="bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30">
                          Ênfases: {(aiPreview.match(/\[ÊNFASE:[^\]]+\]/gi) || []).length}
                        </span>
                      </div>
                    )}
                  </div>

                  {aiNotice && (
                    <div className="mb-2.5 text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                      <CheckCheck size={14} />
                      <span>{aiNotice}</span>
                    </div>
                  )}

                  <pre className="text-xs sm:text-sm text-gray-200 font-mono whitespace-pre-wrap max-h-72 overflow-y-auto custom-scrollbar leading-relaxed bg-[#0A0A0F] p-3.5 rounded-lg border border-gray-800/80">
                    {aiPreview}
                  </pre>
                </div>

                <div className="flex flex-col sm:flex-row gap-2.5">
                  <button 
                    onClick={discardAiContent}
                    className="flex-1 bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-gray-300 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all text-center cursor-pointer"
                  >
                    Descartar e Voltar
                  </button>
                  <button 
                    onClick={applyAiContent}
                    className="flex-1 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-black py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Check size={18} /> Aplicar ao Roteiro
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showStats && (
        <div className="bg-black/40 border border-gray-800 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-4 animate-in fade-in slide-in-from-top-2">
           <div className="flex flex-col">
             <span className="text-xs text-gray-500 uppercase tracking-wider font-bold">Tempo de Leitura</span>
             <span className="text-xl text-amber-500 font-mono">{stats.readingTimeMinutes}m {stats.readingTimeSeconds}s</span>
           </div>
           <div className="flex flex-col">
             <span className="text-xs text-gray-500 uppercase tracking-wider font-bold">Palavras</span>
             <span className="text-xl text-white font-mono">{stats.wordCount}</span>
           </div>
           <div className="flex flex-col">
             <span className="text-xs text-gray-500 uppercase tracking-wider font-bold">Vel. Recomendada</span>
             <span className="text-xl text-blue-400 font-mono">{stats.wpmRecommended} WPM</span>
           </div>
           <div className="flex flex-col">
             <span className="text-xs text-gray-500 uppercase tracking-wider font-bold">Blocos (Pausas)</span>
             <span className="text-xl text-gray-300 font-mono">{stats.estimatedSegments}</span>
           </div>
           
           <div className="col-span-4 flex gap-4 text-xs text-gray-500 mt-2 border-t border-gray-800 pt-3">
             <span className="flex items-center gap-1"><AlertCircle size={12}/> Caracteres: {stats.charCount}</span>
             <span className="flex items-center gap-1"><AlertCircle size={12}/> Linhas: {stats.lineCount}</span>
             <span className="flex items-center gap-1"><AlertCircle size={12}/> Média Palavras/Linha: {stats.avgWordsPerLine}</span>
           </div>
        </div>
      )}

      <textarea
        className="flex-1 min-h-0 w-full bg-[#0F1018] border border-gray-800 rounded-xl sm:rounded-2xl p-3 sm:p-8 text-gray-100 font-mono text-sm sm:text-xl resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/50 shadow-2xl transition-all pb-safe"
        value={script.content}
        onChange={(e) => onChange({ ...script, content: e.target.value, lastModified: Date.now() })}
        placeholder="Digite ou cole seu roteiro aqui..."
        style={{ lineHeight: 1.7 }}
      />
    </div>
  );
}
