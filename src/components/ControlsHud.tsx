import { useState, useEffect } from 'react';
import { PrompterConfig, AppTheme } from '../types';
import { 
  Settings, Maximize, Minimize, X, Type, MonitorOff, Plus, Minus, Play, 
  Pause, RotateCcw, Smartphone, Video, Mic, ListOrdered, Timer, Keyboard 
} from 'lucide-react';

interface Props {
  config: PrompterConfig;
  onUpdateConfig: (cfg: Partial<PrompterConfig>) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onReset: () => void;
  onClose: () => void;
  onOpenRemotePair?: () => void;
  controllersCount?: number;
  onOpenEscaleta?: () => void;
  blocksCount?: number;
  onToggleCamera?: () => void;
  isCameraActive?: boolean;
  onToggleVoiceFollow?: () => void;
  isVoiceFollowActive?: boolean;
  onOpenShortcuts?: () => void;
}

const ControlStepper = ({ 
  label, 
  value, 
  min, 
  max, 
  step, 
  onChange, 
  icon 
}: { 
  label: string; 
  value: number; 
  min: number; 
  max: number; 
  step: number; 
  onChange: (val: number) => void;
  icon?: React.ReactNode;
}) => (
  <div className="flex flex-col gap-2">
    <span className="text-xs font-bold text-gray-500 uppercase tracking-tight flex items-center gap-1">
      {icon} {label}: {value}{Number.isInteger(step) ? '' : value % 1 === 0 ? '.0' : ''}
    </span>
    <div className="flex items-center gap-1 sm:gap-3 bg-black/40 p-1.5 rounded-lg border border-gray-800">
      <button 
        onClick={() => onChange(Math.max(min, value - step))} 
        className="bg-[#1E2030] hover:bg-gray-700 text-amber-500 p-2 rounded shadow-sm border border-gray-700 transition-colors active:scale-95 shrink-0"
      >
         <Minus size={16} />
      </button>
      <input 
        type="range" 
        min={min} 
        max={max} 
        step={step} 
        value={value} 
        onChange={e => onChange(Number(e.target.value))} 
        className="accent-amber-500 flex-1 w-full h-1.5 bg-gray-700 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-amber-500 [&::-webkit-slider-thumb]:rounded-full cursor-pointer" 
      />
      <button 
        onClick={() => onChange(Math.min(max, value + step))} 
        className="bg-[#1E2030] hover:bg-gray-700 text-amber-500 p-2 rounded shadow-sm border border-gray-700 transition-colors active:scale-95 shrink-0"
      >
         <Plus size={16} />
      </button>
    </div>
  </div>
);

export default function ControlsHud({ 
  config, 
  onUpdateConfig, 
  isPlaying, 
  onTogglePlay, 
  onReset, 
  onClose,
  onOpenRemotePair,
  controllersCount = 0,
  onOpenEscaleta,
  blocksCount = 0,
  onToggleCamera,
  isCameraActive = false,
  onToggleVoiceFollow,
  isVoiceFollowActive = false,
  onOpenShortcuts
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLandscape, setIsLandscape] = useState(
    typeof window !== 'undefined' ? window.innerWidth > window.innerHeight : false
  );

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    const handleOrientation = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('resize', handleOrientation);
    window.addEventListener('orientationchange', handleOrientation);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('resize', handleOrientation);
      window.removeEventListener('orientationchange', handleOrientation);
    };
  }, []);

  const toggleOrientation = async () => {
    if (typeof screen !== 'undefined' && screen.orientation) {
      try {
        if (!isLandscape) {
          if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
            await document.documentElement.requestFullscreen().catch(() => {});
          }
          if (typeof (screen.orientation as any).lock === 'function') {
            await (screen.orientation as any).lock('landscape');
          }
        } else {
          if (typeof (screen.orientation as any).unlock === 'function') {
            (screen.orientation as any).unlock();
          }
        }
      } catch (err) {
        console.warn('Screen orientation lock/unlock fallback:', err);
      }
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  };

  const handlePiP = async () => {
    if ('documentPictureInPicture' in window) {
      try {
        const pipWindow = await (window as any).documentPictureInPicture.requestWindow({
          width: 640,
          height: 360
        });
        const root = document.getElementById('root');
        if (root) {
             const styleEl = document.createElement('link');
             styleEl.rel = 'stylesheet';
             styleEl.href = '/src/index.css'; 
             pipWindow.document.head.appendChild(styleEl);
             // Clone isn't interactive but displays. For an interactive PiP in React we would map a portal.
             // Given limitations, we provide a placeholder notice or actual portal implementation if complex.
             pipWindow.document.body.innerHTML = '<h2 style="font-family:sans-serif; text-align:center; padding: 20px;">[Modo Picture in Picture Ativo]</h2>';
        }
      } catch (err) {
        console.log(err);
      }
    } else {
      alert('Seu navegador não suporta a API de Document Picture in Picture.');
    }
  };

  return (
    <div className={`fixed bottom-0 left-0 right-0 p-4 transition-transform duration-300 z-50 ${isOpen ? 'translate-y-0' : 'translate-y-full hover:translate-y-[90%]'} flex justify-center`}>
      <div className="absolute -top-10 left-1/2 -translate-x-1/2">
        <button onClick={() => setIsOpen(!isOpen)} className="bg-[#1E2030]/90 backdrop-blur border border-gray-800 px-6 py-2 rounded-t-xl shadow-lg flex items-center gap-2 text-white hover:text-amber-500 transition-colors">
          <Settings size={18} /> {isOpen ? 'Ocultar Controles' : 'Mostrar Controles HUD'}
        </button>
      </div>
      
      <div className="bg-[#0A0A0F]/95 backdrop-blur-md border border-gray-800 rounded-t-2xl sm:rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col gap-4 sm:gap-6 max-w-4xl w-full max-h-[85vh] overflow-y-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-gray-800 pb-4 gap-4">
           <h3 className="text-xl font-display font-bold text-white flex items-center gap-2">
             Controles de Reprodução <span className="text-[10px] bg-amber-500 text-black px-2 py-0.5 rounded tracking-widest hidden sm:inline-block">LIVE</span>
           </h3>
           <div className="flex gap-2 w-full sm:w-auto shrink-0 justify-end items-center flex-wrap">
             <button onClick={onTogglePlay} className="px-3 py-2 flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 rounded-lg text-black font-bold text-xs" title="Reproduzir/Pausar">
               {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
               {isPlaying ? 'Pausar' : 'Iniciar'}
             </button>
             <button onClick={onReset} className="p-2 flex justify-center bg-[#1E2030] hover:bg-gray-700 rounded-lg text-gray-300" title="Reiniciar do Início">
               <RotateCcw size={16} />
             </button>
             <button 
               onClick={toggleOrientation} 
               className="p-2 flex-1 sm:flex-none justify-center flex items-center gap-1.5 bg-[#1E2030] hover:bg-gray-700 rounded-lg text-gray-300 text-xs" 
               title={isLandscape ? 'Orientação: Horizontal (Detectada pelo aparelho)' : 'Orientação: Vertical (Detectada pelo aparelho)'}
             >
               <Smartphone size={16} className={`transition-transform duration-300 ${isLandscape ? 'rotate-90 text-amber-400' : ''}`} />
               <span className="hidden md:inline">{isLandscape ? 'Horizontal' : 'Vertical'}</span>
             </button>
             <button onClick={handlePiP} className="p-2 flex-1 sm:flex-none justify-center flex bg-[#1E2030] hover:bg-gray-700 rounded-lg text-gray-300" title="Picture in Picture" ><MonitorOff size={18}/></button>
             <button onClick={toggleFullscreen} className="p-2 flex-1 sm:flex-none justify-center flex bg-[#1E2030] hover:bg-gray-700 rounded-lg text-gray-300" title="Fullscreen" >{isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}</button>
             <button onClick={onClose} className="p-2 flex-1 sm:flex-none justify-center flex bg-red-900/50 hover:bg-red-500 rounded-lg text-red-200" title="Fechar Prompter" ><X size={18} /></button>
           </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
          <ControlStepper 
            label="Velocidade" 
            value={config.speed} 
            min={0} max={10} step={0.5} 
            onChange={val => onUpdateConfig({ speed: val })} 
          />
          <ControlStepper 
            label="Tam. Fonte" 
            value={config.fontSize} 
            min={20} max={150} step={4} 
            icon={<Type size={12} />}
            onChange={val => onUpdateConfig({ fontSize: val })} 
          />
          <ControlStepper 
            label="Margens (%)" 
            value={config.width} 
            min={30} max={100} step={5} 
            onChange={val => onUpdateConfig({ width: val })} 
          />
          <ControlStepper 
            label="Entrelinhas" 
            value={config.lineHeight} 
            min={1} max={2.5} step={0.1} 
            onChange={val => onUpdateConfig({ lineHeight: val })} 
          />
        </div>

        {/* Studio Tools Bar */}
        <div className="bg-[#12131C] p-3 rounded-xl border border-gray-800/90 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase font-bold tracking-wider text-amber-500 mr-1 flex items-center gap-1">
              Estúdio:
            </span>

            {/* Remote QR Code Button */}
            {onOpenRemotePair && (
              <button
                onClick={onOpenRemotePair}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
                  controllersCount > 0
                    ? 'bg-emerald-950/60 border-emerald-600 text-emerald-300 hover:bg-emerald-900/60'
                    : 'bg-[#1E2030] border-gray-700 hover:bg-gray-700 text-gray-200'
                }`}
                title="Conectar smartphone como controle remoto sem fio"
              >
                <Smartphone size={14} className={controllersCount > 0 ? 'text-emerald-400' : 'text-amber-400'} />
                <span>Controle Remoto</span>
                {controllersCount > 0 && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-0.5"></span>
                )}
              </button>
            )}

            {/* Escaleta / Blocos Button */}
            {onOpenEscaleta && (
              <button
                onClick={onOpenEscaleta}
                className="px-3 py-1.5 bg-[#1E2030] hover:bg-gray-700 border border-gray-700 rounded-lg text-xs font-semibold text-gray-200 flex items-center gap-1.5 transition-colors"
                title="Abrir escaleta de blocos do roteiro"
              >
                <ListOrdered size={14} className="text-amber-400" />
                <span>Escaleta {blocksCount > 0 ? `(${blocksCount})` : ''}</span>
              </button>
            )}

            {/* Camera Overlay & Recorder Button */}
            {onToggleCamera && (
              <button
                onClick={onToggleCamera}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
                  isCameraActive
                    ? 'bg-red-950/70 border-red-500 text-red-300 hover:bg-red-900/70 shadow-sm'
                    : 'bg-[#1E2030] border-gray-700 hover:bg-gray-700 text-gray-200'
                }`}
                title="Ativar câmera frontal e gravação direta no app"
              >
                <Video size={14} className={isCameraActive ? 'text-red-400' : 'text-gray-400'} />
                <span>{isCameraActive ? 'Câmera Ativa' : 'Câmera & Gravação'}</span>
              </button>
            )}

            {/* Smart Follow Speech Recognition */}
            {onToggleVoiceFollow && (
              <button
                onClick={onToggleVoiceFollow}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
                  isVoiceFollowActive
                    ? 'bg-indigo-950/70 border-indigo-500 text-indigo-300 hover:bg-indigo-900/70'
                    : 'bg-[#1E2030] border-gray-700 hover:bg-gray-700 text-gray-200'
                }`}
                title="Acompanhar texto automaticamente pela voz"
              >
                <Mic size={14} className={isVoiceFollowActive ? 'text-indigo-400' : 'text-gray-400'} />
                <span>{isVoiceFollowActive ? 'Voz Sincronizada' : 'Smart Follow (Voz)'}</span>
              </button>
            )}

            {/* Custom Keyboard Shortcuts & Pedal Mapping */}
            {onOpenShortcuts && (
              <button
                onClick={onOpenShortcuts}
                className="px-3 py-1.5 bg-[#1E2030] hover:bg-gray-700 border border-gray-700 hover:border-amber-500/50 rounded-lg text-xs font-semibold text-gray-200 flex items-center gap-1.5 transition-colors"
                title="Configurar atalhos de teclado e mapeamento de pedais Bluetooth"
              >
                <Keyboard size={14} className="text-amber-400" />
                <span>Atalhos & Pedais</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Countdown Duration Selector */}
            <div className="flex items-center gap-1.5 bg-[#1E2030] border border-gray-700 px-2.5 py-1 rounded-lg text-xs">
              <Timer size={13} className="text-amber-400" />
              <span className="text-gray-400 text-[11px]">Contagem:</span>
              <select
                value={config.countdownDuration ?? 3}
                onChange={(e) => onUpdateConfig({ countdownDuration: Number(e.target.value) })}
                className="bg-transparent text-amber-300 font-bold focus:outline-none cursor-pointer"
              >
                <option value={0} className="bg-[#151622] text-white">Desativada</option>
                <option value={3} className="bg-[#151622] text-white">3 seg (Padrão)</option>
                <option value={5} className="bg-[#151622] text-white">5 seg</option>
                <option value={10} className="bg-[#151622] text-white">10 seg</option>
              </select>
            </div>

            {/* Target time in minutes */}
            <div className="flex items-center gap-1.5 bg-[#1E2030] border border-gray-700 px-2.5 py-1 rounded-lg text-xs">
              <span className="text-gray-400 text-[11px]">Meta:</span>
              <input
                type="number"
                min="0"
                max="60"
                step="1"
                placeholder="Livre"
                value={config.targetMinutes || ''}
                onChange={(e) => onUpdateConfig({ targetMinutes: Math.max(0, Number(e.target.value)) })}
                className="w-12 bg-transparent text-amber-300 font-bold text-center focus:outline-none"
                title="Meta de tempo limite em minutos (0 = livre)"
              />
              <span className="text-gray-500 text-[11px]">min</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between bg-[#1E2030] p-4 rounded-xl border border-gray-800 gap-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full">
             <label className="flex items-center gap-2 text-sm text-gray-300 font-medium cursor-pointer">
               <input type="checkbox" checked={config.mirrorX} onChange={e => onUpdateConfig({ mirrorX: e.target.checked })} className="accent-amber-500 w-4 h-4 rounded text-amber-500 bg-gray-800 border-none ring-0"/> Espelhar Horizontal (X)
             </label>
             <label className="flex items-center gap-2 text-sm text-gray-300 font-medium cursor-pointer">
               <input type="checkbox" checked={config.mirrorY} onChange={e => onUpdateConfig({ mirrorY: e.target.checked })} className="accent-amber-500 w-4 h-4 rounded" /> Espelhar Vertical (Y)
             </label>
             <label className="flex items-center gap-2 text-sm text-amber-300 font-medium cursor-pointer sm:ml-4 sm:border-l sm:border-gray-700 sm:pl-4">
               <input type="checkbox" checked={config.voiceControl} onChange={e => onUpdateConfig({ voiceControl: e.target.checked })} className="accent-amber-500 w-4 h-4 rounded" /> Controle de Voz API
             </label>
          </div>
          <div className="flex gap-2 w-full lg:w-auto overflow-x-auto pb-1 lg:pb-0">
             <select 
               value={config.theme} 
               onChange={e => onUpdateConfig({ theme: e.target.value as AppTheme })}
               className="bg-black text-sm text-gray-300 px-3 py-1.5 rounded-lg border border-gray-700 focus:outline-none"
             >
               <option value={AppTheme.STUDIO}>Modo Studio</option>
               <option value={AppTheme.DARK}>Escuro Refinado</option>
               <option value={AppTheme.LIGHT}>Claro Contraste</option>
               <option value={AppTheme.CONTRAST}>Alto Contraste Branco</option>
             </select>
             
             <select 
               value={config.columnMode} 
               onChange={e => onUpdateConfig({ columnMode: e.target.value as 'single' | 'double' })}
               className="bg-black text-sm text-gray-300 px-3 py-1.5 rounded-lg border border-gray-700 focus:outline-none"
             >
               <option value="single">Coluna Única</option>
               <option value="double">Coluna Dupla (Side-by-side)</option>
             </select>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center justify-between text-xs text-gray-500 font-mono gap-2 pt-2 border-t border-gray-800/80">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span>Atalhos: [Espaço] Play/Pausa • [↑/↓] Vel. • [←/→] ±5s • [[/]] Fonte • [F] Tela Cheia • [R] Reiniciar</span>
          </div>
          {onOpenShortcuts && (
            <button
              onClick={onOpenShortcuts}
              className="text-amber-400 hover:text-amber-300 underline decoration-dotted text-xs font-sans font-medium flex items-center gap-1 transition-colors"
            >
              <Keyboard size={13} />
              Personalizar atalhos e pedais
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
