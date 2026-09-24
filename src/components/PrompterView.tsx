import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { PrompterConfig, AppTheme, SavedScript, Bookmark } from '../types';
import ControlsHud from './ControlsHud';
import CountdownOverlay from './CountdownOverlay';
import EscaletaDrawer from './EscaletaDrawer';
import CameraRecorder from './CameraRecorder';
import VoiceFollowTracker from './VoiceFollowTracker';
import RemotePairModal from './RemotePairModal';
import ShortcutsModal, { DEFAULT_KEY_BINDINGS } from './ShortcutsModal';
import { Pause, Play, Smartphone, ListOrdered, Clock, Download, X, ArrowLeft } from 'lucide-react';
import { parseScriptBlocks, formatTime } from '../utils';
import { useOrientation } from '../hooks/useOrientation';
import { usePWAInstall } from '../hooks/usePWAInstall';
import InstallGuideModal from './InstallGuideModal';
import { RemoteClient } from '../services/remoteService';

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

  const isVoiceFollowActiveRef = useRef(isVoiceFollowActive);
  isVoiceFollowActiveRef.current = isVoiceFollowActive;
  const voiceTargetScrollRef = useRef<number | null>(null);
  const isVoiceSpeakingRef = useRef<boolean>(false);
  const lastVoiceTimeRef = useRef<number>(0);
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
  const remoteClientRef = useRef<RemoteClient | null>(null);

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
    if (remoteClientRef.current) {
      remoteClientRef.current.syncState({
        isPlaying: override?.isPlaying !== undefined ? override.isPlaying : isPlayingRef.current,
        speed: override?.speed !== undefined ? override.speed : configRef.current.speed,
        fontSize: override?.fontSize !== undefined ? override.fontSize : configRef.current.fontSize,
        progressPercent: override?.progressPercent !== undefined ? override.progressPercent : progressRef.current,
        scriptTitle: script.title,
        estimatedRemaining: remainingRef.current
      });
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
      case 'set_speed': {
        const spd = typeof payload?.speed === 'number' ? payload.speed : Number(payload);
        if (!isNaN(spd)) {
          const valid = Math.min(10, Math.max(0.5, +spd.toFixed(1)));
          onUpdateConfigRef.current({ speed: valid });
          syncStateToRemote({ speed: valid });
        }
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
      case 'set_font': {
        const fnt = typeof payload?.fontSize === 'number' ? payload.fontSize : Number(payload);
        if (!isNaN(fnt)) {
          const valid = Math.min(150, Math.max(20, Math.round(fnt)));
          onUpdateConfigRef.current({ fontSize: valid });
          syncStateToRemote({ fontSize: valid });
        }
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
      case 'request_sync':
        syncStateToRemote();
        break;
    }
  }, [triggerTogglePlay, syncStateToRemote]);

  const handleRemoteCommandRef = useRef(handleRemoteCommand);
  handleRemoteCommandRef.current = handleRemoteCommand;

  // Initialize Robust Multi-Transport Remote Client
  useEffect(() => {
    const client = new RemoteClient(roomCode, 'host', {
      onCommand: (action, payload) => {
        handleRemoteCommandRef.current(action, payload);
      },
      onStatus: (status) => {
        setControllersCount(status.controllersCount);
      }
    });

    remoteClientRef.current = client;

    // Push state immediately upon connection
    client.syncState({
      isPlaying: isPlayingRef.current,
      speed: configRef.current.speed,
      fontSize: configRef.current.fontSize,
      progressPercent: progressRef.current,
      scriptTitle: script.title,
      estimatedRemaining: remainingRef.current
    });

    return () => {
      client.destroy();
      remoteClientRef.current = null;
    };
  }, [roomCode, script.title]);

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

  // Calculate precise scrollTop to align any line with the center guide marker
  const getLineScrollPosition = useCallback((lineIdx: number, wordFraction = 0.5): number | null => {
    if (!scrollRef.current) return null;
    const lineEl = document.getElementById(`prompter-line-${lineIdx}`);
    if (!lineEl) {
      const totalLines = script.content.split('\n').length;
      const { scrollHeight, clientHeight } = scrollRef.current;
      const maxScroll = Math.max(1, scrollHeight - clientHeight);
      return Math.max(0, Math.min(maxScroll, (lineIdx / Math.max(1, totalLines)) * maxScroll));
    }

    const container = scrollRef.current;
    const containerRect = container.getBoundingClientRect();
    const lineRect = lineEl.getBoundingClientRect();

    // Relative distance from container top to line top
    const relativeTop = lineRect.top - containerRect.top;
    // Viewport reading guide center (50% of container height)
    const containerCenter = containerRect.height / 2;
    // Fractional point within the line itself
    const clampedFraction = Math.max(0, Math.min(1, wordFraction));
    const linePointOffset = lineRect.height * clampedFraction;

    const currentScroll = container.scrollTop;
    const targetScroll = currentScroll + relativeTop + linePointOffset - containerCenter;

    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    return Math.max(0, Math.min(maxScroll, targetScroll));
  }, [script.content]);

  // Find the line element closest to the central reading line
  const calculateActiveLineFromScroll = useCallback((): number => {
    if (!scrollRef.current) return 0;
    const container = scrollRef.current;
    const containerRect = container.getBoundingClientRect();
    const centerY = containerRect.top + containerRect.height / 2;

    const totalLines = script.content.split('\n').length;
    let closestLine = 0;
    let minDiff = Infinity;

    for (let i = 0; i < totalLines; i++) {
      const el = document.getElementById(`prompter-line-${i}`);
      if (el) {
        const rect = el.getBoundingClientRect();
        const lineCenter = rect.top + rect.height / 2;
        const diff = Math.abs(lineCenter - centerY);
        if (diff < minDiff) {
          minDiff = diff;
          closestLine = i;
        }
      }
    }
    return closestLine;
  }, [script.content]);

  // Voice progress handler from VoiceFollowTracker
  const handleVoiceProgress = useCallback((data: { lineIndex: number; wordFraction: number; isSpeaking: boolean; transcript: string }) => {
    setActiveLineIndex(data.lineIndex);
    isVoiceSpeakingRef.current = data.isSpeaking;

    if (data.isSpeaking) {
      lastVoiceTimeRef.current = performance.now();
      const target = getLineScrollPosition(data.lineIndex, data.wordFraction);
      if (target !== null) {
        voiceTargetScrollRef.current = target;
      }
    }
  }, [getLineScrollPosition]);

  // Content Renderer with visual cue markers and per-line DOM anchors
  const renderContent = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, i) => {
      if (!line.trim()) {
        return <div key={i} id={`prompter-line-${i}`} data-line-idx={i} className="h-6" />;
      }
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

      const isCurrentSpokenLine = isVoiceFollowActive && activeLineIndex === i;

      return (
        <div 
          key={i} 
          id={`prompter-line-${i}`}
          data-line-idx={i}
          className={`mb-4 transition-all duration-300 rounded-xl px-3 -mx-3 ${
            isCurrentSpokenLine 
              ? 'bg-amber-500/10 border-l-4 border-amber-400 text-amber-200 font-medium shadow-lg scale-[1.01] origin-left' 
              : ''
          }`}
        >
          {renderedParts}
        </div>
      );
    });
  };

  const updateScrollMetrics = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const maxScroll = Math.max(1, scrollHeight - clientHeight);
    const currProgress = (scrollTop / maxScroll) * 100;
    setProgress(Math.min(100, Math.max(0, currProgress)));

    const pixelsRemaining = maxScroll - scrollTop;
    const pxPerSec = (configRef.current.speed || 2) * 20;
    setEstimatedRemainingSeconds(pxPerSec > 0 ? pixelsRemaining / pxPerSec : 0);
  }, []);

  // Smooth Scroll Engine with Full Voice Follow Pacing Control
  const animate = useCallback((time: number) => {
    if (lastTimeRef.current !== undefined && scrollRef.current) {
      const delta = Math.min(100, time - lastTimeRef.current);
      const isVoiceActive = isVoiceFollowActiveRef.current;
      const voiceTarget = voiceTargetScrollRef.current;
      const isRecentlySpeaking = (performance.now() - lastVoiceTimeRef.current) < 1800;

      if (isVoiceActive && voiceTarget !== null) {
        // Voice Follow actively governs the progress / scrolling
        const currentScroll = scrollRef.current.scrollTop;
        const diff = voiceTarget - currentScroll;
        const absDiff = Math.abs(diff);

        if (absDiff > 1) {
          // Dynamic smooth scroll interpolation to track spoken words smoothly
          const speedMultiplier = absDiff > 400 ? 12 : absDiff > 150 ? 8 : 5;
          const lerpStep = diff * Math.min(0.25, Math.max(0.04, (delta / 1000) * speedMultiplier));
          scrollRef.current.scrollTop = currentScroll + lerpStep;
        } else if (isRecentlySpeaking && isPlayingRef.current) {
          // If actively speaking and play mode is also engaged, continue gentle forward roll
          const scrollAmount = (configRef.current.speed * 16) * (delta / 1000);
          scrollRef.current.scrollTop += scrollAmount;
        }

        updateScrollMetrics();
      } else if (isPlayingRef.current) {
        // Standard linear auto-scroll when Voice Follow is not driving
        const scrollAmount = (configRef.current.speed * 20) * (delta / 1000);
        scrollRef.current.scrollTop += scrollAmount;
        updateScrollMetrics();

        const approxLine = calculateActiveLineFromScroll();
        setActiveLineIndex(approxLine);
      }
    }

    lastTimeRef.current = time;
    if (isPlayingRef.current || isVoiceFollowActiveRef.current) {
      requestRef.current = requestAnimationFrame(animate);
    }
  }, [updateScrollMetrics, calculateActiveLineFromScroll]);

  useEffect(() => {
    if (isPlaying || isVoiceFollowActive) {
      requestRef.current = requestAnimationFrame(animate);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      lastTimeRef.current = undefined;
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, isVoiceFollowActive, animate]);

  const handleManualScroll = () => {
    if (scrollRef.current) {
      updateScrollMetrics();
      const currentLine = calculateActiveLineFromScroll();
      setActiveLineIndex(currentLine);
      if (isVoiceFollowActiveRef.current) {
        voiceTargetScrollRef.current = scrollRef.current.scrollTop;
      }
    }
  };

  // Jump to specific line (used by Voice Follow, Escaleta, and Remote)
  const jumpToLine = useCallback((targetLine: number) => {
    setActiveLineIndex(targetLine);
    const targetScroll = getLineScrollPosition(targetLine, 0.2);
    if (targetScroll !== null && scrollRef.current) {
      voiceTargetScrollRef.current = targetScroll;
      scrollRef.current.scrollTo({
        top: targetScroll,
        behavior: 'smooth'
      });
    }
  }, [getLineScrollPosition]);

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

      {/* Quick Top-Left Back / Close Button for Mobile & Desktop */}
      <div className="absolute top-safe left-3 sm:left-6 z-40">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/75 hover:bg-black/90 active:bg-red-950/80 text-gray-200 hover:text-white border border-gray-700/80 backdrop-blur-md shadow-2xl text-xs font-semibold transition-all touch-manipulation cursor-pointer active:scale-95"
          title="Fechar teleprompter e voltar ao editor"
        >
          <ArrowLeft size={14} />
          <span className="hidden sm:inline">Voltar ao Editor</span>
          <span className="sm:hidden">Sair</span>
        </button>
      </div>

      {/* Live Recording Pulsing Studio Badge */}
      {config.theme === AppTheme.STUDIO && isPlaying && (
        <div className="absolute top-safe right-3 sm:right-6 z-30 flex items-center gap-1.5 sm:gap-2 bg-red-600/10 border border-red-500/30 px-2.5 sm:px-3 py-1 rounded-full animate-pulse backdrop-blur">
          <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-red-500 rounded-full"></div>
          <span className="text-red-500 font-bold tracking-widest text-xs sm:text-sm">NO AR</span>
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
        <div className="absolute top-safe left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 sm:gap-2 max-w-[95%]">
          <div className="bg-black/70 backdrop-blur px-2.5 sm:px-3 py-1 rounded-md text-amber-500 font-mono text-xs sm:text-sm shadow-xl border border-gray-800 flex items-center gap-1 sm:gap-1.5 shrink-0">
            <Clock size={12} />
            <span>-{formatRemainingTime()}</span>
          </div>

          {targetSeconds > 0 && (
            <div className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md text-[10px] sm:text-xs font-bold font-mono border backdrop-blur truncate ${
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
        currentLineIndex={activeLineIndex}
        onVoiceProgress={handleVoiceProgress}
        onToggleVoice={(en) => {
          setIsVoiceFollowActive(en);
          onUpdateConfig({ voiceFollowEnabled: en });
        }}
      />

      {/* Floating Action Buttons: Remote Quick-Pair & Escaleta & Play */}
      <div className="absolute bottom-5 sm:bottom-8 right-3 sm:right-8 z-40 flex items-center gap-2 sm:gap-3 pb-safe">
        {/* Remote Pairing Quick Icon */}
        <button
          onClick={() => setIsRemoteModalOpen(true)}
          className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-2.5 sm:py-3 rounded-full border shadow-2xl transition-all hover:scale-105 active:scale-95 ${
            controllersCount > 0
              ? 'bg-emerald-950/90 border-emerald-500 text-emerald-300'
              : 'bg-[#1E2030]/95 border-gray-700 text-gray-300 hover:text-amber-400'
          }`}
          title={controllersCount > 0 ? `${controllersCount} celular(es) conectado(s)` : 'Conectar controle remoto via QR Code'}
        >
          <Smartphone size={18} />
          <span className="text-xs font-semibold pr-0.5 hidden sm:inline">
            {controllersCount > 0 ? `${controllersCount} conectado` : 'QR Code Celular'}
          </span>
          <span className="text-xs font-semibold sm:hidden">
            {controllersCount > 0 ? `${controllersCount}` : 'QR'}
          </span>
        </button>

        {/* Escaleta Quick Drawer Button */}
        <button
          onClick={() => setIsEscaletaOpen(true)}
          className="p-2.5 sm:p-3.5 bg-[#1E2030]/90 hover:bg-gray-700 border border-gray-700 rounded-full text-gray-300 hover:text-amber-400 shadow-2xl transition-all hover:scale-105 active:scale-95"
          title="Abrir escaleta de blocos"
        >
          <ListOrdered size={18} />
        </button>

        {/* Main Floating Play/Pause Button */}
        <button 
          onClick={triggerTogglePlay}
          className={`w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center shadow-2xl transition-all hover:scale-105 active:scale-95 ${
            isPlaying 
              ? 'bg-[#1E2030] text-amber-500 border border-amber-500/30' 
              : 'bg-amber-500 text-[#0A0A0F] shadow-amber-500/20'
          }`}
        >
          {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-0.5" />}
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
        onToggleVoiceFollow={() => {
          const next = !isVoiceFollowActive;
          setIsVoiceFollowActive(next);
          onUpdateConfig({ voiceFollowEnabled: next });
        }}
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
