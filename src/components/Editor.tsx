import { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { SavedScript } from '../types';
import { calculateStats } from '../utils';
import { Printer, Pause, Quote, BarChart2, Info, Flag, AlertCircle, Sparkles, Loader2, X, Check, Save } from 'lucide-react';
import { scriptsApi } from '../lib/supabase';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface Props {
  script: SavedScript;
  onChange: (s: SavedScript) => void;
}

export default function Editor({ script, onChange }: Props) {
  const [showStats, setShowStats] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiPreview, setAiPreview] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const stats = calculateStats(script.content);
  
  const saveTimeoutRef = useRef<NodeJS.Timeout>(null);

  // Auto-Save no Supabase com Debounce
  useEffect(() => {
    if (script.id === 'temp' || !script.id) return;

    // Se houve mudança, prepara para salvar
    setSaveStatus('saving');

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await scriptsApi.upsert(script);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch (err) {
        console.error('Falha no auto-save Supabase:', err);
        setSaveStatus('error');
      }
    }, 3000);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [script.content, script.title]);

  const handleAiAction = async (type: 'improve' | 'summarize' | 'generate') => {
    setIsAiLoading(true);
    try {
      let prompt = "";
      if (type === 'improve') {
        prompt = `Aja como um redator profissional de TV. Melhore o texto deste roteiro de teleprompter para garantir uma fluidez perfeita de fala, corrigindo erros e melhorando o ritmo.
Importante: Conserve quaisquer marcadores especiais presentes, como [PAUSA], [CUE: ...], [NOTA: ...], [ÊNFASE: ...].
Roteiro original:
${script.content}`;
      } else if (type === 'summarize') {
        prompt = `Resuma este roteiro de teleprompter para deixá-lo mais dinâmico e rápido de ler.
Corte redundâncias, mas mantenha o sentido original e marcadores como [PAUSA].
Roteiro original:
${script.content}`;
      } else {
        prompt = `Crie um roteiro rápido para teleprompter sobre o seguinte tópico: "${aiPrompt}".
Inclua, de forma inteligente, alguns marcadores de formatação como [PAUSA] para indicar respiros, [ÊNFASE: palavra] para destaques, e [CUE: câmera/ação] se necessário.
Retorne apenas o texto do roteiro pronto.`;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-2.1-flash',
        contents: prompt,
      });

      const newContent = response.text || '';
      setAiPreview(newContent);
    } catch (err) {
      console.error(err);
      alert('Houve um erro ao processar com a IA Gemma 4.');
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
            <Sparkles size={16} /> IA Gemma 4
          </button>
           <button onClick={() => setShowStats(!showStats)} className="flex items-center gap-1.5 px-3 py-1.5 text-gray-400 hover:text-white rounded text-sm transition-colors shrink-0">
            <BarChart2 size={16} /> Estatísticas
          </button>
          <button onClick={handlePrint} className="flex items-center gap-1.5 px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded text-sm font-medium transition-colors border border-gray-700 shrink-0">
            <Printer size={16} /> Exportar
          </button>
        </div>
      </div>

      {showAiModal && (
        <div className="bg-indigo-950/40 border border-indigo-900/50 rounded-xl p-5 mb-2 relative animate-in fade-in slide-in-from-top-2">
          <button onClick={() => { setShowAiModal(false); setAiPreview(null); }} className="absolute top-4 right-4 text-gray-400 hover:text-white">
            <X size={18} />
          </button>
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="text-indigo-400" size={20} />
            <h3 className="text-lg font-bold text-indigo-100">Assistente IA (Gemma 4)</h3>
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
