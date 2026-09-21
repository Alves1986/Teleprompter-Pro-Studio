import { useState, useEffect } from 'react';
import { PrompterConfig, AppTheme, SavedScript } from './types';
import Editor from './components/Editor';
import ScriptManager from './components/ScriptManager';
import PrompterView from './components/PrompterView';
import RemoteControlPad from './components/RemoteControlPad';
import { Terminal, FileText, Library, Play, Cloud, CloudOff, Keyboard, QrCode } from 'lucide-react';
import { scriptsApi } from './lib/supabase';
import ShortcutsModal, { DEFAULT_KEY_BINDINGS } from './components/ShortcutsModal';
import RemotePairModal from './components/RemotePairModal';

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

  // Unified Room Code for Remote Control Pairing
  const [roomCode, setRoomCode] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlCode = params.get('remote');
      if (urlCode) return urlCode.toUpperCase();
      const cached = sessionStorage.getItem('tp_room_code');
      if (cached) return cached;
    }
    const generated = 'STUDIO-' + Math.floor(1000 + Math.random() * 9000);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('tp_room_code', generated);
    }
    return generated;
  });

  const [controllersCount, setControllersCount] = useState(0);
  const [isRemoteModalOpen, setIsRemoteModalOpen] = useState(false);
  const [autoPlayPrompter, setAutoPlayPrompter] = useState(false);

  const [activeTab, setActiveTab] = useState<'editor' | 'library' | 'prompter' | 'remote'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.has('remote')) return 'remote';
    }
    return 'editor';
  });

  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  const [scripts, setScripts] = useState<SavedScript[]>([]);
  const isOnline = false; // Armazenamento local ativo por padrão

  const [currentScript, setCurrentScript] = useState<SavedScript>(() => {
    const saved = localStorage.getItem('tp_current_script');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.id === 'temp' || !parsed.id) {
          parsed.id = 'default-studio-script';
        }
        return parsed;
      } catch {}
    }
    return { 
      id: 'default-studio-script', 
      title: 'Novo Roteiro Studio', 
      content: 'Bem-vindo ao Teleprompter Pro...\n\n[PAUSA]\n\n[ÊNFASE: Este é um texto de destaque]\n\n[CUE: Câmera 2] E temos também instruções para equipe.\n\n[NOTA: Manter o sorriso durante a fala.]\n\nNós desenvolvemos o melhor sistema de leitura para broadcast moderno.', 
      lastModified: Date.now() 
    };
  });

  // Maintain host WebSocket connection when on main dashboard to track paired controllers and allow remote triggers
  useEffect(() => {
    if (activeTab === 'prompter' || activeTab === 'remote') return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws-remote`;
    let ws: WebSocket | null = null;

    const sendSyncState = (socket: WebSocket | null) => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: 'sync_state',
          isPlaying: false,
          speed: config.speed,
          fontSize: config.fontSize,
          progressPercent: 0,
          scriptTitle: currentScript.title,
          wordCount: currentScript.content.split(/\s+/).filter(Boolean).length,
          inEditor: true
        }));
      }
    };

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        ws?.send(JSON.stringify({
          type: 'join',
          room: roomCode,
          role: 'host'
        }));
        sendSyncState(ws);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'room_status') {
            setControllersCount(msg.controllersCount || 0);
          } else if (msg.type === 'request_sync') {
            sendSyncState(ws);
          } else if (msg.type === 'command') {
            if (msg.action === 'play' || msg.action === 'toggle_play') {
              setAutoPlayPrompter(true);
              setActiveTab('prompter');
            } else if (msg.action === 'speed_up') {
              updateConfig({ speed: Math.min(10, +(config.speed + 0.5).toFixed(1)) });
            } else if (msg.action === 'speed_down') {
              updateConfig({ speed: Math.max(0.5, +(config.speed - 0.5).toFixed(1)) });
            } else if (msg.action === 'font_up') {
              updateConfig({ fontSize: Math.min(150, config.fontSize + 4) });
            } else if (msg.action === 'font_down') {
              updateConfig({ fontSize: Math.max(20, config.fontSize - 4) });
            }
          }
        } catch (err) {
          console.error('App WS error:', err);
        }
      };
    } catch (e) {
      console.warn('WebSocket connection error:', e);
    }

    return () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [roomCode, activeTab, config.speed, config.fontSize, currentScript.title, currentScript.content]);

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

  // Carregar scripts do LocalStorage ao montar ou ao abrir a Biblioteca
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
  }, [activeTab]);

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
    // Sincroniza script atual na lista de scripts se já existir
    setScripts(prev => {
      const idx = prev.findIndex(s => s.id === currentScript.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = currentScript;
        return copy;
      }
      return prev;
    });
  }, [currentScript]);

  const updateConfig = (newCfg: Partial<PrompterConfig>) => setConfig(prev => ({ ...prev, ...newCfg }));

  const handleDeleteScript = async (id: string) => {
    try {
      await scriptsApi.delete(id);
      const remaining = scripts.filter(s => String(s.id) !== String(id));
      setScripts(remaining);
      if (remaining.length > 0) {
        setCurrentScript(remaining[0]);
      } else {
        const fresh: SavedScript = {
          id: 'script-' + Date.now(),
          title: 'Novo Roteiro',
          content: '',
          lastModified: Date.now()
        };
        const saved = await scriptsApi.upsert(fresh);
        setScripts([saved]);
        setCurrentScript(saved);
      }
    } catch (err) {
      console.error('Erro ao deletar script:', err);
    }
  };

  if (activeTab === 'remote') {
    return (
      <RemoteControlPad 
        initialRoomCode={urlRemoteCode || roomCode} 
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
    return (
      <PrompterView 
        script={currentScript} 
        config={config} 
        onUpdateConfig={updateConfig} 
        onClose={() => {
          setAutoPlayPrompter(false);
          setActiveTab('editor');
        }}
        roomCode={roomCode}
        onChangeRoomCode={(newCode) => {
          setRoomCode(newCode);
          sessionStorage.setItem('tp_room_code', newCode);
        }}
        autoPlay={autoPlayPrompter}
      />
    );
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
            onClick={() => setIsRemoteModalOpen(true)}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-md transition-all text-sm font-semibold whitespace-nowrap border ${
              controllersCount > 0 
                ? 'bg-emerald-950/70 border-emerald-500/80 text-emerald-400 shadow-sm' 
                : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/30'
            }`}
            title="Exibir QR Code para conectar seu celular ou tablet como controle remoto sem fio"
          >
            <QrCode size={18} />
            <span>Parear Celular (QR Code)</span>
            {controllersCount > 0 && (
              <span className="flex items-center gap-1 text-[11px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded-full font-mono font-normal">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                {controllersCount}
              </span>
            )}
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
           <Editor script={currentScript} onChange={setCurrentScript} onDelete={handleDeleteScript} />
        ) : (
           <ScriptManager scripts={scripts} setScripts={setScripts} onSelect={(s) => { setCurrentScript(s); setActiveTab('editor'); }} currentId={currentScript.id} />
        )}
      </main>

      {/* Wireless Remote Pairing Modal with QR Code */}
      <RemotePairModal
        isOpen={isRemoteModalOpen}
        onClose={() => setIsRemoteModalOpen(false)}
        roomCode={roomCode}
        onChangeRoomCode={(newCode) => {
          setRoomCode(newCode);
          sessionStorage.setItem('tp_room_code', newCode);
        }}
        controllersCount={controllersCount}
        onOpenControllerLocal={() => {
          setIsRemoteModalOpen(false);
          setActiveTab('remote');
        }}
      />

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
