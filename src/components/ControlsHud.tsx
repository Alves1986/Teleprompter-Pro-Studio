import { useState, useEffect, useRef } from 'react';
import { PrompterConfig, AppTheme } from '../types';
import { Settings, Maximize, Minimize, SkipBack, X, Moon, Sun, Type, SlidersHorizontal, MonitorOff, Plus, Minus } from 'lucide-react';

interface Props {
  config: PrompterConfig;
  onUpdateConfig: (cfg: Partial<PrompterConfig>) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onReset: () => void;
  onClose: () => void;
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

export default function ControlsHud({ config, onUpdateConfig, isPlaying, onTogglePlay, onReset, onClose }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

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
           <div className="flex gap-2 w-full sm:w-auto shrink-0 justify-end">
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
        
        <div className="flex justify-center text-xs text-gray-600 font-mono">
           Atalhos: [Space] Play/Pause • [↑/↓] Vel. • [←/→] Avançar/Rcuar 5s • [[/]] Tamanho Fonte • [F] Tela Cheia • [R] Reiniciar • [B] Bookmark • [N/P] Navegar Bookmarks
        </div>
      </div>
    </div>
  );
}
