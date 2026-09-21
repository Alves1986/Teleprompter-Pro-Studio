import { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, FastForward, Rewind, Plus, Minus, ArrowLeft, Smartphone, WifiOff, QrCode, Download } from 'lucide-react';
import RemotePairModal from './RemotePairModal';
import { useOrientation } from '../hooks/useOrientation';
import { usePWAInstall } from '../hooks/usePWAInstall';
import InstallGuideModal from './InstallGuideModal';

interface RemoteState {
  isPlaying: boolean;
  speed: number;
  fontSize: number;
  progressPercent: number;
  scriptTitle: string;
  wordCount: number;
  cuePoints?: string[];
  activeCue?: string;
}

interface Props {
  initialRoomCode?: string;
  onExit?: () => void;
}

export default function RemoteControlPad({ initialRoomCode = '', onExit }: Props) {
  const [roomCode, setRoomCode] = useState(initialRoomCode.toUpperCase() || 'STUDIO1');
  const [isConnected, setIsConnected] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const pwaState = usePWAInstall();
  const [state, setState] = useState<RemoteState>({
    isPlaying: false,
    speed: 2,
    fontSize: 64,
    progressPercent: 0,
    scriptTitle: 'Conectando ao Teleprompter...',
    wordCount: 0,
    cuePoints: []
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Real-time automatic orientation detection
  const orientationInfo = useOrientation();
  const [orientationNotice, setOrientationNotice] = useState<string | null>(null);
  const prevOrientationRef = useRef(orientationInfo.orientation);

  useEffect(() => {
    if (prevOrientationRef.current !== orientationInfo.orientation) {
      prevOrientationRef.current = orientationInfo.orientation;
      const msg = orientationInfo.isLandscape 
        ? '📱 Modo Horizontal: Layout Panorâmico Ativado'
        : '📱 Modo Vertical: Layout Padrão Ativado';
      setOrientationNotice(msg);
      const timer = setTimeout(() => setOrientationNotice(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [orientationInfo.orientation, orientationInfo.isLandscape]);

  const vibrate = (ms = 35) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(ms);
      } catch {
        // Ignored
      }
    }
  };

  const connect = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws-remote`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setIsConnected(true);
      ws.send(JSON.stringify({
        type: 'join',
        room: roomCode.trim().toUpperCase(),
        role: 'controller'
      }));
      // Request immediate state sync from teleprompter host
      ws.send(JSON.stringify({
        type: 'command',
        action: 'request_sync'
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'sync_state') {
          setState(prev => ({
            ...prev,
            isPlaying: data.isPlaying !== undefined ? data.isPlaying : prev.isPlaying,
            speed: data.speed !== undefined ? data.speed : prev.speed,
            fontSize: data.fontSize !== undefined ? data.fontSize : prev.fontSize,
            progressPercent: data.progressPercent !== undefined ? data.progressPercent : prev.progressPercent,
            scriptTitle: data.scriptTitle || prev.scriptTitle,
            wordCount: data.wordCount || prev.wordCount,
            cuePoints: data.cuePoints || prev.cuePoints,
            activeCue: data.activeCue
          }));
        } else if (data.type === 'room_status') {
          if (!data.hasHost) {
            setState(prev => ({ ...prev, scriptTitle: 'Aguardando o Teleprompter conectar nesta sala...' }));
          } else {
            // Host is present, request sync if title is still placeholder
            sendCommand('request_sync');
          }
        }
      } catch (err) {
        console.error('WS remote parse err:', err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    wsRef.current = ws;
  };

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [roomCode]);

  const sendCommand = (action: string, payload: any = {}) => {
    vibrate();
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'command',
        action,
        ...payload
      }));
    }
  };

  return (
    <div className="min-h-screen bg-[#07070A] text-white flex flex-col justify-between p-3 sm:p-6 select-none font-sans">
      {/* Toast Notification when rotating device */}
      {orientationNotice && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-amber-400 text-black text-xs font-bold rounded-full shadow-2xl pointer-events-none animate-in fade-in slide-in-from-top-2">
          {orientationNotice}
        </div>
      )}

      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-gray-800/80 pb-2.5">
        <div className="flex items-center gap-2 sm:gap-3">
          {onExit && (
            <button 
              onClick={onExit}
              className="p-1.5 sm:p-2 bg-gray-800/80 hover:bg-gray-700 rounded-lg text-gray-300"
              title="Voltar"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <Smartphone className="text-amber-500" size={16} />
              <h1 className="font-bold text-xs sm:text-base tracking-wide uppercase text-gray-100">Controle Remoto</h1>
            </div>
            <button 
              onClick={() => {
                const newCode = prompt('Digite o código da sala do Teleprompter:', roomCode);
                if (newCode && newCode.trim()) setRoomCode(newCode.trim().toUpperCase());
              }}
              className="text-[11px] sm:text-xs text-gray-400 hover:text-white transition-colors"
              title="Clique para alterar a sala de conexão"
            >
              Sala: <span className="text-amber-400 font-mono font-bold underline decoration-dotted">{roomCode}</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Orientation Live Recognition Badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-900 border border-gray-800 rounded-full text-[11px] text-gray-300 font-medium">
            <Smartphone size={13} className={`transition-transform duration-300 ${orientationInfo.isLandscape ? 'rotate-90 text-amber-400' : 'text-amber-400'}`} />
            <span className="hidden sm:inline">{orientationInfo.isLandscape ? 'Horizontal (Gamepad)' : 'Vertical'}</span>
          </div>

          {!pwaState.isInstalled && (
            <button
              onClick={() => setShowInstallGuide(true)}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-400 rounded-lg text-xs font-semibold transition-colors"
              title="Baixar / Instalar app no celular ou tablet"
            >
              <Download size={13} />
              <span className="hidden sm:inline">Baixar App</span>
            </button>
          )}

          <button
            onClick={() => setShowQrModal(true)}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 bg-[#1A1B28] hover:bg-gray-800 border border-amber-500/30 text-amber-400 rounded-lg text-xs font-semibold transition-colors"
            title="Exibir QR Code para parear outro aparelho"
          >
            <QrCode size={14} />
            <span className="hidden sm:inline">QR Code</span>
          </button>

          {isConnected ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-950/60 border border-emerald-700/60 rounded-full text-[11px] text-emerald-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Sincronizado
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-950/60 border border-red-700/60 rounded-full text-[11px] text-red-400 font-medium">
              <WifiOff size={12} />
              Desconectado
            </div>
          )}
        </div>
      </div>

      {orientationInfo.isLandscape ? (
        /* Landscape Ergonomic Gamepad Layout: Left (Play + Nav) / Right (Info + Speed/Font Dials) */
        <div className="grid grid-cols-2 gap-4 my-auto py-2 items-center">
          {/* Left Column: Big Play/Pause + Navigation Jump Buttons */}
          <div className="flex flex-col items-center justify-center gap-3">
            <button
              onClick={() => {
                const nextPlaying = !state.isPlaying;
                setState(prev => ({ ...prev, isPlaying: nextPlaying }));
                sendCommand(nextPlaying ? 'play' : 'pause');
              }}
              disabled={!isConnected}
              className={`w-28 h-28 sm:w-36 sm:h-36 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all duration-200 active:scale-95 border-4 ${
                state.isPlaying
                  ? 'bg-amber-500/20 border-amber-500 text-amber-400 hover:bg-amber-500/30 ring-8 ring-amber-500/10'
                  : 'bg-emerald-600/30 border-emerald-500 text-emerald-300 hover:bg-emerald-600/40'
              }`}
            >
              {state.isPlaying ? (
                <>
                  <Pause size={42} className="fill-current mb-0.5" />
                  <span className="text-[10px] font-bold tracking-widest uppercase">Pausar</span>
                </>
              ) : (
                <>
                  <Play size={42} className="fill-current ml-1 mb-0.5" />
                  <span className="text-[10px] font-bold tracking-widest uppercase">Rolar Texto</span>
                </>
              )}
            </button>

            {/* Quick Navigation Jump Bar */}
            <div className="grid grid-cols-3 gap-2 w-full max-w-xs">
              <button
                onClick={() => sendCommand('rewind')}
                className="py-2 px-1 bg-gray-900 border border-gray-800 hover:bg-gray-800 active:bg-gray-700 rounded-lg flex flex-col items-center justify-center text-gray-300 transition-colors"
                title="-5 segundos"
              >
                <Rewind size={16} className="mb-0.5" />
                <span className="text-[10px] font-medium">-5s</span>
              </button>

              <button
                onClick={() => {
                  setState(prev => ({ ...prev, progressPercent: 0, isPlaying: false }));
                  sendCommand('restart');
                }}
                className="py-2 px-1 bg-gray-900 border border-gray-800 hover:bg-gray-800 active:bg-gray-700 rounded-lg flex flex-col items-center justify-center text-red-300 transition-colors"
                title="Voltar ao início"
              >
                <RotateCcw size={16} className="mb-0.5 text-red-400" />
                <span className="text-[10px] font-medium">Início</span>
              </button>

              <button
                onClick={() => sendCommand('fast_forward')}
                className="py-2 px-1 bg-gray-900 border border-gray-800 hover:bg-gray-800 active:bg-gray-700 rounded-lg flex flex-col items-center justify-center text-gray-300 transition-colors"
                title="+5 segundos"
              >
                <FastForward size={16} className="mb-0.5" />
                <span className="text-[10px] font-medium">+5s</span>
              </button>
            </div>
          </div>

          {/* Right Column: Script Title + Progress + Speed & Font Dials */}
          <div className="flex flex-col gap-2.5">
            {/* Script Info Card */}
            <div className="bg-[#13141C] border border-gray-800 rounded-xl p-3 shadow-lg">
              <div className="flex justify-between items-start mb-1.5">
                <div className="flex-1 mr-2">
                  <span className="text-[9px] uppercase font-bold tracking-wider text-gray-500">Roteiro em Exibição</span>
                  <h2 className="text-sm font-bold text-white truncate max-w-[200px]">
                    {state.scriptTitle}
                  </h2>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[9px] uppercase font-bold tracking-wider text-gray-500">Progresso</span>
                  <p className="text-sm font-mono font-bold text-amber-400">{Math.round(state.progressPercent)}%</p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-gray-800/80 rounded-full h-1.5 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-amber-600 to-amber-400 h-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(0, state.progressPercent))}%` }}
                />
              </div>
            </div>

            {/* Dials: Speed & Font Size */}
            <div className="grid grid-cols-2 gap-2">
              {/* Speed Adjustment */}
              <div className="bg-[#13141C] border border-gray-800/80 rounded-xl p-2.5 flex flex-col justify-between">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Velocidade</span>
                  <span className="text-xs font-mono font-bold text-amber-400">{state.speed}x</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => {
                      const nextSpeed = Math.max(0.5, +(state.speed - 0.5).toFixed(1));
                      setState(prev => ({ ...prev, speed: nextSpeed }));
                      sendCommand('speed_down');
                    }}
                    className="py-2 bg-gray-800 hover:bg-gray-700 active:bg-gray-600 rounded-lg flex items-center justify-center text-gray-200 font-bold transition-colors"
                  >
                    <Minus size={16} />
                  </button>
                  <button
                    onClick={() => {
                      const nextSpeed = Math.min(10, +(state.speed + 0.5).toFixed(1));
                      setState(prev => ({ ...prev, speed: nextSpeed }));
                      sendCommand('speed_up');
                    }}
                    className="py-2 bg-amber-600/30 border border-amber-600/50 hover:bg-amber-600/50 active:bg-amber-600 rounded-lg flex items-center justify-center text-amber-300 font-bold transition-colors"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              {/* Font Size Adjustment */}
              <div className="bg-[#13141C] border border-gray-800/80 rounded-xl p-2.5 flex flex-col justify-between">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Tam. Fonte</span>
                  <span className="text-xs font-mono font-bold text-indigo-400">{state.fontSize}px</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => {
                      const nextFont = Math.max(20, state.fontSize - 4);
                      setState(prev => ({ ...prev, fontSize: nextFont }));
                      sendCommand('font_down');
                    }}
                    className="py-2 bg-gray-800 hover:bg-gray-700 active:bg-gray-600 rounded-lg flex items-center justify-center text-gray-200 font-bold transition-colors"
                  >
                    <Minus size={16} />
                  </button>
                  <button
                    onClick={() => {
                      const nextFont = Math.min(150, state.fontSize + 4);
                      setState(prev => ({ ...prev, fontSize: nextFont }));
                      sendCommand('font_up');
                    }}
                    className="py-2 bg-indigo-600/30 border border-indigo-600/50 hover:bg-indigo-600/50 active:bg-indigo-600 rounded-lg flex items-center justify-center text-indigo-300 font-bold transition-colors"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Portrait Stack Layout */
        <>
          {/* Script Info Card */}
          <div className="my-3 bg-[#13141C] border border-gray-800 rounded-xl p-4 shadow-lg">
            <div className="flex justify-between items-start mb-2">
              <div className="flex-1 mr-2">
                <span className="text-[10px] uppercase font-bold tracking-wider text-gray-500">Roteiro em Exibição</span>
                <h2 className="text-base sm:text-lg font-bold text-white truncate max-w-[260px] sm:max-w-md">
                  {state.scriptTitle}
                </h2>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[10px] uppercase font-bold tracking-wider text-gray-500">Progresso</span>
                <p className="text-base font-mono font-bold text-amber-400">{Math.round(state.progressPercent)}%</p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-gray-800/80 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-amber-600 to-amber-400 h-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, state.progressPercent))}%` }}
              />
            </div>
          </div>

          {/* Primary Big Action: PLAY / PAUSE */}
          <div className="my-auto flex flex-col items-center justify-center py-4">
            <button
              onClick={() => {
                const nextPlaying = !state.isPlaying;
                setState(prev => ({ ...prev, isPlaying: nextPlaying }));
                sendCommand(nextPlaying ? 'play' : 'pause');
              }}
              disabled={!isConnected}
              className={`w-36 h-36 sm:w-44 sm:h-44 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all duration-200 active:scale-95 border-4 ${
                state.isPlaying
                  ? 'bg-amber-500/20 border-amber-500 text-amber-400 hover:bg-amber-500/30 ring-8 ring-amber-500/10'
                  : 'bg-emerald-600/30 border-emerald-500 text-emerald-300 hover:bg-emerald-600/40'
              }`}
            >
              {state.isPlaying ? (
                <>
                  <Pause size={56} className="fill-current mb-1" />
                  <span className="text-xs font-bold tracking-widest uppercase">Pausar</span>
                </>
              ) : (
                <>
                  <Play size={56} className="fill-current ml-2 mb-1" />
                  <span className="text-xs font-bold tracking-widest uppercase">Rolar Texto</span>
                </>
              )}
            </button>
            <p className="text-xs text-gray-500 mt-4">
              {state.isPlaying ? 'Texto em reprodução • Toque para pausar' : 'Teleprompter parado • Toque para iniciar'}
            </p>
          </div>

          {/* Control Dials Grid */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            {/* Speed Adjustment */}
            <div className="bg-[#13141C] border border-gray-800/80 rounded-xl p-3 flex flex-col justify-between">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-gray-400 uppercase">Velocidade</span>
                <span className="text-base font-mono font-bold text-amber-400">{state.speed}x</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    const nextSpeed = Math.max(0.5, +(state.speed - 0.5).toFixed(1));
                    setState(prev => ({ ...prev, speed: nextSpeed }));
                    sendCommand('speed_down');
                  }}
                  className="py-3 bg-gray-800 hover:bg-gray-700 active:bg-gray-600 rounded-lg flex items-center justify-center text-gray-200 font-bold transition-colors"
                  title="Diminuir Velocidade"
                >
                  <Minus size={20} />
                </button>
                <button
                  onClick={() => {
                    const nextSpeed = Math.min(10, +(state.speed + 0.5).toFixed(1));
                    setState(prev => ({ ...prev, speed: nextSpeed }));
                    sendCommand('speed_up');
                  }}
                  className="py-3 bg-amber-600/30 border border-amber-600/50 hover:bg-amber-600/50 active:bg-amber-600 rounded-lg flex items-center justify-center text-amber-300 font-bold transition-colors"
                  title="Aumentar Velocidade"
                >
                  <Plus size={20} />
                </button>
              </div>
            </div>

            {/* Font Size Adjustment */}
            <div className="bg-[#13141C] border border-gray-800/80 rounded-xl p-3 flex flex-col justify-between">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-gray-400 uppercase">Tamanho Fonte</span>
                <span className="text-base font-mono font-bold text-indigo-400">{state.fontSize}px</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    const nextFont = Math.max(20, state.fontSize - 4);
                    setState(prev => ({ ...prev, fontSize: nextFont }));
                    sendCommand('font_down');
                  }}
                  className="py-3 bg-gray-800 hover:bg-gray-700 active:bg-gray-600 rounded-lg flex items-center justify-center text-gray-200 font-bold transition-colors"
                  title="Diminuir Fonte"
                >
                  <Minus size={20} />
                </button>
                <button
                  onClick={() => {
                    const nextFont = Math.min(150, state.fontSize + 4);
                    setState(prev => ({ ...prev, fontSize: nextFont }));
                    sendCommand('font_up');
                  }}
                  className="py-3 bg-indigo-600/30 border border-indigo-600/50 hover:bg-indigo-600/50 active:bg-indigo-600 rounded-lg flex items-center justify-center text-indigo-300 font-bold transition-colors"
                  title="Aumentar Fonte"
                >
                  <Plus size={20} />
                </button>
              </div>
            </div>
          </div>

          {/* Navigation Jump Bar */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => sendCommand('rewind')}
              className="py-3 px-2 bg-gray-900 border border-gray-800 hover:bg-gray-800 active:bg-gray-700 rounded-xl flex flex-col items-center justify-center text-gray-300 transition-colors"
            >
              <Rewind size={20} className="mb-1" />
              <span className="text-[11px] font-medium">-5 segundos</span>
            </button>

            <button
              onClick={() => {
                setState(prev => ({ ...prev, progressPercent: 0, isPlaying: false }));
                sendCommand('restart');
              }}
              className="py-3 px-2 bg-gray-900 border border-gray-800 hover:bg-gray-800 active:bg-gray-700 rounded-xl flex flex-col items-center justify-center text-red-300 transition-colors"
            >
              <RotateCcw size={20} className="mb-1 text-red-400" />
              <span className="text-[11px] font-medium">Voltar ao Início</span>
            </button>

            <button
              onClick={() => sendCommand('fast_forward')}
              className="py-3 px-2 bg-gray-900 border border-gray-800 hover:bg-gray-800 active:bg-gray-700 rounded-xl flex flex-col items-center justify-center text-gray-300 transition-colors"
            >
              <FastForward size={20} className="mb-1" />
              <span className="text-[11px] font-medium">+5 segundos</span>
            </button>
          </div>
        </>
      )}

      <RemotePairModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        roomCode={roomCode}
        onChangeRoomCode={(newCode) => setRoomCode(newCode)}
        controllersCount={isConnected ? 1 : 0}
      />

      {/* Install Guide Modal */}
      <InstallGuideModal
        isOpen={showInstallGuide}
        onClose={() => setShowInstallGuide(false)}
        pwaState={pwaState}
      />
    </div>
  );
}
