import { useState, useEffect } from 'react';
import { PrompterConfig, AppTheme, SavedScript } from './types';
import Editor from './components/Editor';
import ScriptManager from './components/ScriptManager';
import PrompterView from './components/PrompterView';
import Login from './components/Login';
import { Terminal, FileText, Library, Play, Cloud, CloudOff, LogOut, User, Loader2 } from 'lucide-react';
import { supabase, scriptsApi } from './lib/supabase';
import { User as SupabaseUser } from '@supabase/supabase-js';

const DEFAULT_CONFIG: PrompterConfig = {
  speed: 2,
  fontSize: 64,
  mirrorX: false,
  mirrorY: false,
  width: 80,
  theme: AppTheme.STUDIO,
  columnMode: 'single',
  voiceControl: false,
  lineHeight: 1.5,
  letterSpacing: 0,
  highlightCurrentLine: true,
  showProgressBar: true,
  showTimeRemaining: true
};

export default function App() {
  const [sessionUser, setSessionUser] = useState<SupabaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [config, setConfig] = useState<PrompterConfig>(() => {
    const saved = localStorage.getItem('tp_config');
    return saved ? { ...DEFAULT_CONFIG, ...JSON.parse(saved) } : DEFAULT_CONFIG;
  });

  const [scripts, setScripts] = useState<SavedScript[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);

  const [currentScript, setCurrentScript] = useState<SavedScript>(() => {
    const saved = localStorage.getItem('tp_current_script');
    if (saved) return JSON.parse(saved);
    return { 
      id: 'temp', 
      title: 'Novo Roteiro Studio', 
      content: 'Bem-vindo ao Teleprompter Pro...\n\n[PAUSA]\n\n[ÊNFASE: Este é um texto de destaque]\n\n[CUE: Câmera 2] E temos também instruções para equipe.\n\n[NOTA: Manter o sorriso durante a fala.]\n\nNós desenvolvemos o melhor sistema de leitura para broadcast moderno.', 
      lastModified: Date.now() 
    };
  });

  const [activeTab, setActiveTab] = useState<'editor' | 'library' | 'prompter'>('editor');

  // Gerenciar estado de autenticação
  useEffect(() => {
    const initAuth = async () => {
      if (!supabase || !supabase.auth) {
        setAuthLoading(false);
        return;
      }

      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        setSessionUser(session?.user ?? null);
      } catch (err) {
        console.error('Erro ao buscar sessão:', err);
      } finally {
        setAuthLoading(false);
      }

      // Verificação extra antes de chamar onAuthStateChanged
      if (typeof supabase.auth.onAuthStateChanged === 'function') {
        const { data } = supabase.auth.onAuthStateChanged((_event, session) => {
          setSessionUser(session?.user ?? null);
        });
        return data?.subscription;
      }
    };

    let subscription: any;
    initAuth().then(sub => {
      subscription = sub;
    });

    return () => {
      if (subscription && typeof subscription.unsubscribe === 'function') {
        subscription.unsubscribe();
      }
    };
  }, []);

  // Carregar scripts do Supabase ao montar/mudar usuário
  useEffect(() => {
    if (!sessionUser) {
      setScripts([]);
      return;
    }

    async function loadScripts() {
      setIsLoading(true);
      try {
        const fetchedScripts = await scriptsApi.getAll();
        setScripts(fetchedScripts);
        setIsOnline(true);
      } catch (err) {
        console.error('Falha ao carregar do Supabase, usando backup local', err);
        const saved = localStorage.getItem(`tp_scripts_${sessionUser.id}`);
        if (saved) setScripts(JSON.parse(saved));
        setIsOnline(false);
      } finally {
        setIsLoading(false);
      }
    }
    loadScripts();
  }, [sessionUser]);

  useEffect(() => {
    localStorage.setItem('tp_config', JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    if (sessionUser && scripts.length > 0) {
      localStorage.setItem(`tp_scripts_${sessionUser.id}`, JSON.stringify(scripts));
    }
  }, [scripts, sessionUser]);

  useEffect(() => {
    localStorage.setItem('tp_current_script', JSON.stringify(currentScript));
  }, [currentScript]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCurrentScript({ 
      id: 'temp', 
      title: 'Novo Roteiro Studio', 
      content: 'Bem-vindo ao Teleprompter Pro...', 
      lastModified: Date.now() 
    });
  };

  const updateConfig = (newCfg: Partial<PrompterConfig>) => setConfig(prev => ({ ...prev, ...newCfg }));

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <Loader2 className="animate-spin text-amber-500" size={40} />
      </div>
    );
  }

  if (!sessionUser) {
    return <Login />;
  }

  if (activeTab === 'prompter') {
    return <PrompterView script={currentScript} config={config} onUpdateConfig={updateConfig} onClose={() => setActiveTab('editor')} />;
  }

  return (
    <div className="h-screen bg-[#0A0A0F] text-gray-200 font-sans flex flex-col focus:outline-none overflow-hidden">
      <header className="bg-[#1E2030] border-b border-gray-800 p-4 flex flex-col sm:flex-row flex-wrap lg:flex-nowrap items-center justify-between shadow-md z-10 gap-4">
        <div className="flex items-center gap-2">
          <Terminal size={28} className="text-amber-500" />
          <h1 className="text-xl font-display font-bold text-white tracking-wide">
            Teleprompter<span className="text-amber-500">Pro</span>
            <span className="text-[10px] uppercase font-bold tracking-widest text-[#1E2030] bg-amber-500 px-2 py-0.5 rounded ml-3 align-middle hidden sm:inline-block">STUDIO</span>
          </h1>
          <div className="flex items-center gap-1 ml-4 border-l border-gray-800 pl-4">
            {isOnline ? (
              <Cloud size={16} className="text-green-500" />
            ) : (
              <CloudOff size={16} className="text-red-500" />
            )}
            <span className="text-[10px] uppercase tracking-tighter text-gray-500 font-mono">
              {isOnline ? 'Cloud' : 'Local'}
            </span>
          </div>
        </div>

        <div className="flex bg-black/50 p-1 rounded-lg border border-gray-800 w-full lg:w-auto overflow-x-auto justify-start lg:justify-center">
          <button 
            onClick={() => setActiveTab('editor')}
            className={`flex items-center gap-2 px-4 sm:px-5 py-2 rounded-md transition-all text-sm font-medium whitespace-nowrap ${activeTab === 'editor' ? 'bg-[#1E2030] text-amber-500 shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
          >
            <FileText size={18} /> Editor
          </button>
          <button 
            onClick={() => setActiveTab('library')}
            className={`flex items-center gap-2 px-4 sm:px-5 py-2 rounded-md transition-all text-sm font-medium whitespace-nowrap ${activeTab === 'library' ? 'bg-[#1E2030] text-amber-500 shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
          >
            <Library size={18} /> Biblioteca
          </button>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2 bg-black/40 px-3 py-2 rounded-lg border border-gray-800 overflow-hidden max-w-[180px] sm:max-w-none">
            <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center border border-amber-500/30">
              <User size={14} className="text-amber-500" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold text-white truncate">
                {sessionUser.user_metadata?.full_name || sessionUser.email?.split('@')[0]}
              </span>
              <span className="text-[9px] text-gray-500 truncate">{sessionUser.email}</span>
            </div>
            <button onClick={handleLogout} className="ml-2 p-1.5 hover:bg-red-500/20 rounded-md text-gray-500 hover:text-red-500 transition-colors shrink-0">
              <LogOut size={14} />
            </button>
          </div>
          
          <button 
            onClick={() => setActiveTab('prompter')}
            className="bg-amber-600 hover:bg-amber-500 text-black px-4 sm:px-6 py-2.5 rounded-lg font-bold flex flex-1 sm:flex-none items-center justify-center gap-2 transition-all shadow-lg hover:shadow-amber-500/20 uppercase text-sm tracking-wider"
          >
            <Play size={18} fill="currentColor" /> Apresentar
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden flex relative">
        {activeTab === 'editor' ? (
           <Editor script={currentScript} onChange={setCurrentScript} />
        ) : (
           <ScriptManager scripts={scripts} setScripts={setScripts} onSelect={(s) => { setCurrentScript(s); setActiveTab('editor'); }} currentId={currentScript.id} />
        )}
      </main>
    </div>
  );
}
