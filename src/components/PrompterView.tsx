import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { PrompterConfig, AppTheme, SavedScript, Bookmark } from '../types';
import ControlsHud from './ControlsHud';
import CountdownOverlay from './CountdownOverlay';
import EscaletaDrawer from './EscaletaDrawer';
import CameraRecorder from './CameraRecorder';
import VoiceFollowTracker from './VoiceFollowTracker';
import RemotePairModal from './RemotePairModal';
import ShortcutsModal, { DEFAULT_KEY_BINDINGS } from './ShortcutsModal';
import { Pause, Play, Smartphone, ListOrdered, Clock } from 'lucide-react';
import { parseScriptBlocks, formatTime } from '../utils';

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

  // Advanced Studio State
  const [showCountdown, setShowCountdown] = useState(false);
  const [isEscaletaOpen, setIsEscaletaOpen] = useState(false);
  const [isRemoteModalOpen, setIsRemoteModalOpen] = useState(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(config.cameraEnabled || false);
  const [cameraOpacity, setCameraOpacity] = useState(config.cameraOpacity || 35);
  const [isVoiceFollowActive, setIsVoiceFollowActive] = useState(config.voiceFollowEnabled || false);
  const [activeLineIndex, setActiveLineIndex] = useState(0);

  // Parse Script Blocks for Escaleta
  const blocks = useMemo(() => parseScriptBlocks(script.content), [script.content]);

  // WebSocket Remote Pairing
  const [roomCode, setRoomCode] = useState<string>(() => {
    const cached = sessionStorage.getItem('tp_room_code');
    if (cached) return cached;
    const generated = 'STUDIO-' + Math.floor(1000 + Math.random() * 9000);
    sessionStorage.setItem('tp_room_code', generated);
    return generated;
  });
  const [controllersCount, setControllersCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);

  // Screen Orientation Unlocking
  useEffect(() => {
    if (typeof screen !== 'undefined' && screen.orientation && typeof (screen.orientation as any).unlock === 'function') {
      try {
        (screen.orientation as any).unlock();
      } catch {
        // Ignored
      }
    }
  }, []);

  // Connect to Remote Control WebSocket Server
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws-remote`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'join',
        room: roomCode,
        role: 'host'
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'room_status') {
          setControllersCount(msg.controllersCount || 0);
        } else if (msg.type === 'command') {
          handleRemoteCommand(msg.action);
        }
      } catch (err) {
        console.error('Remote WS msg error:', err);
      }
    };

    wsRef.current = ws;

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [roomCode]);

  // Broadcast state to remote controllers
  const syncStateToRemote = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'sync_state',
        isPlaying,
        speed: config.speed,
        fontSize: config.fontSize,
        progressPercent: progress,
        scriptTitle: script.title,
        estimatedRemaining: estimatedRemainingSeconds
      }));
    }
  }, [isPlaying, config.speed, config.fontSize, progress, script.title, estimatedRemainingSeconds]);

  useEffect(() => {
    syncStateToRemote();
  }, [isPlaying, config.speed, config.fontSize, Math.round(progress), syncStateToRemote]);

  // Handle Play/Pause with optional Countdown
  const triggerTogglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
      setShowCountdown(false);
    } else {
      if (config.countdownDuration && config.countdownDuration > 0) {
        setShowCountdown(true);
      } else {
        setIsPlaying(true);
      }
    }
  };

  // Remote Commands Dispatcher
  const handleRemoteCommand = (action: string) => {
    switch (action) {
      case 'toggle_play':
        triggerTogglePlay();
        break;
      case 'play':
        if (!isPlaying) triggerTogglePlay();
        break;
      case 'pause':
        setIsPlaying(false);
        setShowCountdown(false);
        break;
      case 'speed_up':
        onUpdateConfig({ speed: Math.min(10, config.speed + 0.5) });
        break;
      case 'speed_down':
        onUpdateConfig({ speed: Math.max(0.5, config.speed - 0.5) });
        break;
      case 'font_up':
        onUpdateConfig({ fontSize: Math.min(150, config.fontSize + 4) });
        break;
      case 'font_down':
        onUpdateConfig({ fontSize: Math.max(20, config.fontSize - 4) });
        break;
      case 'restart':
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
        break;
      case 'rewind':
        if (scrollRef.current) {
          const px = config.speed * 20 * 5;
          scrollRef.current.scrollTop -= px;
        }
        break;
      case 'fast_forward':
        if (scrollRef.current) {
          const px = config.speed * 20 * 5;
          scrollRef.current.scrollTop += px;
        }
        break;
    }
  };

  // Theme styling
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

  // Content Renderer with visual cue markers
  const renderContent = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, i) => {
      if (!line.trim()) return <br key={i} />;
      const parts = line.split(/(\[PAUSA\]|\[ÊNFASE:[^\]]+\]|\[CUE:[^\]]+\]|\[NOTA:[^\]]+\]|\[BLOCO:[^\]]+\])/g);
      
      const renderedParts = parts.map((part, j) => {
        if (part === '[PAUSA]') {
          return (
            <div key={j} className="my-10 border-t border-amber-500 flex justify-center">
              <Pause className="w-8 h-8 text-amber-500 -mt-4 bg-inherit px-2" />
            </div>
          );
        }
        if (part.startsWith('[ÊNFASE:')) {
          return <strong key={j} className="text-amber-500 font-bold">{part.slice(8, -1)}</strong>;
        }
        if (part.startsWith('[CUE:')) {
          return (
            <div key={j} className="float-right clear-right bg-blue-900/40 text-blue-300 p-3 rounded-lg text-sm w-64 ml-8 mb-4 border border-blue-500 shadow-xl" style={{fontSize: 'max(14px, 0.4em)'}}>
              {part.slice(5, -1)}
            </div>
          );
        }
        if (part.startsWith('[NOTA:')) {
          return <span key={j} className="text-gray-500 italic block my-4" style={{fontSize: 'max(16px, 0.6em)'}}>{part.slice(6, -1)}</span>;
        }
        if (part.startsWith('[BLOCO:')) {
          return (
            <div key={j} className="my-6 border-l-4 border-amber-500 pl-3 py-1 bg-amber-500/10 text-amber-400 font-bold text-sm tracking-wider uppercase">
              {part.slice(7, -1)}
            </div>
          );
        }
        return <span key={j}>{part}</span>;
      });
      return <p key={i} className="mb-4">{renderedParts}</p>;
    });
  };

  // Smooth Scroll Engine
  const animate = useCallback((time: number) => {
    if (lastTimeRef.current !== undefined && isPlaying && scrollRef.current) {
      const delta = time - lastTimeRef.current;
      const scrollAmount = (config.speed * 20) * (delta / 1000);
      scrollRef.current.scrollTop += scrollAmount;

      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const maxScroll = Math.max(1, scrollHeight - clientHeight);
      const currProgress = (scrollTop / maxScroll) * 100;
      setProgress(Math.min(100, Math.max(0, currProgress)));

      const pixelsRemaining = maxScroll - scrollTop;
      const pxPerSec = config.speed * 20;
      setEstimatedRemainingSeconds(pxPerSec > 0 ? pixelsRemaining / pxPerSec : 0);

      // Estimate active line index
      const totalLines = script.content.split('\n').length;
      const approxLine = Math.floor((scrollTop / maxScroll) * totalLines);
      setActiveLineIndex(approxLine);
    }
    lastTimeRef.current = time;
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(animate);
    }
  }, [isPlaying, config.speed, script.content]);

  useEffect(() => {
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(animate);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      lastTimeRef.current = undefined;
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, animate]);

  const handleManualScroll = () => {
    if (scrollRef.current && !isPlaying) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const maxScroll = Math.max(1, scrollHeight - clientHeight);
      setProgress(Math.min(100, Math.max(0, (scrollTop / maxScroll) * 100)));

      const totalLines = script.content.split('\n').length;
      const approxLine = Math.floor((scrollTop / maxScroll) * totalLines);
      setActiveLineIndex(approxLine);
    }
  };

  // Jump to specific line (used by Voice Follow and Escaleta)
  const jumpToLine = (targetLine: number) => {
    if (scrollRef.current) {
      const totalLines = script.content.split('\n').length;
      const { scrollHeight, clientHeight } = scrollRef.current;
      const maxScroll = Math.max(1, scrollHeight - clientHeight);
      const targetScroll = (targetLine / Math.max(1, totalLines)) * maxScroll;
      
      scrollRef.current.scrollTo({
        top: targetScroll,
        behavior: 'smooth'
      });
    }
  };

  // Keyboard Shortcuts & Pedals (Dynamic Custom Mappings)
  useEffect(() => {
    const bindings = {
      ...DEFAULT_KEY_BINDINGS,
      ...(config.customKeyBindings || {})
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const code = e.code;

      // Play / Pause check
      if (bindings.playPause?.includes(code)) {
        e.preventDefault();
        triggerTogglePlay();
        return;
      }

      // Speed Up check
      if (bindings.speedUp?.includes(code)) {
        e.preventDefault();
        onUpdateConfig({ speed: Math.min(10, Math.round((config.speed + 0.5) * 10) / 10) });
        return;
      }

      // Speed Down check
      if (bindings.speedDown?.includes(code)) {
        e.preventDefault();
        onUpdateConfig({ speed: Math.max(0.5, Math.round((config.speed - 0.5) * 10) / 10) });
        return;
      }

      // Restart check
      if (bindings.restart?.includes(code)) {
        e.preventDefault();
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
        return;
      }

      // Rewind check
      if (bindings.rewind?.includes(code)) {
        e.preventDefault();
        if (scrollRef.current) {
          const pxToJump = config.speed * 20 * 5;
          scrollRef.current.scrollTop = Math.max(0, scrollRef.current.scrollTop - pxToJump);
        }
        return;
      }

      // Fast Forward check
      if (bindings.fastForward?.includes(code)) {
        e.preventDefault();
        if (scrollRef.current) {
          const pxToJump = config.speed * 20 * 5;
          scrollRef.current.scrollTop += pxToJump;
        }
        return;
      }

      // Standard Navigation & Prompter Utilities
      switch (code) {
        case 'BracketLeft':
          onUpdateConfig({ fontSize: Math.max(20, config.fontSize - 4) });
          break;
        case 'BracketRight':
          onUpdateConfig({ fontSize: Math.min(150, config.fontSize + 4) });
          break;
        case 'KeyF':
          if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
          else if (document.exitFullscreen) document.exitFullscreen?.();
          break;
        case 'Escape':
          if (document.fullscreenElement) {
            document.exitFullscreen?.().then(() => onClose()).catch(() => onClose());
          } else {
            onClose();
          }
          break;
        case 'KeyB':
          if (scrollRef.current) {
            setBookmarks(prev => [...prev, { id: Date.now().toString(), scrollPosition: scrollRef.current!.scrollTop, createdAt: Date.now() }]);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [config, isPlaying, onClose, onUpdateConfig, bookmarks]);

  // Bluetooth Gamepad / Foot Pedal Poller with Custom Button Mapping
  useEffect(() => {
    if (config.pedalShortcutsEnabled === false) return;

    const bindings = {
      ...DEFAULT_KEY_BINDINGS,
      ...(config.customKeyBindings || {})
    };
    const playBtnIdx = bindings.pedalPlayButton ?? 0;
    const speedUpBtnIdx = bindings.pedalSpeedUpButton ?? 12;
    const speedDownBtnIdx = bindings.pedalSpeedDownButton ?? 13;

    let gamepadInterval: NodeJS.Timeout | null = null;
    let lastButtonState = false;
    let lastSpeedUpState = false;
    let lastSpeedDownState = false;

    gamepadInterval = setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.getGamepads) {
        const gamepads = navigator.getGamepads();
        for (const gp of gamepads) {
          if (gp && gp.buttons) {
            // Mapped Pedal Play/Pause Button (default 0)
            const isPlayPressed = !!gp.buttons[playBtnIdx]?.pressed;
            if (isPlayPressed && !lastButtonState) {
              triggerTogglePlay();
            }
            lastButtonState = isPlayPressed;

            // Mapped Speed Up Button (default 12 / D-Pad Up)
            const isSpeedUpPressed = !!gp.buttons[speedUpBtnIdx]?.pressed;
            if (isSpeedUpPressed && !lastSpeedUpState) {
              onUpdateConfig({ speed: Math.min(10, Math.round((config.speed + 0.5) * 10) / 10) });
            }
            lastSpeedUpState = isSpeedUpPressed;

            // Mapped Speed Down Button (default 13 / D-Pad Down)
            const isSpeedDownPressed = !!gp.buttons[speedDownBtnIdx]?.pressed;
            if (isSpeedDownPressed && !lastSpeedDownState) {
              onUpdateConfig({ speed: Math.max(0.5, Math.round((config.speed - 0.5) * 10) / 10) });
            }
            lastSpeedDownState = isSpeedDownPressed;
          }
        }
      }
    }, 120);

    return () => {
      if (gamepadInterval) clearInterval(gamepadInterval);
    };
  }, [config, isPlaying]);

  const formatRemainingTime = () => {
    return formatTime(estimatedRemainingSeconds);
  };

  // Target time pacing check
  const targetSeconds = (config.targetMinutes || 0) * 60;
  const isPacingOvertime = targetSeconds > 0 && estimatedRemainingSeconds > targetSeconds;

  return (
    <div className={`fixed inset-0 overflow-hidden flex flex-col font-mono selection:bg-amber-500/30 ${getThemeClasses()}`}>
      {/* Studio Theme Scanlines */}
      {config.theme === AppTheme.STUDIO && <div className="scanlines pointer-events-none"></div>}

      {/* Integrated Camera Background Video & Recording */}
      <CameraRecorder
        isEnabled={isCameraActive}
        opacity={cameraOpacity}
        onToggleEnabled={(enabled) => setIsCameraActive(enabled)}
        onChangeOpacity={(op) => setCameraOpacity(op)}
      />

      {/* Live Recording Pulsing Studio Badge */}
      {config.theme === AppTheme.STUDIO && isPlaying && (
        <div className="absolute top-8 right-8 z-30 flex items-center gap-2 bg-red-600/10 border border-red-500/30 px-3 py-1 rounded-full animate-pulse backdrop-blur">
          <div className="w-3 h-3 bg-red-500 rounded-full"></div>
          <span className="text-red-500 font-bold tracking-widest text-sm">NO AR</span>
        </div>
      )}

      {/* Progress Bar & Time */}
      {config.showProgressBar && (
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gray-900 z-30">
          <div className="h-full bg-amber-500 transition-all duration-300" style={{ width: `${progress}%` }}></div>
        </div>
      )}

      {/* Time Remaining & Target Pacing Bar */}
      {config.showTimeRemaining && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2">
          <div className="bg-black/70 backdrop-blur px-3 py-1 rounded-md text-amber-500 font-mono text-sm shadow-xl border border-gray-800 flex items-center gap-1.5">
            <Clock size={13} />
            <span>-{formatRemainingTime()}</span>
          </div>

          {targetSeconds > 0 && (
            <div className={`px-2.5 py-1 rounded-md text-xs font-bold font-mono border backdrop-blur ${
              isPacingOvertime
                ? 'bg-red-950/80 border-red-500 text-red-300 animate-pulse'
                : 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
            }`}>
              Meta: {config.targetMinutes}m • {isPacingOvertime ? 'Ritmo Lento' : 'No Ritmo'}
            </div>
          )}
        </div>
      )}

      {/* The Scrollable Prompter Area */}
      <div 
        ref={scrollRef}
        onScroll={handleManualScroll}
        onDoubleClick={triggerTogglePlay}
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

      {/* Visual Central Reading Marker */}
      {config.highlightCurrentLine && (
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-amber-500/30 z-0 pointer-events-none before:content-[''] before:absolute before:-top-4 before:left-0 before:w-full before:h-8 before:bg-gradient-to-b before:from-transparent before:via-amber-500/5 before:to-transparent">
          <div className="absolute top-1/2 left-4 -translate-y-1/2 w-0 h-0 border-y-[6px] border-y-transparent border-l-[8px] border-l-amber-500"></div>
          <div className="absolute top-1/2 right-4 -translate-y-1/2 w-0 h-0 border-y-[6px] border-y-transparent border-r-[8px] border-r-amber-500"></div>
        </div>
      )}

      {/* Voice Follow Speech Recognition Module */}
      <VoiceFollowTracker
        isEnabled={isVoiceFollowActive}
        scriptContent={script.content}
        onJumpToLine={jumpToLine}
        onToggleVoice={(en) => setIsVoiceFollowActive(en)}
      />

      {/* Floating Action Buttons: Remote Quick-Pair & Escaleta & Play */}
      <div className="absolute bottom-8 right-8 z-40 flex items-center gap-3">
        {/* Remote Pairing Quick Icon */}
        <button
          onClick={() => setIsRemoteModalOpen(true)}
          className={`p-3.5 rounded-full border shadow-2xl transition-all hover:scale-105 active:scale-95 ${
            controllersCount > 0
              ? 'bg-emerald-900/90 border-emerald-500 text-emerald-300'
              : 'bg-[#1E2030]/90 border-gray-700 text-gray-300 hover:text-amber-400'
          }`}
          title={controllersCount > 0 ? `${controllersCount} celular(es) conectado(s)` : 'Conectar controle remoto via QR Code'}
        >
          <Smartphone size={20} />
        </button>

        {/* Escaleta Quick Drawer Button */}
        <button
          onClick={() => setIsEscaletaOpen(true)}
          className="p-3.5 bg-[#1E2030]/90 hover:bg-gray-700 border border-gray-700 rounded-full text-gray-300 hover:text-amber-400 shadow-2xl transition-all hover:scale-105 active:scale-95"
          title="Abrir escaleta de blocos"
        >
          <ListOrdered size={20} />
        </button>

        {/* Main Floating Play/Pause Button */}
        <button 
          onClick={triggerTogglePlay}
          className={`w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-all hover:scale-105 active:scale-95 ${
            isPlaying 
              ? 'bg-[#1E2030] text-amber-500 border border-amber-500/30' 
              : 'bg-amber-500 text-[#0A0A0F] shadow-amber-500/20'
          }`}
        >
          {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
        </button>
      </div>

      {/* Countdown Overlay (3, 2, 1, AÇÃO!) */}
      {showCountdown && (
        <CountdownOverlay
          durationSeconds={config.countdownDuration || 3}
          onComplete={() => {
            setShowCountdown(false);
            setIsPlaying(true);
          }}
          onCancel={() => setShowCountdown(false)}
        />
      )}

      {/* Escaleta / Blocks Drawer */}
      <EscaletaDrawer
        isOpen={isEscaletaOpen}
        onClose={() => setIsEscaletaOpen(false)}
        blocks={blocks}
        activeLineIndex={activeLineIndex}
        onSelectBlock={(block) => jumpToLine(block.lineIndex)}
      />

      {/* QR Code Remote Pairing Modal */}
      <RemotePairModal
        isOpen={isRemoteModalOpen}
        onClose={() => setIsRemoteModalOpen(false)}
        roomCode={roomCode}
        onChangeRoomCode={(newCode) => {
          setRoomCode(newCode);
          sessionStorage.setItem('tp_room_code', newCode);
        }}
        controllersCount={controllersCount}
      />

      {/* Complete Controls HUD */}
      <ControlsHud 
        config={config} 
        onUpdateConfig={onUpdateConfig} 
        isPlaying={isPlaying} 
        onTogglePlay={triggerTogglePlay}
        onReset={() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }}
        onClose={onClose}
        onOpenRemotePair={() => setIsRemoteModalOpen(true)}
        controllersCount={controllersCount}
        onOpenEscaleta={() => setIsEscaletaOpen(true)}
        blocksCount={blocks.length}
        onToggleCamera={() => setIsCameraActive(!isCameraActive)}
        isCameraActive={isCameraActive}
        onToggleVoiceFollow={() => setIsVoiceFollowActive(!isVoiceFollowActive)}
        isVoiceFollowActive={isVoiceFollowActive}
        onOpenShortcuts={() => setIsShortcutsModalOpen(true)}
      />

      {/* Keyboard & Bluetooth Pedal Mapping Modal */}
      <ShortcutsModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
        bindings={config.customKeyBindings || DEFAULT_KEY_BINDINGS}
        onSaveBindings={(newBindings) => {
          onUpdateConfig({ customKeyBindings: newBindings });
        }}
        pedalEnabled={config.pedalShortcutsEnabled ?? true}
        onTogglePedal={(enabled) => {
          onUpdateConfig({ pedalShortcutsEnabled: enabled });
        }}
      />
    </div>
  );
}
