import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Smartphone, Activity } from 'lucide-react';
import { RemoteStatus, SignalQuality } from '../services/remoteService';

interface Props {
  status: RemoteStatus | null;
  controllersCount: number;
  onOpenVerifier?: () => void;
  className?: string;
  isCompact?: boolean;
}

export default function RemoteLatencyIndicator({
  status,
  controllersCount,
  onOpenVerifier,
  className = '',
  isCompact = false
}: Props) {
  const [showPopover, setShowPopover] = useState(false);

  // If no remote device is connected and no status, don't show
  if (!status || (!status.isConnected && controllersCount === 0)) {
    return null;
  }

  const latency = status.latencyMs ?? (status.mode === 'broadcast' ? 2 : 35);
  const quality: SignalQuality = status.signalQuality || (
    latency <= 55 ? 'excellent' : latency <= 125 ? 'good' : latency <= 250 ? 'fair' : 'poor'
  );

  const isLagWarning = quality === 'poor';

  // Config based on signal quality
  const getQualityTheme = () => {
    switch (quality) {
      case 'excellent':
        return {
          bg: 'bg-emerald-950/80 hover:bg-emerald-900/80',
          border: 'border-emerald-500/40 hover:border-emerald-500/70',
          text: 'text-emerald-300',
          barActive: 'bg-emerald-400',
          barInactive: 'bg-emerald-950/60',
          label: 'Sinal Ótimo',
          barsCount: 4,
          takeStatus: 'Pronto para Gravação (Latência Mínima)',
          takeBadgeClass: 'bg-emerald-900/50 text-emerald-300 border-emerald-500/40'
        };
      case 'good':
        return {
          bg: 'bg-teal-950/80 hover:bg-teal-900/80',
          border: 'border-teal-500/40 hover:border-teal-500/70',
          text: 'text-teal-300',
          barActive: 'bg-teal-400',
          barInactive: 'bg-teal-950/60',
          label: 'Sinal Estável',
          barsCount: 3,
          takeStatus: 'Pronto para Gravação',
          takeBadgeClass: 'bg-teal-900/50 text-teal-300 border-teal-500/40'
        };
      case 'fair':
        return {
          bg: 'bg-amber-950/85 hover:bg-amber-900/85',
          border: 'border-amber-500/50 hover:border-amber-500/80',
          text: 'text-amber-300',
          barActive: 'bg-amber-400',
          barInactive: 'bg-amber-950/60',
          label: 'Lag Moderado',
          barsCount: 2,
          takeStatus: 'Atenção: leve atraso perceptível no controle',
          takeBadgeClass: 'bg-amber-900/50 text-amber-300 border-amber-500/40'
        };
      case 'poor':
      default:
        return {
          bg: 'bg-red-950/90 hover:bg-red-900/90',
          border: 'border-red-500/70 hover:border-red-500',
          text: 'text-red-300',
          barActive: 'bg-red-400',
          barInactive: 'bg-red-950/60',
          label: 'Alto Lag!',
          barsCount: 1,
          takeStatus: 'Alerta de Lag: aguarde o sinal estabilizar antes de gravar!',
          takeBadgeClass: 'bg-red-900/60 text-red-200 border-red-500/60 animate-pulse'
        };
    }
  };

  const theme = getQualityTheme();

  return (
    <div className={`relative inline-block ${className}`}>
      {/* Visual Signal Strength & Latency Trigger Button */}
      <button
        onClick={() => setShowPopover(prev => !prev)}
        className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-full border backdrop-blur-md shadow-lg transition-all touch-manipulation cursor-pointer active:scale-95 ${theme.bg} ${theme.border} ${theme.text} ${
          isLagWarning ? 'animate-pulse' : ''
        }`}
        title={`Conexão Mobile: ${latency}ms (${theme.label}). Clique para detalhes de latência pré-take.`}
      >
        {/* Cellular / Wi-Fi Signal Bars */}
        <div className="flex items-end gap-0.5 h-3.5 px-0.5" aria-hidden="true">
          <span className={`w-1 rounded-sm transition-all ${theme.barsCount >= 1 ? theme.barActive : theme.barInactive} h-1`} />
          <span className={`w-1 rounded-sm transition-all ${theme.barsCount >= 2 ? theme.barActive : theme.barInactive} h-2`} />
          <span className={`w-1 rounded-sm transition-all ${theme.barsCount >= 3 ? theme.barActive : theme.barInactive} h-2.5`} />
          <span className={`w-1 rounded-sm transition-all ${theme.barsCount >= 4 ? theme.barActive : theme.barInactive} h-3.5`} />
        </div>

        {/* Latency Number */}
        <span className="font-mono text-xs font-bold tracking-tight">
          {latency < 5 ? '<5ms' : `${latency}ms`}
        </span>

        {/* Quality Label on Medium+ screens */}
        {!isCompact && (
          <span className="hidden md:inline text-[11px] font-medium border-l border-white/10 pl-1.5">
            {theme.label}
          </span>
        )}

        {isLagWarning && (
          <AlertTriangle size={13} className="text-red-400 shrink-0 animate-bounce" />
        )}

        <ChevronDown size={12} className={`opacity-60 transition-transform ${showPopover ? 'rotate-180' : ''}`} />
      </button>

      {/* Latency Diagnostics & Pre-Take Popover */}
      {showPopover && (
        <div className="absolute top-full left-0 mt-2 w-72 sm:w-80 rounded-xl bg-[#141622]/98 border border-gray-700/80 shadow-2xl p-3.5 z-50 text-xs text-gray-200 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between pb-2 border-b border-gray-800">
            <div className="flex items-center gap-1.5 font-bold text-white">
              <Activity size={14} className={theme.text} />
              <span>Qualidade do Sinal Remoto</span>
            </div>
            <button
              onClick={() => setShowPopover(false)}
              className="text-gray-400 hover:text-white p-0.5 text-xs"
            >
              ✕
            </button>
          </div>

          {/* Pre-Take Verification Status Banner */}
          <div className={`mt-2.5 p-2 rounded-lg border flex items-start gap-2 ${theme.takeBadgeClass}`}>
            {quality === 'poor' ? (
              <AlertTriangle size={15} className="text-red-400 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 size={15} className="text-emerald-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <div className="font-bold text-[11px]">Verificação Pré-Gravação:</div>
              <div className="text-[10px] mt-0.5 leading-snug">{theme.takeStatus}</div>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 gap-2 mt-3 font-mono text-[11px]">
            <div className="bg-[#1E2030]/80 p-2 rounded-lg border border-gray-800">
              <div className="text-gray-400 text-[10px] font-sans">Latência RTT:</div>
              <div className={`font-bold text-sm mt-0.5 ${theme.text}`}>
                {latency < 5 ? '<5 ms' : `${latency} ms`}
              </div>
            </div>

            <div className="bg-[#1E2030]/80 p-2 rounded-lg border border-gray-800">
              <div className="text-gray-400 text-[10px] font-sans">Dispositivos:</div>
              <div className="font-bold text-sm text-gray-200 mt-0.5 flex items-center gap-1">
                <Smartphone size={13} className="text-amber-400 font-sans" />
                <span>{controllersCount} ativo(s)</span>
              </div>
            </div>

            <div className="col-span-2 bg-[#1E2030]/80 p-2 rounded-lg border border-gray-800 flex justify-between items-center text-[10px] font-sans">
              <span className="text-gray-400">Canal de Comunicação:</span>
              <span className="font-bold text-gray-200 font-mono">
                {status.mode === 'websocket' ? 'WebSocket (Realtime)' : status.mode === 'broadcast' ? 'Broadcast Local (0ms)' : 'HTTP Polling'}
              </span>
            </div>
          </div>

          {/* Quick Actions */}
          {onOpenVerifier && (
            <button
              onClick={() => {
                setShowPopover(false);
                onOpenVerifier();
              }}
              className="mt-3 w-full py-1.5 px-3 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-md"
            >
              <Smartphone size={13} />
              <span>Verificar Dispositivo & Bluetooth</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
