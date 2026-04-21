import { useState, useEffect, useRef, useCallback } from 'react';
import { PrompterConfig, AppTheme, SavedScript, Bookmark } from '../types';
import ControlsHud from './ControlsHud';
import { Pause, Play } from 'lucide-react';

interface Props {
  script: SavedScript;
  config: PrompterConfig;
  onUpdateConfig: (cfg: Partial<PrompterConfig>) => void;
  onClose: () => void;
}

export default function PrompterView({ script, config, onUpdateConfig, onClose }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [estimatedRemainingSeconds, setEstimatedRemainingSeconds] = useState(0);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const requestRef = useRef<number>();
  const lastTimeRef = useRef<number>();

  const getThemeClasses = () => {
    switch (config.theme) {
      case AppTheme.STUDIO: return 'bg-[#0A0A0F] text-gray-200';
      case AppTheme.LIGHT: return 'bg-white text-black';
      case AppTheme.CONTRAST: return 'bg-black text-white font-extrabold';
      case AppTheme.DARK:
      default: return 'bg-slate-900 text-white';
    }
  };

  const getTransformClasses = () => {
    const classes = [];
    if (config.mirrorX) classes.push('prompter-mirror-x');
    if (config.mirrorY) classes.push('prompter-mirror-y');
    if (config.mirrorX && config.mirrorY) return 'prompter-mirror-both';
    return classes.join(' ');
  };

  // Marker parsing logic
  const renderContent = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, i) => {
       if (!line.trim()) return <br key={i} />;
       const parts = line.split(/(\[PAUSA\]|\[ÊNFASE:[^\]]+\]|\[CUE:[^\]]+\]|\[NOTA:[^\]]+\])/g);
       
       const renderedParts = parts.map((part, j) => {
         if (part === '[PAUSA]') return <div key={j} className="my-10 border-t border-amber-500 flex justify-center"><Pause className="w-8 h-8 text-amber-500 -mt-4 bg-inherit px-2"/></div>;
         if (part.startsWith('[ÊNFASE:')) return <strong key={j} className="text-amber-500 font-bold">{part.slice(8, -1)}</strong>;
         if (part.startsWith('[CUE:')) return <div key={j} className="float-right clear-right bg-blue-900/40 text-blue-300 p-3 rounded-lg text-sm w-64 ml-8 mb-4 border border-blue-500 shadow-xl" style={{fontSize: 'max(14px, 0.4em)'}}>{part.slice(5, -1)}</div>;
         if (part.startsWith('[NOTA:')) return <span key={j} className="text-gray-500 italic block my-4" style={{fontSize: 'max(16px, 0.6em)'}}>{part.slice(6, -1)}</span>;
         return <span key={j}>{part}</span>;
       });
       return <p key={i} className="mb-4">{renderedParts}</p>;
    });
  };

  // Scroll Engine
  const animate = useCallback((time: number) => {
    if (lastTimeRef.current !== undefined && isPlaying && scrollRef.current) {
      const delta = time - lastTimeRef.current;
      const scrollAmount = (config.speed * 20) * (delta / 1000);
      scrollRef.current.scrollTop += scrollAmount;

      // Progress calculation
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const maxScroll = Math.max(1, scrollHeight - clientHeight);
      const currProgress = (scrollTop / maxScroll) * 100;
      setProgress(Math.min(100, Math.max(0, currProgress)));

      // Time remaining calculation
      const pixelsRemaining = maxScroll - scrollTop;
      const pxPerSec = config.speed * 20;
      setEstimatedRemainingSeconds(pxPerSec > 0 ? pixelsRemaining / pxPerSec : 0);
    }
    lastTimeRef.current = time;
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(animate);
    }
  }, [isPlaying, config.speed]);

  useEffect(() => {
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(animate);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      lastTimeRef.current = undefined; // reset on pause to avoid large delta
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, animate]);

  // Sync scroll positions when not actively using animation frame (e.g., initial mount or manual scroll)
  const handleManualScroll = () => {
      if (scrollRef.current && !isPlaying) {
          const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
          const maxScroll = Math.max(1, scrollHeight - clientHeight);
          setProgress(Math.min(100, Math.max(0, (scrollTop / maxScroll) * 100)));
      }
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch(e.code) {
        case 'Space': 
          e.preventDefault();
          setIsPlaying(p => !p); 
          break;
        case 'ArrowUp': 
          e.preventDefault();
          onUpdateConfig({ speed: Math.max(0, config.speed + 0.5) }); 
          break;
        case 'ArrowDown': 
          e.preventDefault();
          onUpdateConfig({ speed: Math.max(0, config.speed - 0.5) }); 
          break;
        case 'BracketLeft':
          onUpdateConfig({ fontSize: Math.max(20, config.fontSize - 4) }); 
          break;
        case 'BracketRight':
          onUpdateConfig({ fontSize: Math.min(150, config.fontSize + 4) }); 
          break;
        case 'KeyR':
          if (scrollRef.current) scrollRef.current.scrollTop = 0;
          break;
        case 'KeyF':
          if (!document.fullscreenElement) document.documentElement.requestFullscreen();
          else if (document.exitFullscreen) document.exitFullscreen();
          break;
        case 'Escape':
          if (document.fullscreenElement) {
              document.exitFullscreen().then(() => onClose());
          } else {
              onClose();
          }
          break;
        case 'ArrowLeft':
            if (scrollRef.current) {
                const pxToJump = config.speed * 20 * 5; // 5 seconds worth
                scrollRef.current.scrollTop -= pxToJump;
            }
            break;
        case 'ArrowRight':
            if (scrollRef.current) {
                const pxToJump = config.speed * 20 * 5; 
                scrollRef.current.scrollTop += pxToJump;
            }
            break;
        case 'KeyB':
             if (scrollRef.current) {
                 setBookmarks(prev => [...prev, { id: Date.now().toString(), scrollPosition: scrollRef.current!.scrollTop, createdAt: Date.now() }]);
             }
             break;
        case 'KeyN':
             if (scrollRef.current && bookmarks.length > 0) {
                 const curr = scrollRef.current.scrollTop;
                 const next = bookmarks.filter(b => b.scrollPosition > curr + 10).sort((a,b) => a.scrollPosition - b.scrollPosition)[0];
                 if (next) scrollRef.current.scrollTop = next.scrollPosition;
             }
             break;
        case 'KeyP':
             if (scrollRef.current && bookmarks.length > 0) {
                 const curr = scrollRef.current.scrollTop;
                 const prev = bookmarks.filter(b => b.scrollPosition < curr - 10).sort((a,b) => b.scrollPosition - a.scrollPosition)[0];
                 if (prev) scrollRef.current.scrollTop = prev.scrollPosition;
             }
             break;
      }
      
      // Numbers 1-9 for percentage jump
      if (e.key >= '1' && e.key <= '9') {
          const percentage = parseInt(e.key) / 10;
          if (scrollRef.current) {
             const { scrollHeight, clientHeight } = scrollRef.current;
             scrollRef.current.scrollTop = (scrollHeight - clientHeight) * percentage;
          }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [config, isPlaying, onClose, onUpdateConfig, bookmarks]);

  // Voice control (Experimental)
  useEffect(() => {
    if (!config.voiceControl) return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Browser doe not support Speech Recognition");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.lang = 'pt-BR';

    let isStarted = false;
    try {
       recognition.start();
       isStarted = true;
    } catch(e) {}

    recognition.onresult = (event: any) => {
      const command = event.results[event.results.length - 1][0].transcript.toLowerCase();
      if (command.includes('rápido') || command.includes('faster')) {
        onUpdateConfig({ speed: Math.min(config.speed + 1, 10) });
      }
      if (command.includes('devagar') || command.includes('slower')) {
        onUpdateConfig({ speed: Math.max(config.speed - 1, 0) });
      }
      if (command.includes('pausar') || command.includes('pause')) {
        setIsPlaying(false);
      }
      if (command.includes('continuar') || command.includes('resume') || command.includes('play')) {
        setIsPlaying(true);
      }
    };
    return () => {
        if(isStarted) recognition.stop();
    };
  }, [config.voiceControl, config.speed, onUpdateConfig]);

  const formatRemainingTime = () => {
    const mins = Math.floor(estimatedRemainingSeconds / 60);
    const secs = Math.floor(estimatedRemainingSeconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`fixed inset-0 overflow-hidden flex flex-col font-mono selection:bg-amber-500/30 ${getThemeClasses()}`}>
      
      {/* Studio Theme Additions */}
      {config.theme === AppTheme.STUDIO && <div className="scanlines"></div>}
      {config.theme === AppTheme.STUDIO && isPlaying && (
        <div className="absolute top-8 right-8 z-50 flex items-center gap-2 bg-red-600/10 border border-red-500/30 px-3 py-1 rounded-full animate-pulse backdrop-blur">
          <div className="w-3 h-3 bg-red-500 rounded-full"></div>
          <span className="text-red-500 font-bold tracking-widest text-sm">REC</span>
        </div>
      )}

      {/* Progress Bar & Time */}
      {config.showProgressBar && (
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gray-900 z-50">
           <div className="h-full bg-amber-500 transition-all duration-300" style={{ width: `${progress}%` }}></div>
        </div>
      )}
      {config.showTimeRemaining && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-black/60 backdrop-blur px-3 py-1 rounded-md text-amber-500 font-mono text-sm shadow-xl border border-gray-800">
           -{formatRemainingTime()}
        </div>
      )}

      {/* The Scrollable Prompter Area */}
      <div 
        ref={scrollRef}
        onScroll={handleManualScroll}
        onDoubleClick={() => setIsPlaying(!isPlaying)}
        className={`flex-1 overflow-y-auto no-scrollbar pt-[50vh] pb-[50vh] relative z-10 ${getTransformClasses()}`}
        style={{ 
          fontSize: `${config.fontSize}px`, 
          lineHeight: config.lineHeight,
          letterSpacing: `${config.letterSpacing}px`
        }}
      >
         <div 
           className="mx-auto" 
           style={{ 
              width: `${config.width}%`,
              columnCount: config.columnMode === 'double' ? 2 : 1,
              columnGap: '8rem'
           }}
         >
           {/* If double column is active, rendering text flows top-to-bottom. 
               For a true mirror double-column that repeats text side-by-side, we would render the content twice in a grid.
               But CSS columns flows text naturally. Given "útil para apresentadores", we will render the exact same text twice side by side via Flex or Grid. */}
           {config.columnMode === 'single' ? (
              <div className="whitespace-pre-wrap">
                  {renderContent(script.content)}
              </div>
           ) : (
              <div className="flex gap-16">
                  <div className="flex-1 whitespace-pre-wrap">{renderContent(script.content)}</div>
                  <div className="flex-1 whitespace-pre-wrap border-l border-gray-800/50 pl-16 opacity-80">{renderContent(script.content)}</div>
              </div>
           )}
         </div>
      </div>

      {/* Visual Central Marker */}
      {config.highlightCurrentLine && (
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-amber-500/30 z-0 pointer-events-none before:content-[''] before:absolute before:-top-4 before:left-0 before:w-full before:h-8 before:bg-gradient-to-b before:from-transparent before:via-amber-500/5 before:to-transparent">
            {/* Edge triangles */}
            <div className="absolute top-1/2 left-4 -translate-y-1/2 w-0 h-0 border-y-[6px] border-y-transparent border-l-[8px] border-l-amber-500"></div>
            <div className="absolute top-1/2 right-4 -translate-y-1/2 w-0 h-0 border-y-[6px] border-y-transparent border-r-[8px] border-r-amber-500"></div>
        </div>
      )}

      {/* Bookmarks Edge Markers (Optional visual element) */}
      <div className="absolute top-0 right-0 w-2 h-full z-20 opacity-50 flex flex-col pointer-events-none">
          {bookmarks.map(b => {
             // simplified relative positioning attempt
             if(scrollRef.current){
                 const p = (b.scrollPosition / (scrollRef.current.scrollHeight - scrollRef.current.clientHeight)) * 100;
                 return <div key={b.id} className="absolute w-full h-1 bg-blue-500" style={{top: `${p}%`}}></div>
             }
             return null;
          })}
      </div>

      {/* Floating Play/Pause Button */}
      <div className={`absolute bottom-8 right-8 z-[60] transition-opacity duration-500 ${isPlaying ? 'opacity-20 hover:opacity-100' : 'opacity-100'}`}>
         <button 
           onClick={() => setIsPlaying(!isPlaying)}
           className={`w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-all hover:scale-105 active:scale-95 ${isPlaying ? 'bg-[#1E2030] text-amber-500 border border-amber-500/30' : 'bg-amber-500 text-[#0A0A0F] shadow-amber-500/20'}`}
         >
           {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
         </button>
      </div>

      <ControlsHud 
        config={config} 
        onUpdateConfig={onUpdateConfig} 
        isPlaying={isPlaying} 
        onTogglePlay={() => setIsPlaying(!isPlaying)}
        onReset={() => { if(scrollRef.current) scrollRef.current.scrollTop = 0; }}
        onClose={onClose}
      />
    </div>
  );
}
