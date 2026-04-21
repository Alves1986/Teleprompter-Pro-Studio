import { useState } from 'react';
import { SavedScript } from '../types';
import { FileText, Plus, Trash2, Clock, Upload, Loader2 } from 'lucide-react';
import { scriptsApi } from '../lib/supabase';

interface Props {
  scripts: SavedScript[];
  setScripts: (v: SavedScript[] | ((prev: SavedScript[]) => SavedScript[])) => void;
  onSelect: (s: SavedScript) => void;
  currentId: string;
}

export default function ScriptManager({ scripts, setScripts, onSelect, currentId }: Props) {
  const [isProcessing, setIsProcessing] = useState(false);
  
  const createNew = async () => {
    setIsProcessing(true);
    try {
      const newScript: SavedScript = {
        id: Math.random().toString(36).substring(7),
        title: 'Novo Roteiro',
        content: '',
        lastModified: Date.now()
      };
      
      const saved = await scriptsApi.upsert(newScript);
      const scriptWithRealId = {
        ...newScript,
        id: saved.id,
        lastModified: new Date(saved.last_modified).getTime()
      };
      
      setScripts(prev => [scriptWithRealId, ...prev]);
      onSelect(scriptWithRealId);
    } catch (err) {
      console.error('Erro ao criar roteiro no Supabase:', err);
      alert('Falha ao sincronizar com banco de dados. Verifique sua conexão.');
    } finally {
      setIsProcessing(false);
    }
  };

  const deleteScript = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Tem certeza que deseja apagar este roteiro?')) {
      setIsProcessing(true);
      try {
        await scriptsApi.delete(id);
        setScripts(prev => prev.filter(s => s.id !== id));
      } catch (err) {
        console.error('Erro ao deletar roteiro:', err);
        alert('Erro ao deletar. O registro pode estar indisponível.');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    setIsProcessing(true);
    reader.onload = async (ev) => {
      try {
        const content = ev.target?.result as string;
        const newScript: SavedScript = {
          id: Math.random().toString(36).substring(7),
          title: file.name.replace('.txt', ''),
          content,
          lastModified: Date.now()
        };
        
        const saved = await scriptsApi.upsert(newScript);
        const scriptWithRealId = {
          ...newScript,
          id: saved.id,
          lastModified: new Date(saved.last_modified).getTime()
        };

        setScripts(prev => [scriptWithRealId, ...prev]);
        onSelect(scriptWithRealId);
      } catch (err) {
        console.error('Erro ao importar para o Supabase:', err);
        alert('Erro na importação.');
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="max-w-[1600px] mx-auto w-full p-4 sm:p-8 flex flex-col h-full">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-display font-bold text-white">Biblioteca de Roteiros</h2>
        <div className="flex gap-3">
          <label className="bg-[#1E2030] hover:bg-gray-800 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 cursor-pointer transition-colors border border-gray-700">
            <Upload size={18} /> Importar .TXT
            <input type="file" accept=".txt" onChange={handleImport} className="hidden" />
          </label>
          <button onClick={createNew} className="bg-amber-600 hover:bg-amber-500 text-black px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors">
            <Plus size={18} /> Criar Novo
          </button>
        </div>
      </div>

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
              className={`bg-[#1E2030] border ${currentId === script.id ? 'border-amber-500' : 'border-gray-800 hover:border-gray-600'} group p-5 rounded-xl cursor-pointer transition-all hover:-translate-y-1`}
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-bold text-lg text-white truncate pr-4">{script.title || 'Sem Título'}</h3>
                <button onClick={(e) => deleteScript(e, script.id)} className="text-gray-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                  <Trash2 size={18} />
                </button>
              </div>
              <p className="text-sm text-gray-500 line-clamp-3 mb-4 font-mono">
                {script.content || 'Vazio...'}
              </p>
              <div className="flex items-center gap-2 text-xs text-gray-500 font-mono mt-auto pt-4 border-t border-gray-800/50">
                <Clock size={12} /> {new Date(script.lastModified).toLocaleDateString()} {new Date(script.lastModified).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
