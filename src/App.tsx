import { useState, useEffect, useRef } from 'react';
import { PrompterConfig, AppTheme, SavedScript } from './types';
import Editor from './components/Editor';
import ScriptManager from './components/ScriptManager';
import PrompterView from './components/PrompterView';
import RemoteControlPad from './components/RemoteControlPad';
import { Terminal, FileText, Library, Play, Cloud, CloudOff, Keyboard, QrCode, Download } from 'lucide-react';
import { scriptsApi } from './lib/supabase';
import ShortcutsModal, { DEFAULT_KEY_BINDINGS } from './components/ShortcutsModal';
import RemotePairModal from './components/RemotePairModal';
import { usePWAInstall } from './hooks/usePWAInstall';
import InstallAppBanner from './components/InstallAppBanner';
import InstallGuideModal from './components/InstallGuideModal';
import { RemoteClient } from './services/remoteService';

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
  autoOrientation: true,
  orientationMode: 'auto',
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
  const pwaState = usePWAInstall();
  const [isInstallGuideOpen, setIsInstallGuideOpen] = useState(false);

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

  const configRef = useRef(config);
  configRef.current = config;
  const currentScriptRef = useRef(currentScript);
  currentScriptRef.current = currentScript;
  const hostClientRef = useRef<RemoteClient | null>(null);

  // Maintain host connection when on main dashboard to track paired controllers and allow remote triggers
  useEffect(() => {
    if (activeTab === 'prompter' || activeTab === 'remote') {
      if (hostClientRef.current) {
        hostClientRef.current.destroy();
        hostClientRef.current = null;
      }
      return;
    }

    const client = new RemoteClient(roomCode, 'host', {
      onCommand: (action, payload) => {
        const curConfig = configRef.current;
        const curScript = currentScriptRef.current;

        if (action === 'play' || action === 'toggle_play') {
          setAutoPlayPrompter(true);
          setActiveTab('prompter');
        } else if (action === 'speed_up') {
          updateConfig({ speed: Math.min(10, +(curConfig.speed + 0.5).toFixed(1)) });
        } else if (action === 'speed_down') {
          updateConfig({ speed: Math.max(0.5, +(curConfig.speed - 0.5).toFixed(1)) });
        } else if (action === 'set_speed' && typeof payload?.speed === 'number') {
          updateConfig({ speed: payload.speed });
        } else if (action === 'font_up') {
          updateConfig({ fontSize: Math.min(150, curConfig.fontSize + 4) });
        } else if (action === 'font_down') {
          updateConfig({ fontSize: Math.max(20, curConfig.fontSize - 4) });
        } else if (action === 'set_font' && typeof payload?.fontSize === 'number') {
          updateConfig({ fontSize: payload.fontSize });
        } else if (action === 'request_sync') {
          client.syncState({
            isPlaying: false,
            speed: curConfig.speed,
            fontSize: curConfig.fontSize,
            progressPercent: 0,
            scriptTitle: curScript.title,
            wordCount: curScript.content.split(/\s+/).filter(Boolean).length,
            inEditor: true
          });
        }
      },
      onStatus: (status) => {
        setControllersCount(status.controllersCount);
      }
    });

    hostClientRef.current = client;

    client.syncState({
      isPlaying: false,
      speed: configRef.current.speed,
      fontSize: configRef.current.fontSize,
      progressPercent: 0,
      scriptTitle: currentScriptRef.current.title,
      wordCount: currentScriptRef.current.content.split(/\s+/).filter(Boolean).length,
      inEditor: true
    });

    return () => {
      client.destroy();
      hostClientRef.current = null;
    };
  }, [roomCode, activeTab]);

  // Sync state changes without dropping or reconnecting WebSocket
  useEffect(() => {
    if (hostClientRef.current && (activeTab !== 'prompter' && activeTab !== 'remote')) {
      hostClientRef.current.syncState({
        isPlaying: false,
        speed: config.speed,
        fontSize: config.fontSize,
        progressPercent: 0,
        scriptTitle: currentScript.title,
        wordCount: currentScript.content.split(/\s+/).filter(Boolean).length,
        inEditor: true
      });
    }
  }, [config.speed, config.fontSize, currentScript.title, currentScript.content, activeTab]);

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
    <div className="h-[100dvh] min-h-[100dvh] max-h-[100dvh] bg-[#0A0A0F] text-gray-200 font-sans flex flex-col focus:outline-none overflow-hidden">
      <header className="bg-[#1E2030] border-b border-gray-800 header-pt-safe px-3 sm:px-6 pb-2.5 sm:pb-3 flex flex-col lg:flex-row items-stretch lg:items-center justify-between shadow-md z-30 gap-2 sm:gap-4 shrink-0">
        {/* Top bar: Brand logo and status, plus mobile action button */}
        <div className="flex items-center justify-between gap-2 w-full lg:w-auto">
          <div className="flex items-center gap-2 min-w-0">
            <Terminal size={20} className="text-amber-500 shrink-0" />
            <h1 className="text-base sm:text-xl font-display font-bold text-white tracking-wide flex items-center truncate">
              Teleprompter<span className="text-amber-500">Pro</span>
              <span className="text-[9px] uppercase font-bold tracking-widest text-[#1E2030] bg-amber-500 px-1.5 py-0.5 rounded ml-2 align-middle hidden sm:inline-block">STUDIO</span>
            </h1>
            <div className="flex items-center gap-1 ml-1.5 sm:ml-3 border-l border-gray-800 pl-1.5 sm:pl-3 shrink-0">
              {isOnline ? (
                <Cloud size={13} className="text-green-500 shrink-0" />
              ) : (
                <CloudOff size={13} className="text-red-500 shrink-0" />
              )}
              <span className="text-[10px] uppercase tracking-tighter text-gray-400 font-mono">
                {isOnline ? 'Cloud' : 'Local'}
              </span>
            </div>
          </div>

          {/* Quick Present Button on mobile right next to logo for immediate access */}
          <button 
            onClick={() => setActiveTab('prompter')}
            className="lg:hidden bg-amber-500 hover:bg-amber-400 active:bg-amber-300 text-black px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all shadow-md shadow-amber-500/20 uppercase text-xs tracking-wider shrink-0 touch-manipulation cursor-pointer active:scale-95"
            title="Iniciar Teleprompter"
          >
            <Play size={13} fill="currentColor" /> Apresentar
          </button>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="flex bg-black/50 p-1 rounded-lg border border-gray-800 w-full lg:w-auto overflow-x-auto no-scrollbar scroll-smooth items-center gap-1 justify-start lg:justify-center touch-manipulation">
          <button 
            onClick={() => setActiveTab('editor')}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2 rounded-md transition-all text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 touch-manipulation cursor-pointer active:scale-95 ${activeTab === 'editor' ? 'bg-[#1E2030] text-amber-500 shadow-sm font-semibold' : 'text-gray-400 hover:text-gray-200'}`}
          >
            <FileText size={15} /> <span>Editor</span>
          </button>
          <button 
            onClick={() => setActiveTab('library')}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2 rounded-md transition-all text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 touch-manipulation cursor-pointer active:scale-95 ${activeTab === 'library' ? 'bg-[#1E2030] text-amber-500 shadow-sm font-semibold' : 'text-gray-400 hover:text-gray-200'}`}
          >
            <Library size={15} /> <span>Biblioteca</span>
          </button>
          <button 
            onClick={() => setIsRemoteModalOpen(true)}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2 rounded-md transition-all text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 border touch-manipulation cursor-pointer active:scale-95 ${
              controllersCount > 0 
                ? 'bg-emerald-950/70 border-emerald-500/80 text-emerald-400 shadow-sm' 
                : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/30'
            }`}
            title="Exibir QR Code para conectar celular ou tablet como controle remoto"
          >
            <QrCode size={15} />
            <span>Parear Remoto</span>
            {controllersCount > 0 && (
              <span className="flex items-center gap-1 text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded-full font-mono font-normal">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                {controllersCount}
              </span>
            )}
          </button>
          <button 
            onClick={() => setIsShortcutsOpen(true)}
            className="flex items-center gap-1.5 px-2.5 sm:px-4 py-2 sm:py-2 rounded-md transition-all text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 text-gray-400 hover:text-amber-400 hover:bg-[#1E2030] touch-manipulation cursor-pointer active:scale-95"
            title="Mapeamento de atalhos e pedais Bluetooth"
          >
            <Keyboard size={15} /> <span>Atalhos</span>
          </button>

          {!pwaState.isInstalled && (
            <button
              onClick={() => setIsInstallGuideOpen(true)}
              className="flex items-center gap-1.5 px-2.5 sm:px-4 py-2 sm:py-2 rounded-md transition-all text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-sm touch-manipulation cursor-pointer active:scale-95"
              title={`Instalar aplicativo`}
            >
              <Download size={14} />
              <span>Instalar</span>
            </button>
          )}
        </div>

        {/* Desktop Presentation & Status Action */}
        <div className="hidden lg:flex items-center gap-3">
          <div className="flex items-center justify-center gap-2 px-3 py-1.5 border border-gray-800 rounded-lg text-xs bg-black/30 font-mono text-gray-400">
            Armazenamento Ativo
          </div>
          
          <button 
            onClick={() => setActiveTab('prompter')}
            className="bg-amber-600 hover:bg-amber-500 active:bg-amber-400 text-black px-5 py-2 rounded-lg font-bold flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-amber-500/20 uppercase text-xs tracking-wider touch-manipulation cursor-pointer"
          >
            <Play size={16} fill="currentColor" /> Apresentar
          </button>
        </div>
      </header>

      {/* Screen notice to download / install app on mobile and tablet */}
      <InstallAppBanner pwaState={pwaState} className="mx-0 sm:mx-4 sm:mt-2.5 sm:mb-1 shrink-0" />

      <main className="flex-1 min-h-0 overflow-hidden flex relative">
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
        onConnectAsControllerWithCode={(scannedCode) => {
          setRoomCode(scannedCode);
          sessionStorage.setItem('tp_room_code', scannedCode);
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

      {/* Visual Install Guide Modal for Mobile, Tablet & Desktop */}
      <InstallGuideModal
        isOpen={isInstallGuideOpen}
        onClose={() => setIsInstallGuideOpen(false)}
        pwaState={pwaState}
      />
    </div>
  );
}
