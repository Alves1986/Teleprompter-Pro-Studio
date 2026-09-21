import { useState } from 'react';
import { SavedScript } from '../types';
import { FileText, Plus, Trash2, Clock, Upload, Download, Loader2, Sparkles, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { scriptsApi } from '../lib/supabase';

interface Props {
  scripts: SavedScript[];
  setScripts: (v: SavedScript[] | ((prev: SavedScript[]) => SavedScript[])) => void;
  onSelect: (s: SavedScript) => void;
  currentId: string;
}

export default function ScriptManager({ scripts, setScripts, onSelect, currentId }: Props) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [cleanedNotice, setCleanedNotice] = useState(false);
  const [scriptToDelete, setScriptToDelete] = useState<SavedScript | null>(null);
  const [statusNotification, setStatusNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  const handleCleanDuplicates = async () => {
    setIsProcessing(true);
    try {
      const cleaned = await scriptsApi.getAll();
      setScripts(cleaned);
      setCleanedNotice(true);
      setTimeout(() => setCleanedNotice(false), 3000);
    } catch (err) {
      console.error('Erro ao limpar duplicados:', err);
    } finally {
      setIsProcessing(false);
    }
  };
  
  const createNew = async () => {
    setIsProcessing(true);
    try {
      const newScript: SavedScript = {
        id: 'script-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        title: 'Novo Roteiro',
        content: '',
        lastModified: Date.now()
      };
      
      const saved = await scriptsApi.upsert(newScript);
      
      setScripts(prev => [saved, ...prev]);
      onSelect(saved);
      setStatusNotification({
        type: 'success',
        message: 'Novo roteiro criado com sucesso!'
      });
      setTimeout(() => setStatusNotification(null), 3000);
    } catch (err) {
      console.error('Erro ao criar roteiro localmente:', err);
      setStatusNotification({
        type: 'error',
        message: 'Falha ao criar novo roteiro.'
      });
      setTimeout(() => setStatusNotification(null), 3000);
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmDelete = async () => {
    if (!scriptToDelete) return;
    const idToDelete = scriptToDelete.id;
    const titleToDelete = scriptToDelete.title || 'Sem Título';
    setIsProcessing(true);
    try {
      await scriptsApi.delete(idToDelete);
      const remaining = scripts.filter(s => String(s.id) !== String(idToDelete));
      setScripts(remaining);
      
      // Se o roteiro deletado era o que estava aberto no editor:
      if (String(currentId) === String(idToDelete)) {
        if (remaining.length > 0) {
          onSelect(remaining[0]);
        } else {
          const fresh: SavedScript = {
            id: 'script-' + Date.now(),
            title: 'Novo Roteiro',
            content: '',
            lastModified: Date.now()
          };
          const saved = await scriptsApi.upsert(fresh);
          setScripts([saved]);
          onSelect(saved);
        }
      }
      
      setStatusNotification({
        type: 'success',
        message: `Roteiro "${titleToDelete}" foi removido com sucesso!`
      });
      setTimeout(() => setStatusNotification(null), 3500);
    } catch (err) {
      console.error('Erro ao deletar roteiro:', err);
      setStatusNotification({
        type: 'error',
        message: 'Erro ao deletar roteiro do armazenamento local.'
      });
      setTimeout(() => setStatusNotification(null), 3500);
    } finally {
      setIsProcessing(false);
      setScriptToDelete(null);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    setIsProcessing(true);
    reader.onload = async (ev) => {
      try {
        const rawContent = ev.target?.result as string;
        
        // Se for arquivo JSON, pode ser backup completo ou roteiro único
        if (file.name.endsWith('.json')) {
          try {
            const parsed = JSON.parse(rawContent);
            if (Array.isArray(parsed)) {
              for (const item of parsed) {
                if (item.title && item.content !== undefined) {
                  await scriptsApi.upsert(item);
                }
              }
              const all = await scriptsApi.getAll();
              setScripts(all);
              setStatusNotification({
                type: 'success',
                message: `${parsed.length} roteiros importados com sucesso!`
              });
              setTimeout(() => setStatusNotification(null), 3500);
              return;
            } else if (parsed.content !== undefined) {
              const saved = await scriptsApi.upsert(parsed);
              setScripts(prev => [saved, ...prev]);
              onSelect(saved);
              setStatusNotification({
                type: 'success',
                message: 'Roteiro importado com sucesso!'
              });
              setTimeout(() => setStatusNotification(null), 3500);
              return;
            }
          } catch {
            // Continua como texto comum
          }
        }

        // Limpa possíveis tags XML de arquivos exportados
        const cleanContent = rawContent.replace(/<[^>]+>/g, '').trim();

        const newScript: SavedScript = {
          id: 'script-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          title: file.name.replace(/\.[^/.]+$/, ''),
          content: cleanContent,
          lastModified: Date.now()
        };
        
        const saved = await scriptsApi.upsert(newScript);
        
        setScripts(prev => [saved, ...prev]);
        onSelect(saved);
        setStatusNotification({
          type: 'success',
          message: `Roteiro "${newScript.title}" importado com sucesso!`
        });
        setTimeout(() => setStatusNotification(null), 3500);
      } catch (err) {
        console.error('Erro ao importar:', err);
        setStatusNotification({
          type: 'error',
          message: 'Erro na importação do arquivo.'
        });
        setTimeout(() => setStatusNotification(null), 3500);
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsText(file);
  };

  const handleExportBackup = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(scripts, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `teleprompter-backup-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="max-w-[1600px] mx-auto w-full p-4 sm:p-8 flex flex-col h-full">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-display font-bold text-white">Biblioteca de Roteiros</h2>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <label className="bg-[#1E2030] hover:bg-gray-800 text-white px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium flex items-center gap-2 cursor-pointer transition-colors border border-gray-700">
            <Upload size={16} /> Importar Roteiro
            <input type="file" accept=".txt,.md,.json,.doc,.docx" onChange={handleImport} className="hidden" />
          </label>
          <button 
            onClick={handleExportBackup} 
            disabled={scripts.length === 0}
            className="bg-[#1E2030] hover:bg-gray-800 text-gray-300 hover:text-white px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium flex items-center gap-2 transition-colors border border-gray-700 disabled:opacity-40"
            title="Exportar todos os roteiros em JSON"
          >
            <Download size={16} /> Backup JSON
          </button>
          <button 
            onClick={handleCleanDuplicates}
            disabled={isProcessing || scripts.length <= 1}
            className="bg-[#1E2030] hover:bg-gray-800 text-amber-400 hover:text-amber-300 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium flex items-center gap-2 transition-colors border border-amber-500/30 disabled:opacity-40"
            title="Remove cópias repetidas idênticas"
          >
            <Sparkles size={16} /> Limpar Duplicados
          </button>
          <button onClick={createNew} disabled={isProcessing} className="bg-amber-600 hover:bg-amber-500 text-black px-4 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-50">
            {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Criar Novo
          </button>
        </div>
      </div>

      {cleanedNotice && (
        <div className="mb-4 px-4 py-2 bg-emerald-950/70 border border-emerald-500/50 rounded-lg text-emerald-300 text-sm flex items-center gap-2 animate-in fade-in duration-200">
          <Sparkles size={16} className="text-emerald-400" /> Biblioteca sincronizada e cópias duplicadas removidas com sucesso!
        </div>
      )}

      {statusNotification && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm flex items-center justify-between border shadow-lg animate-in fade-in slide-in-from-top-2 ${
          statusNotification.type === 'success' 
            ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300' 
            : 'bg-red-950/80 border-red-500/50 text-red-300'
        }`}>
          <div className="flex items-center gap-2 font-medium">
            {statusNotification.type === 'success' ? <CheckCircle2 size={18} className="text-emerald-400 shrink-0" /> : <AlertTriangle size={18} className="text-red-400 shrink-0" />}
            <span>{statusNotification.message}</span>
          </div>
          <button onClick={() => setStatusNotification(null)} className="text-gray-400 hover:text-white p-1 rounded transition-colors ml-3">
            <X size={16} />
          </button>
        </div>
      )}

      {scripts.length === 0 ? (
        <div className="text-center py-20 bg-[#1E2030] rounded-xl border border-gray-800 border-dashed">
          <FileText size={48} className="mx-auto text-gray-600 mb-4" />
          <h3 className="text-lg font-medium text-gray-300 mb-2">Nenhum roteiro salvo</h3>
          <p className="text-gray-500">Crie um novo roteiro ou importe um arquivo .TXT para começar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {scripts.sort((a,b) => b.lastModified - a.lastModified).map(script => (
            <div 
              key={script.id} 
              onClick={() => onSelect(script)}
              className={`bg-[#1E2030] border ${currentId === script.id ? 'border-amber-500 ring-1 ring-amber-500/30' : 'border-gray-800 hover:border-gray-600'} group p-5 rounded-xl cursor-pointer transition-all hover:-translate-y-1 relative flex flex-col justify-between`}
            >
              <div>
                <div className="flex items-start justify-between mb-3 gap-2">
                  <h3 className="font-bold text-lg text-white truncate flex-1" title={script.title || 'Sem Título'}>
                    {script.title || 'Sem Título'}
                  </h3>
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setScriptToDelete(script);
                    }} 
                    className="text-gray-400 hover:text-red-400 hover:bg-red-500/20 p-2 rounded-lg transition-all border border-transparent hover:border-red-500/30 shrink-0"
                    title="Excluir roteiro"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
                <p className="text-sm text-gray-400/80 line-clamp-3 mb-4 font-mono">
                  {script.content || 'Vazio...'}
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs text-gray-500 font-mono pt-4 border-t border-gray-800/60">
                <Clock size={12} /> {new Date(script.lastModified).toLocaleDateString()} {new Date(script.lastModified).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Seguro de Confirmação de Exclusão (sem bloquear no iframe) */}
      {scriptToDelete && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setScriptToDelete(null)}
        >
          <div 
            className="bg-[#181926] border border-gray-700/80 rounded-2xl p-6 max-w-md w-full shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => setScriptToDelete(null)}
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
                "{scriptToDelete.title || 'Sem Título'}"
              </p>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setScriptToDelete(null)}
                className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-sm font-medium transition-colors"
                disabled={isProcessing}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isProcessing}
                className="px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-colors shadow-lg shadow-red-600/30"
              >
                {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
