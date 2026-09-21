import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { PrompterConfig, AppTheme, SavedScript, Bookmark } from '../types';
import ControlsHud from './ControlsHud';
import CountdownOverlay from './CountdownOverlay';
import EscaletaDrawer from './EscaletaDrawer';
import CameraRecorder from './CameraRecorder';
import VoiceFollowTracker from './VoiceFollowTracker';
import RemotePairModal from './RemotePairModal';
import ShortcutsModal, { DEFAULT_KEY_BINDINGS } from './ShortcutsModal';
import { Pause, Play, Smartphone, ListOrdered, Clock, Download, X } from 'lucide-react';
import { parseScriptBlocks, formatTime } from '../utils';
import { useOrientation } from '../hooks/useOrientation';
import { usePWAInstall } from '../hooks/usePWAInstall';
import InstallGuideModal from './InstallGuideModal';

interface Props {
  script: SavedScript;
  config: PrompterConfig;
  onUpdateConfig: (cfg: Partial<PrompterConfig>) => void;
  onClose: () => void;
  roomCode?: string;
  onChangeRoomCode?: (code: string) => void;
  autoPlay?: boolean;
}

export default function PrompterView({ 
  script, 
  config, 
  onUpdateConfig, 
  onClose,
  roomCode: propRoomCode,
  onChangeRoomCode,
  autoPlay = false
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [estimatedRemainingSeconds, setEstimatedRemainingSeconds] = useState(0);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const requestRef = useRef<number>();
  const lastTimeRef = useRef<number>();

  // Up-to-date refs to eliminate stale closures in WebSocket event handlers
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const configRef = useRef(config);
  configRef.current = config;

  const onUpdateConfigRef = useRef(onUpdateConfig);
  onUpdateConfigRef.current = onUpdateConfig;

  const progressRef = useRef(progress);
  progressRef.current = progress;

  const remainingRef = useRef(estimatedRemainingSeconds);
  remainingRef.current = estimatedRemainingSeconds;

  // Advanced Studio State
  const [showCountdown, setShowCountdown] = useState(false);
  const [isEscaletaOpen, setIsEscaletaOpen] = useState(false);
  const [isRemoteModalOpen, setIsRemoteModalOpen] = useState(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(config.cameraEnabled || false);
  const [cameraOpacity, setCameraOpacity] = useState(config.cameraOpacity || 35);
  const [isVoiceFollowActive, setIsVoiceFollowActive] = useState(config.voiceFollowEnabled || false);
  const [activeLineIndex, setActiveLineIndex] = useState(0);
  const pwaState = usePWAInstall();
  const [isInstallGuideOpen, setIsInstallGuideOpen] = useState(false);
  const [showTabletTip, setShowTabletTip] = useState(!pwaState.isInstalled && (pwaState.isTablet || pwaState.isMobile));

  // Parse Script Blocks for Escaleta
  const blocks = useMemo(() => parseScriptBlocks(script.content), [script.content]);

  // WebSocket Remote Pairing
  const [internalRoomCode, setInternalRoomCode] = useState<string>(() => {
    if (propRoomCode) return propRoomCode;
    const cached = sessionStorage.getItem('tp_room_code');
    if (cached) return cached;
    const generated = 'STUDIO-' + Math.floor(1000 + Math.random() * 9000);
    sessionStorage.setItem('tp_room_code', generated);
    return generated;
  });

  const roomCode = propRoomCode || internalRoomCode;
  const setRoomCode = (newCode: string) => {
    setInternalRoomCode(newCode);
    onChangeRoomCode?.(newCode);
    sessionStorage.setItem('tp_room_code', newCode);
  };
  const [controllersCount, setControllersCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);

  // Real-time automatic screen orientation detection (vertical vs horizontal)
  const orientationInfo = useOrientation();
  const [orientationNotice, setOrientationNotice] = useState<string | null>(null);
  const prevOrientationRef = useRef<string>(orientationInfo.orientation);

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

  // Automatic real-time orientation movement recognition
  useEffect(() => {
    if (prevOrientationRef.current !== orientationInfo.orientation) {
      prevOrientationRef.current = orientationInfo.orientation;
      const msg = orientationInfo.isLandscape
        ? 'Tela Horizontal (16:9) Detectada • Modo Panorâmico'
        : 'Tela Vertical (9:16) Detectada • Margens e Fonte Adaptadas';
      setOrientationNotice(msg);
      const timer = setTimeout(() => setOrientationNotice(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [orientationInfo.orientation, orientationInfo.isLandscape]);

  // Active orientation resolution: automatically follows sensor unless manually overridden
  const activeOrientation = (config.orientationMode && config.orientationMode !== 'auto')
    ? config.orientationMode
    : orientationInfo.orientation;
  const isLandscape = activeOrientation === 'landscape';
  const isPortrait = !isLandscape;

  // Responsive layout adaptation for vertical vs horizontal screens
  // When in portrait/vertical mode:
  // 1. Text width percentage expands so narrow phone screens or vertical displays don't have squished lines
  // 2. Double column collapses into single column to prevent squeezed unreadable text
  // 3. Font size adapts safely if screen is narrow
  const effectiveWidth = isPortrait ? Math.min(100, Math.max(config.width, 92)) : config.width;
  const effectiveColumnMode = isPortrait ? 'single' : config.columnMode;
  const effectiveFontSize = isPortrait && orientationInfo.width < 600
    ? Math.min(config.fontSize, Math.max(20, Math.round(orientationInfo.width * 0.11)))
    : config.fontSize;

  // Broadcast state to remote controllers
  const syncStateToRemote = useCallback((override?: Partial<{ isPlaying: boolean; speed: number; fontSize: number; progressPercent: number }>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'sync_state',
        isPlaying: override?.isPlaying !== undefined ? override.isPlaying : isPlayingRef.current,
        speed: override?.speed !== undefined ? override.speed : configRef.current.speed,
        fontSize: override?.fontSize !== undefined ? override.fontSize : configRef.current.fontSize,
        progressPercent: override?.progressPercent !== undefined ? override.progressPercent : progressRef.current,
        scriptTitle: script.title,
        estimatedRemaining: remainingRef.current
      }));
    }
  }, [script.title]);

  // Handle Play/Pause with optional Countdown
  const triggerTogglePlay = useCallback(() => {
    if (isPlayingRef.current) {
      setIsPlaying(false);
      setShowCountdown(false);
      syncStateToRemote({ isPlaying: false });
    } else {
      if (configRef.current.countdownDuration && configRef.current.countdownDuration > 0) {
        setShowCountdown(true);
      } else {
        setIsPlaying(true);
        syncStateToRemote({ isPlaying: true });
      }
    }
  }, [syncStateToRemote]);

  // Remote Commands Dispatcher
  const handleRemoteCommand = useCallback((action: string, payload?: any) => {
    switch (action) {
      case 'toggle_play':
        triggerTogglePlay();
        break;
      case 'play':
        if (!isPlayingRef.current) {
          if (configRef.current.countdownDuration && configRef.current.countdownDuration > 0) {
            setShowCountdown(true);
          } else {
            setIsPlaying(true);
            syncStateToRemote({ isPlaying: true });
          }
        }
        break;
      case 'pause':
        setIsPlaying(false);
        setShowCountdown(false);
        syncStateToRemote({ isPlaying: false });
        break;
      case 'speed_up': {
        const nextSpeed = Math.min(10, +(configRef.current.speed + 0.5).toFixed(1));
        onUpdateConfigRef.current({ speed: nextSpeed });
        syncStateToRemote({ speed: nextSpeed });
        break;
      }
      case 'speed_down': {
        const nextSpeed = Math.max(0.5, +(configRef.current.speed - 0.5).toFixed(1));
        onUpdateConfigRef.current({ speed: nextSpeed });
        syncStateToRemote({ speed: nextSpeed });
        break;
      }
      case 'font_up': {
        const nextFont = Math.min(150, configRef.current.fontSize + 4);
        onUpdateConfigRef.current({ fontSize: nextFont });
        syncStateToRemote({ fontSize: nextFont });
        break;
      }
      case 'font_down': {
        const nextFont = Math.max(20, configRef.current.fontSize - 4);
        onUpdateConfigRef.current({ fontSize: nextFont });
        syncStateToRemote({ fontSize: nextFont });
        break;
      }
      case 'restart':
        setIsPlaying(false);
        setShowCountdown(false);
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
        setProgress(0);
        syncStateToRemote({ isPlaying: false, progressPercent: 0 });
        break;
      case 'rewind':
        if (scrollRef.current) {
          const px = Math.max(80, (configRef.current.speed || 2) * 25 * 5);
          scrollRef.current.scrollTop = Math.max(0, scrollRef.current.scrollTop - px);
        }
        break;
      case 'fast_forward':
        if (scrollRef.current) {
          const px = Math.max(80, (configRef.current.speed || 2) * 25 * 5);
          const maxScroll = scrollRef.current.scrollHeight - scrollRef.current.clientHeight;
          scrollRef.current.scrollTop = Math.min(maxScroll, scrollRef.current.scrollTop + px);
        }
        break;
      case 'jump_cue':
        if (typeof payload?.lineIndex === 'number') {
          jumpToLine(payload.lineIndex);
        }
        break;
    }
  }, [triggerTogglePlay, syncStateToRemote]);

  const handleRemoteCommandRef = useRef(handleRemoteCommand);
  handleRemoteCommandRef.current = handleRemoteCommand;

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
      // Push state immediately upon joining
      syncStateToRemote();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'room_status') {
          setControllersCount(msg.controllersCount || 0);
        } else if (msg.type === 'request_sync') {
          syncStateToRemote();
        } else if (msg.type === 'command') {
          handleRemoteCommandRef.current(msg.action, msg.payload);
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
  }, [roomCode, syncStateToRemote]);

  useEffect(() => {
    syncStateToRemote();
  }, [isPlaying, config.speed, config.fontSize, Math.round(progress), syncStateToRemote]);

  // AutoPlay on mount if triggered from remote
  useEffect(() => {
    if (autoPlay) {
      if (config.countdownDuration && config.countdownDuration > 0) {
        setShowCountdown(true);
      } else {
        setIsPlaying(true);
      }
    }
  }, [autoPlay, config.countdownDuration]);

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
      return <div key={i} className="mb-4">{renderedParts}</div>;
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

      {/* Screen Orientation Auto-Recognition Notification Toast */}
      {orientationNotice && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 bg-black/90 backdrop-blur-md border border-amber-500/60 rounded-full text-amber-300 text-xs sm:text-sm font-semibold shadow-2xl flex items-center gap-2.5 animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-none">
          <Smartphone size={16} className={`transition-transform duration-300 ${isLandscape ? 'rotate-90 text-amber-400' : 'text-amber-400'}`} />
          <span>{orientationNotice}</span>
        </div>
      )}

      {/* The Scrollable Prompter Area */}
      <div 
        ref={scrollRef}
        onScroll={handleManualScroll}
        onDoubleClick={triggerTogglePlay}
        className={`flex-1 overflow-y-auto no-scrollbar pt-[50vh] pb-[50vh] relative z-10 transition-all duration-300 ${getTransformClasses()}`}
        style={{ 
          fontSize: `${effectiveFontSize}px`, 
          lineHeight: config.lineHeight,
          letterSpacing: `${config.letterSpacing}px`,
          transform: config.rotation ? `rotate(${config.rotation}deg)` : undefined
        }}
      >
        <div 
          className="mx-auto transition-all duration-300" 
          style={{ 
            width: `${effectiveWidth}%`,
            maxWidth: isPortrait ? '100%' : '1400px',
            columnCount: effectiveColumnMode === 'double' ? 2 : 1,
            columnGap: '8rem'
          }}
        >
          {effectiveColumnMode === 'single' ? (
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
          className={`flex items-center gap-2 px-3.5 py-3 rounded-full border shadow-2xl transition-all hover:scale-105 active:scale-95 ${
            controllersCount > 0
              ? 'bg-emerald-950/90 border-emerald-500 text-emerald-300'
              : 'bg-[#1E2030]/95 border-gray-700 text-gray-300 hover:text-amber-400'
          }`}
          title={controllersCount > 0 ? `${controllersCount} celular(es) conectado(s)` : 'Conectar controle remoto via QR Code'}
        >
          <Smartphone size={20} />
          <span className="text-xs font-semibold pr-1">
            {controllersCount > 0 ? `${controllersCount} conectado` : 'QR Code Celular'}
          </span>
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

      {/* Discreet Tablet / Mobile Install Tip Bar when not playing */}
      {showTabletTip && !isPlaying && !pwaState.isInstalled && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-[#12131C]/90 border border-amber-500/40 text-gray-200 px-3 py-1.5 rounded-full text-xs shadow-xl backdrop-blur-md animate-fadeIn">
          <span className="text-amber-400 font-semibold">Dica para {pwaState.platformName}:</span>
          <span className="hidden sm:inline text-gray-300">Baixe o app para leitura em tela cheia sem barras</span>
          <button
            onClick={() => setIsInstallGuideOpen(true)}
            className="text-amber-400 hover:text-amber-300 font-bold underline flex items-center gap-1 ml-1"
          >
            <Download size={13} /> Instalar
          </button>
          <button
            onClick={() => setShowTabletTip(false)}
            className="text-gray-400 hover:text-white p-0.5 rounded ml-1"
            title="Fechar dica"
          >
            <X size={14} />
          </button>
        </div>
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
        onOpenInstallGuide={() => setIsInstallGuideOpen(true)}
        isPWAInstalled={pwaState.isInstalled}
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

      {/* Install Guide Modal */}
      <InstallGuideModal
        isOpen={isInstallGuideOpen}
        onClose={() => setIsInstallGuideOpen(false)}
        pwaState={pwaState}
      />
    </div>
  );
}
