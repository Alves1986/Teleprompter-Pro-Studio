import { useState, useEffect } from 'react';
import { PrompterConfig, AppTheme, SavedScript } from './types';
import Editor from './components/Editor';
import ScriptManager from './components/ScriptManager';
import PrompterView from './components/PrompterView';
import RemoteControlPad from './components/RemoteControlPad';
import { Terminal, FileText, Library, Play, Cloud, CloudOff, Smartphone, Keyboard } from 'lucide-react';
import { scriptsApi } from './lib/supabase';
import ShortcutsModal, { DEFAULT_KEY_BINDINGS } from './components/ShortcutsModal';

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
  showTimeRemaining: true,
  rotation: 0,
  countdownDuration: 3,
  cameraEnabled: false,
  cameraOpacity: 40,
  voiceFollowEnabled: false,
  targetMinutes: 0,
  pedalShortcutsEnabled: true,
  customKeyBindings: DEFAULT_KEY_BINDINGS
};

export default function App() {
  const [config, setConfig] = useState<PrompterConfig>(() => {
    const saved = localStorage.getItem('tp_config');
    return saved ? { ...DEFAULT_CONFIG, ...JSON.parse(saved) } : DEFAULT_CONFIG;
  });

  // Detect URL query parameter for direct remote control
  const [urlRemoteCode] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('remote');
    }
    return null;
  });

  const [activeTab, setActiveTab] = useState<'editor' | 'library' | 'prompter' | 'remote'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.has('remote')) return 'remote';
    }
    return 'editor';
  });

  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  useEffect(() => {
    // Permitir rotação livre de acordo com a orientação do aparelho
    if (typeof screen !== 'undefined' && screen.orientation && typeof (screen.orientation as any).unlock === 'function') {
      try {
        (screen.orientation as any).unlock();
      } catch {
        // Ignora caso contexto não permita
      }
    }
  }, []);

  const [scripts, setScripts] = useState<SavedScript[]>([]);
  const isOnline = false; // Armazenamento local ativo por padrão

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

  // Carregar scripts do LocalStorage ao montar
  useEffect(() => {
    async function loadScripts() {
      try {
        const fetchedScripts = await scriptsApi.getAll();
        setScripts(fetchedScripts);
      } catch (err) {
        console.error('Falha ao carregar do Storage Local', err);
      }
    }
    loadScripts();
  }, []);

  useEffect(() => {
    localStorage.setItem('tp_config', JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    if (scripts.length > 0) {
      localStorage.setItem('tp_scripts_local_backup', JSON.stringify(scripts));
    }
  }, [scripts]);

  useEffect(() => {
    localStorage.setItem('tp_current_script', JSON.stringify(currentScript));
  }, [currentScript]);

  const updateConfig = (newCfg: Partial<PrompterConfig>) => setConfig(prev => ({ ...prev, ...newCfg }));

  if (activeTab === 'remote') {
    return (
      <RemoteControlPad 
        initialRoomCode={urlRemoteCode || 'STUDIO1'} 
        onExit={() => {
          // Clear ?remote parameter without reload
          if (window.history && window.history.replaceState) {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
          setActiveTab('editor');
        }} 
      />
    );
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
          <button 
            onClick={() => setActiveTab('remote')}
            className="flex items-center gap-2 px-4 sm:px-5 py-2 rounded-md transition-all text-sm font-medium whitespace-nowrap text-gray-400 hover:text-amber-400 hover:bg-[#1E2030]"
            title="Usar este aparelho como controle remoto para outro teleprompter"
          >
            <Smartphone size={18} /> Controle Remoto
          </button>
          <button 
            onClick={() => setIsShortcutsOpen(true)}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-md transition-all text-sm font-medium whitespace-nowrap text-gray-400 hover:text-amber-400 hover:bg-[#1E2030]"
            title="Mapeamento visual de atalhos de teclado e pedais Bluetooth"
          >
            <Keyboard size={18} /> Atalhos & Pedais
          </button>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center justify-center gap-2 px-4 py-2 border border-gray-800 rounded-lg text-xs bg-black/30 font-mono text-gray-500">
            Armazenamento Local Ativo
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

      {/* Visual Shortcuts & Bluetooth Pedal Mapping Panel */}
      <ShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
        bindings={config.customKeyBindings || DEFAULT_KEY_BINDINGS}
        onSaveBindings={(newBindings) => {
          updateConfig({ customKeyBindings: newBindings });
        }}
        pedalEnabled={config.pedalShortcutsEnabled ?? true}
        onTogglePedal={(enabled) => {
          updateConfig({ pedalShortcutsEnabled: enabled });
        }}
      />
    </div>
  );
}
