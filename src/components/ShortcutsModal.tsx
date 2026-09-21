import { useState, useEffect } from 'react';
import { CustomKeyBindings } from '../types';
import { 
  Keyboard, 
  Gamepad2, 
  RotateCcw, 
  X, 
  Check, 
  Plus, 
  Play, 
  ChevronsUp, 
  ChevronsDown, 
  Info 
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  bindings: CustomKeyBindings;
  onSaveBindings: (bindings: CustomKeyBindings) => void;
  pedalEnabled: boolean;
  onTogglePedal: (enabled: boolean) => void;
}

export const DEFAULT_KEY_BINDINGS: CustomKeyBindings = {
  playPause: ['Space', 'PageDown', 'KeyK'],
  speedUp: ['ArrowUp', 'PageUp', 'BracketRight'],
  speedDown: ['ArrowDown', 'BracketLeft'],
  restart: ['KeyR'],
  rewind: ['ArrowLeft'],
  fastForward: ['ArrowRight'],
  pedalPlayButton: 0,
  pedalSpeedUpButton: 12,
  pedalSpeedDownButton: 13
};

// Formata nomes amigáveis para teclas
export function formatKeyLabel(code: string): string {
  if (!code) return '';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  switch (code) {
    case 'Space': return 'Espaço';
    case 'ArrowUp': return 'Seta Cima ↑';
    case 'ArrowDown': return 'Seta Baixo ↓';
    case 'ArrowLeft': return 'Seta Esquerda ←';
    case 'ArrowRight': return 'Seta Direita →';
    case 'PageUp': return 'Page Up';
    case 'PageDown': return 'Page Down';
    case 'BracketLeft': return '[ ';
    case 'BracketRight': return ' ]';
    case 'Enter': return 'Enter ↵';
    case 'Escape': return 'Esc';
    case 'Backspace': return 'Backspace';
    case 'Tab': return 'Tab ⇥';
    default: return code;
  }
}

export default function ShortcutsModal({
  isOpen,
  onClose,
  bindings,
  onSaveBindings,
  pedalEnabled,
  onTogglePedal
}: Props) {
  const [currentBindings, setCurrentBindings] = useState<CustomKeyBindings>(() => ({
    ...DEFAULT_KEY_BINDINGS,
    ...bindings
  }));

  const [activeRecordingAction, setActiveRecordingAction] = useState<keyof CustomKeyBindings | null>(null);
  const [recordingPedalAction, setRecordingPedalAction] = useState<'pedalPlayButton' | 'pedalSpeedUpButton' | 'pedalSpeedDownButton' | null>(null);
  const [detectedGamepads, setDetectedGamepads] = useState<string[]>([]);
  const [lastGamepadPressed, setLastGamepadPressed] = useState<{ id: string; button: number } | null>(null);
  const [saveToast, setSaveToast] = useState(false);

  // Sync incoming props
  useEffect(() => {
    setCurrentBindings({
      ...DEFAULT_KEY_BINDINGS,
      ...bindings
    });
  }, [bindings, isOpen]);

  // Listener para captura de teclas durante gravação
  useEffect(() => {
    if (!activeRecordingAction || !isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const pressedCode = e.code;
      if (!pressedCode || pressedCode === 'Escape') {
        setActiveRecordingAction(null);
        return;
      }

      setCurrentBindings(prev => {
        const currentList = Array.isArray(prev[activeRecordingAction]) 
          ? [...(prev[activeRecordingAction] as string[])] 
          : [];

        if (!currentList.includes(pressedCode)) {
          currentList.push(pressedCode);
        }

        return {
          ...prev,
          [activeRecordingAction]: currentList
        };
      });

      setActiveRecordingAction(null);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [activeRecordingAction, isOpen]);

  // Listener contínuo da Gamepad API para detecção de botões de pedal Bluetooth
  useEffect(() => {
    if (!isOpen) return;

    let intervalId: NodeJS.Timeout | null = null;

    const scanGamepads = () => {
      if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
      const gamepads = navigator.getGamepads();
      const names: string[] = [];

      for (let i = 0; i < gamepads.length; i++) {
        const gp = gamepads[i];
        if (gp) {
          names.push(gp.id || `Dispositivo ${i + 1}`);

          // Checar se algum botão foi pressionado
          if (gp.buttons) {
            for (let b = 0; b < gp.buttons.length; b++) {
              if (gp.buttons[b]?.pressed) {
                setLastGamepadPressed({ id: gp.id, button: b });

                // Se estiver gravando um comando de pedal específico:
                if (recordingPedalAction) {
                  setCurrentBindings(prev => ({
                    ...prev,
                    [recordingPedalAction]: b
                  }));
                  setRecordingPedalAction(null);
                }
                break;
              }
            }
          }
        }
      }

      setDetectedGamepads(names);
    };

    intervalId = setInterval(scanGamepads, 100);
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isOpen, recordingPedalAction]);

  if (!isOpen) return null;

  const removeKey = (action: keyof CustomKeyBindings, keyToRemove: string) => {
    setCurrentBindings(prev => {
      const list = Array.isArray(prev[action]) ? [...(prev[action] as string[])] : [];
      return {
        ...prev,
        [action]: list.filter(k => k !== keyToRemove)
      };
    });
  };

  const resetToDefaults = () => {
    setCurrentBindings(DEFAULT_KEY_BINDINGS);
  };

  const handleSave = () => {
    onSaveBindings(currentBindings);
    setSaveToast(true);
    setTimeout(() => {
      setSaveToast(false);
      onClose();
    }, 400);
  };

  const keySections: {
    key: keyof CustomKeyBindings;
    label: string;
    description: string;
    icon: React.ReactNode;
  }[] = [
    {
      key: 'playPause',
      label: 'Reproduzir / Pausar',
      description: 'Inicia ou interrompe a rolagem do texto',
      icon: <Play size={16} className="text-amber-400" />
    },
    {
      key: 'speedUp',
      label: 'Acelerar Velocidade (+)',
      description: 'Aumenta a velocidade de rolagem em +0.5x',
      icon: <ChevronsUp size={16} className="text-emerald-400" />
    },
    {
      key: 'speedDown',
      label: 'Diminuir Velocidade (-)',
      description: 'Diminui a velocidade de rolagem em -0.5x',
      icon: <ChevronsDown size={16} className="text-sky-400" />
    },
    {
      key: 'restart',
      label: 'Reiniciar do Início',
      description: 'Volta o texto para a primeira linha',
      icon: <RotateCcw size={16} className="text-purple-400" />
    },
    {
      key: 'rewind',
      label: 'Rebobinar 5 Segundos',
      description: 'Recua o posicionamento do texto',
      icon: <ChevronsDown size={16} className="text-orange-400 -rotate-90" />
    },
    {
      key: 'fastForward',
      label: 'Avançar 5 Segundos',
      description: 'Avança o posicionamento do texto',
      icon: <ChevronsUp size={16} className="text-orange-400 rotate-90" />
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div 
        className="bg-[#12131C] border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-gray-800 flex items-center justify-between bg-[#181926]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Keyboard size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Atalhos de Teclado & Pedais
                <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded font-mono font-bold uppercase tracking-wider border border-amber-500/30">
                  Custom
                </span>
              </h2>
              <p className="text-xs text-gray-400">
                Personalize teclas de comando e mapeamento para pedais Bluetooth ou apresentadores
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-gray-800/80 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 text-gray-200">
          
          {/* Seção 1: Atalhos de Teclado */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                <Keyboard size={14} className="text-amber-400" />
                Mapeamento de Teclado
              </h3>
              <span className="text-[11px] text-gray-500">
                Clique em "+ Adicionar" e pressione qualquer tecla
              </span>
            </div>

            <div className="space-y-2.5">
              {keySections.map((sec) => {
                const keysList = (currentBindings[sec.key] as string[]) || [];
                const isRecording = activeRecordingAction === sec.key;

                return (
                  <div 
                    key={sec.key}
                    className={`p-3 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isRecording 
                        ? 'bg-amber-500/10 border-amber-500 shadow-lg ring-1 ring-amber-500' 
                        : 'bg-[#181926] border-gray-800/90 hover:border-gray-700'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 shrink-0">{sec.icon}</div>
                      <div>
                        <div className="text-sm font-semibold text-gray-100 flex items-center gap-2">
                          {sec.label}
                        </div>
                        <div className="text-xs text-gray-400">{sec.description}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      {keysList.map((k) => (
                        <span 
                          key={k}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#242638] border border-gray-700 text-xs font-mono font-bold text-amber-300 shadow-sm"
                        >
                          {formatKeyLabel(k)}
                          <button
                            onClick={() => removeKey(sec.key, k)}
                            className="hover:text-red-400 p-0.5 text-gray-400 transition-colors"
                            title="Remover esta tecla"
                          >
                            <X size={11} />
                          </button>
                        </span>
                      ))}

                      {isRecording ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-500 text-black text-xs font-bold animate-pulse">
                          Pressione a tecla desejada...
                        </span>
                      ) : (
                        <button
                          onClick={() => setActiveRecordingAction(sec.key)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#242638] hover:bg-gray-700 border border-dashed border-gray-600 hover:border-amber-400 text-xs text-gray-300 hover:text-white transition-colors"
                        >
                          <Plus size={12} />
                          <span>Adicionar</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Seção 2: Pedais Bluetooth & Gamepad */}
          <div className="pt-4 border-t border-gray-800">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Gamepad2 size={16} className="text-emerald-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  Pedal de Pé Bluetooth & Gamepad
                </h3>
              </div>

              <label className="flex items-center gap-2 text-xs text-gray-300 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={pedalEnabled}
                  onChange={(e) => onTogglePedal(e.target.checked)}
                  className="accent-amber-500 w-4 h-4 rounded text-amber-500 bg-gray-800 border-none ring-0 cursor-pointer"
                />
                Ativar Leitura de Pedal
              </label>
            </div>

            {/* Status do Dispositivo Conectado */}
            <div className="bg-[#181926] p-3 rounded-xl border border-gray-800 text-xs mb-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-gray-400 flex items-center gap-1.5">
                  <Info size={13} className="text-amber-400" />
                  Status da Conexão Bluetooth/USB:
                </span>
                {detectedGamepads.length > 0 ? (
                  <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-500 text-emerald-300 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                    {detectedGamepads.length} dispositivo(s) detectado(s)
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-400">
                    Nenhum pedal detectado (Pressione qualquer pedal para acordar)
                  </span>
                )}
              </div>

              {detectedGamepads.length > 0 && (
                <div className="text-[11px] text-gray-400 font-mono pl-4">
                  {detectedGamepads.map((name, i) => (
                    <div key={i}>• {name}</div>
                  ))}
                </div>
              )}

              {lastGamepadPressed && (
                <div className="text-[11px] text-amber-300/90 font-mono bg-amber-500/10 p-1.5 rounded border border-amber-500/20">
                  Último sinal recebido: <strong>Botão {lastGamepadPressed.button}</strong> de {lastGamepadPressed.id.slice(0, 24)}...
                </div>
              )}
            </div>

            {/* Mapeamento de Botões de Pedal */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Botão Play / Pause */}
              <div className="bg-[#181926] p-3 rounded-xl border border-gray-800 flex flex-col justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
                    <Play size={13} className="text-amber-400" />
                    Pedal Play/Pausa
                  </span>
                  <p className="text-[11px] text-gray-400 mt-0.5">Disparador principal</p>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold bg-[#242638] px-2 py-1 rounded text-emerald-300 border border-gray-700">
                    Botão {currentBindings.pedalPlayButton ?? 0}
                  </span>
                  <button
                    onClick={() => setRecordingPedalAction('pedalPlayButton')}
                    className={`text-[11px] px-2 py-1 rounded border font-semibold transition-colors ${
                      recordingPedalAction === 'pedalPlayButton'
                        ? 'bg-amber-500 text-black border-amber-400 animate-pulse'
                        : 'bg-[#242638] hover:bg-gray-700 text-gray-300 border-gray-700'
                    }`}
                  >
                    {recordingPedalAction === 'pedalPlayButton' ? 'Pise no pedal...' : 'Mapear'}
                  </button>
                </div>
              </div>

              {/* Botão Speed Up */}
              <div className="bg-[#181926] p-3 rounded-xl border border-gray-800 flex flex-col justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
                    <ChevronsUp size={13} className="text-emerald-400" />
                    Pedal Acelerar (+)
                  </span>
                  <p className="text-[11px] text-gray-400 mt-0.5">+0.5x de velocidade</p>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold bg-[#242638] px-2 py-1 rounded text-emerald-300 border border-gray-700">
                    Botão {currentBindings.pedalSpeedUpButton ?? 12}
                  </span>
                  <button
                    onClick={() => setRecordingPedalAction('pedalSpeedUpButton')}
                    className={`text-[11px] px-2 py-1 rounded border font-semibold transition-colors ${
                      recordingPedalAction === 'pedalSpeedUpButton'
                        ? 'bg-amber-500 text-black border-amber-400 animate-pulse'
                        : 'bg-[#242638] hover:bg-gray-700 text-gray-300 border-gray-700'
                    }`}
                  >
                    {recordingPedalAction === 'pedalSpeedUpButton' ? 'Pise no pedal...' : 'Mapear'}
                  </button>
                </div>
              </div>

              {/* Botão Speed Down */}
              <div className="bg-[#181926] p-3 rounded-xl border border-gray-800 flex flex-col justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
                    <ChevronsDown size={13} className="text-sky-400" />
                    Pedal Desacelerar (-)
                  </span>
                  <p className="text-[11px] text-gray-400 mt-0.5">-0.5x de velocidade</p>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold bg-[#242638] px-2 py-1 rounded text-emerald-300 border border-gray-700">
                    Botão {currentBindings.pedalSpeedDownButton ?? 13}
                  </span>
                  <button
                    onClick={() => setRecordingPedalAction('pedalSpeedDownButton')}
                    className={`text-[11px] px-2 py-1 rounded border font-semibold transition-colors ${
                      recordingPedalAction === 'pedalSpeedDownButton'
                        ? 'bg-amber-500 text-black border-amber-400 animate-pulse'
                        : 'bg-[#242638] hover:bg-gray-700 text-gray-300 border-gray-700'
                    }`}
                  >
                    {recordingPedalAction === 'pedalSpeedDownButton' ? 'Pise no pedal...' : 'Mapear'}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-2 text-[11px] text-gray-500 flex items-center gap-1">
              <span>Dica: a maioria dos pedais de pé e passadores de slide (como AirTurn, Donner, Logitech) enviam comandos normais de teclado (PageDown ou Espaço), os quais já são reconhecidos automaticamente acima.</span>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 bg-[#181926] flex items-center justify-between flex-wrap gap-2">
          <button
            onClick={resetToDefaults}
            className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-xs font-semibold transition-colors flex items-center gap-1.5"
            title="Restaurar teclas de atalho padrão"
          >
            <RotateCcw size={13} />
            Restaurar Padrões
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0A0A0F] text-xs font-bold transition-colors flex items-center gap-1.5 shadow-lg shadow-amber-500/20"
            >
              {saveToast ? <Check size={14} /> : null}
              <span>{saveToast ? 'Salvo!' : 'Salvar Alterações'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
