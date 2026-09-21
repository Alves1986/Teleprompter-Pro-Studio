import { useState, useEffect, useRef } from 'react';
import { SavedScript } from '../types';
import { calculateStats } from '../utils';
import { Printer, Pause, Quote, BarChart2, Info, Flag, AlertCircle, Sparkles, Loader2, X, Check, Save, Trash2 } from 'lucide-react';
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

  const handleAiAction = async (type: 'improve' | 'summarize' | 'generate') => {
    setIsAiLoading(true);
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
        throw new Error(data.error || 'Erro ao processar com a IA.');
      }

      setAiPreview(data.text || '');
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Houve um erro ao processar com a IA.');
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
    <div className="flex flex-col w-full max-w-[95%] lg:max-w-[1600px] mx-auto px-4 py-4 sm:p-6 gap-4 flex-1 h-full overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="flex flex-col gap-1 w-full">
          <input 
            type="text" 
            value={script.title}
            onChange={(e) => onChange({ ...script, title: e.target.value, lastModified: Date.now() })}
            className="bg-transparent border-none text-2xl sm:text-4xl font-display font-bold text-white focus:outline-none focus:ring-0 placeholder-gray-600 truncate w-full"
            placeholder="Título do Roteiro"
          />
          <div className="flex items-center gap-3 text-[10px] sm:text-xs font-mono">
          <span className="text-gray-500">
            Última modificação: {new Date(script.lastModified).toLocaleTimeString()}
          </span>
          <span className="text-gray-800">•</span>
          <div className="flex items-center gap-1.5 transition-all duration-500">
            {saveStatus === 'saving' && (
              <>
                <Loader2 size={12} className="animate-spin text-amber-500" />
                <span className="text-amber-500/70">Sincronizando...</span>
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
                <span className="text-red-500/70">Erro ao sincronizar</span>
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

    <div className="bg-[#1E2030] border border-gray-800 rounded-xl p-2 flex flex-col xl:flex-row items-stretch xl:items-center justify-between shadow-md gap-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 xl:pb-0 hide-scrollbar justify-start w-full whitespace-nowrap">
          <button onClick={() => insertMarker('[PAUSA]')} className="flex items-center gap-1.5 px-3 py-1.5 bg-black/40 hover:bg-amber-500/20 hover:text-amber-500 rounded text-sm text-gray-300 transition-colors shrink-0" title="Inserir pausa visual">
            <Pause size={14} /> Pausa
          </button>
          <button onClick={() => insertMarker('[ÊNFASE: Texto Destaque]')} className="flex items-center gap-1.5 px-3 py-1.5 bg-black/40 hover:bg-amber-500/20 hover:text-amber-500 rounded text-sm text-gray-300 transition-colors shrink-0" title="Texto em destaque">
            <Quote size={14} /> Ênfase
          </button>
          <button onClick={() => insertMarker('[CUE: Câmera 1]')} className="flex items-center gap-1.5 px-3 py-1.5 bg-black/40 hover:bg-blue-500/20 hover:text-blue-400 rounded text-sm text-gray-300 transition-colors shrink-0" title="Instrução lateral de Câmera/Ação">
            <Flag size={14} /> Cue Point
          </button>
          <button onClick={() => insertMarker('[NOTA: Lembrar de sorrir]')} className="flex items-center gap-1.5 px-3 py-1.5 bg-black/40 hover:bg-gray-500/20 hover:text-gray-300 rounded text-sm text-gray-300 transition-colors shrink-0" title="Nota interna (cinza/itálico)">
            <Info size={14} /> Nota
          </button>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-2 xl:pb-0 hide-scrollbar justify-start xl:justify-end w-full whitespace-nowrap border-t border-gray-800 xl:border-none pt-2 xl:pt-0">
           <button onClick={() => setShowAiModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white rounded text-sm font-bold transition-colors shrink-0">
            <Sparkles size={16} /> Assistente IA
          </button>
           <button onClick={() => setShowStats(!showStats)} className="flex items-center gap-1.5 px-3 py-1.5 text-gray-400 hover:text-white rounded text-sm transition-colors shrink-0">
            <BarChart2 size={16} /> Estatísticas
          </button>
          <button onClick={handleManualSave} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 rounded text-sm font-medium transition-colors border border-amber-500/40 shrink-0" title="Salvar alterações agora">
            <Save size={16} /> Salvar
          </button>
          {onDelete && (
            <button 
              onClick={() => setShowDeleteConfirm(true)} 
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-300 rounded text-sm font-medium transition-colors border border-red-800/50 shrink-0" 
              title="Excluir este roteiro"
            >
              <Trash2 size={15} /> Excluir
            </button>
          )}
          <button onClick={handlePrint} className="flex items-center gap-1.5 px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded text-sm font-medium transition-colors border border-gray-700 shrink-0">
            <Printer size={16} /> Exportar
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
        <div className="bg-indigo-950/40 border border-indigo-900/50 rounded-xl p-5 mb-2 relative animate-in fade-in slide-in-from-top-2">
          <button onClick={() => { setShowAiModal(false); setAiPreview(null); }} className="absolute top-4 right-4 text-gray-400 hover:text-white">
            <X size={18} />
          </button>
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="text-indigo-400" size={20} />
            <h3 className="text-lg font-bold text-indigo-100">Assistente IA</h3>
          </div>
          
          <div className="flex flex-col gap-4">
            {!aiPreview ? (
              <>
                <div className="flex gap-2">
                  <button onClick={() => handleAiAction('improve')} disabled={isAiLoading || !script.content.trim()} className="flex-1 bg-indigo-900/40 hover:bg-indigo-800/60 border border-indigo-700/50 text-indigo-100 py-2 px-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex justify-center items-center gap-2">
                    {isAiLoading ? <Loader2 className="animate-spin" size={16}/> : null}
                    Melhorar Texto Existente
                  </button>
                  <button onClick={() => handleAiAction('summarize')} disabled={isAiLoading || !script.content.trim()} className="flex-1 bg-indigo-900/40 hover:bg-indigo-800/60 border border-indigo-700/50 text-indigo-100 py-2 px-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex justify-center items-center gap-2">
                    {isAiLoading ? <Loader2 className="animate-spin" size={16}/> : null}
                    Resumir e Dinamizar
                  </button>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-2 items-stretch mt-2 border-t border-indigo-900/30 pt-4">
                  <input 
                    type="text" 
                    value={aiPrompt}
                    onChange={e => setAiPrompt(e.target.value)}
                    placeholder="Ou peça para a IA gerar um roteiro do zero sobre..."
                    className="flex-1 bg-[#1E2030] border border-indigo-900/50 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    disabled={isAiLoading}
                  />
                  <button onClick={() => handleAiAction('generate')} disabled={isAiLoading || !aiPrompt.trim()} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-50 flex justify-center items-center gap-2 sm:w-32 w-full">
                    {isAiLoading ? <Loader2 className="animate-spin" size={16}/> : 'Gerar'}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="bg-black/60 border border-indigo-500/30 rounded-lg p-4">
                  <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <Sparkles size={12} /> Sugestão da IA
                  </h4>
                  <pre className="text-sm text-indigo-100 font-mono whitespace-pre-wrap max-h-60 overflow-y-auto custom-scrollbar leading-relaxed">
                    {aiPreview}
                  </pre>
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={discardAiContent}
                    className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2.5 rounded-lg text-sm font-bold transition-all"
                  >
                    Descartar e Voltar
                  </button>
                  <button 
                    onClick={applyAiContent}
                    className="flex-1 bg-amber-600 hover:bg-amber-500 text-black py-2.5 rounded-lg text-sm font-bold transition-all shadow-lg shadow-amber-600/20 flex items-center justify-center gap-2"
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
        className="flex-1 w-full bg-[#0F1018] border border-gray-800 rounded-2xl p-6 sm:p-10 text-gray-100 font-mono text-lg sm:text-xl resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/50 shadow-2xl transition-all"
        value={script.content}
        onChange={(e) => onChange({ ...script, content: e.target.value, lastModified: Date.now() })}
        placeholder="Digite ou cole seu roteiro aqui..."
        style={{ lineHeight: 1.8 }}
      />
    </div>
  );
}
