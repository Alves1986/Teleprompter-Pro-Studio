import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, AlertCircle } from 'lucide-react';
import { stripMarkers } from '../utils';

interface Props {
  isEnabled: boolean;
  scriptContent: string;
  onJumpToLine: (lineIndex: number) => void;
  onToggleVoice: (enabled: boolean) => void;
}

export default function VoiceFollowTracker({
  isEnabled,
  scriptContent,
  onJumpToLine,
  onToggleVoice
}: Props) {
  const [isListening, setIsListening] = useState(false);
  const [lastTranscript, setLastTranscript] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const linesRef = useRef<string[]>([]);
  const currentMatchLineRef = useRef<number>(0);
  const isEnabledRef = useRef<boolean>(isEnabled);
  isEnabledRef.current = isEnabled;
  const isStoppingRef = useRef<boolean>(false);
  const restartTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Pre-process script lines and clean markers
  useEffect(() => {
    linesRef.current = scriptContent
      .split('\n')
      .map(line => stripMarkers(line).toLowerCase().trim());
  }, [scriptContent]);

  useEffect(() => {
    if (!isEnabled) {
      isStoppingRef.current = true;
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      stopListening();
      return;
    }

    isStoppingRef.current = false;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setErrorMsg('Reconhecimento de voz não suportado neste navegador.');
      onToggleVoice(false);
      return;
    }

    const initRecognition = () => {
      if (isStoppingRef.current || !isEnabledRef.current) return;

      try {
        if (recognitionRef.current) {
          recognitionRef.current.onend = null;
          recognitionRef.current.onerror = null;
          try { recognitionRef.current.abort(); } catch {}
          recognitionRef.current = null;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'pt-BR';
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
          setIsListening(true);
          setErrorMsg(null);
        };

        recognition.onerror = (event: any) => {
          console.warn('Speech recognition error:', event.error);
          if (event.error === 'not-allowed') {
            setErrorMsg('Microfone não autorizado no navegador.');
            onToggleVoice(false);
          } else if (event.error === 'audio-capture') {
            setErrorMsg('Microfone ocupado. Reconectando...');
          } else if (event.error === 'network') {
            setErrorMsg('Reconectando serviço de voz...');
          }
        };

        recognition.onend = () => {
          if (isStoppingRef.current || !isEnabledRef.current) {
            setIsListening(false);
            return;
          }

          // Auto-recover and restart smoothly with slight debounce
          if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
          restartTimerRef.current = setTimeout(() => {
            if (isEnabledRef.current && !isStoppingRef.current) {
              try {
                recognition.start();
                setIsListening(true);
              } catch (startErr: any) {
                // If recognition instance is dead or invalid state, re-init
                if (startErr.name !== 'InvalidStateError') {
                  restartTimerRef.current = setTimeout(() => {
                    if (isEnabledRef.current && !isStoppingRef.current) {
                      initRecognition();
                    }
                  }, 800);
                }
              }
            }
          }, 150);
        };

        recognition.onresult = (event: any) => {
          let interimTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              interimTranscript = transcript;
            } else {
              interimTranscript += transcript;
            }
          }

          const spoken = interimTranscript.toLowerCase().trim();
          setLastTranscript(spoken);

          if (!spoken) return;

          // Match spoken tokens with script lines
          const spokenWords = spoken.split(/\s+/).filter(w => w.length > 2);
          if (spokenWords.length === 0) return;

          const lines = linesRef.current;
          const startScan = Math.max(0, currentMatchLineRef.current - 2);
          const endScan = Math.min(lines.length, currentMatchLineRef.current + 12);

          let bestLine = -1;
          let highestMatches = 0;

          for (let idx = startScan; idx < endScan; idx++) {
            const lineText = lines[idx];
            if (!lineText) continue;

            let matches = 0;
            for (const word of spokenWords) {
              if (lineText.includes(word)) {
                matches++;
              }
            }

            if (matches > highestMatches) {
              highestMatches = matches;
              bestLine = idx;
            }
          }

          if (bestLine >= 0 && highestMatches >= 1) {
            currentMatchLineRef.current = bestLine;
            onJumpToLine(bestLine);
          }
        };

        recognition.start();
        recognitionRef.current = recognition;
      } catch (e) {
        console.warn('Recognition start err:', e);
        if (isEnabledRef.current && !isStoppingRef.current) {
          restartTimerRef.current = setTimeout(() => {
            initRecognition();
          }, 1000);
        }
      }
    };

    initRecognition();

    return () => {
      isStoppingRef.current = true;
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      stopListening();
    };
  }, [isEnabled]);

  const stopListening = () => {
    isStoppingRef.current = true;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.onerror = null;
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignored
      }
      recognitionRef.current = null;
    }
    setIsListening(false);
  };

  if (!isEnabled) return null;

  return (
    <div className="fixed bottom-16 left-4 z-40 bg-[#0A0A0F]/90 backdrop-blur-md border border-indigo-900/60 rounded-xl px-3 py-2 shadow-2xl flex items-center gap-3 text-xs text-white max-w-sm pointer-events-auto">
      <div className="flex items-center gap-1.5 shrink-0">
        {isListening ? (
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
          </span>
        ) : (
          <span className="h-3 w-3 rounded-full bg-gray-500"></span>
        )}
        <Mic size={14} className={isListening ? 'text-indigo-400' : 'text-gray-400'} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase font-bold tracking-wider text-indigo-400">
          Smart Follow (Voz)
        </div>
        {errorMsg ? (
          <p className="text-[11px] text-amber-400 flex items-center gap-1">
            <AlertCircle size={11} /> {errorMsg}
          </p>
        ) : (
          <p className="text-[11px] text-gray-300 truncate">
            {lastTranscript || (isListening ? 'Aguardando sua fala...' : 'Iniciando microfone...')}
          </p>
        )}
      </div>

      <button
        onClick={() => onToggleVoice(false)}
        className="p-1 hover:bg-gray-800 text-gray-400 hover:text-white rounded"
        title="Desativar acompanhamento por voz"
      >
        <MicOff size={13} />
      </button>
    </div>
  );
}
