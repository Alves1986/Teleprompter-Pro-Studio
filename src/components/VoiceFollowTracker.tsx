import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, AlertCircle, RefreshCw, Volume2, Sparkles, PauseCircle } from 'lucide-react';
import { stripAllScriptMarkers, normalizeVoiceText, PORTUGUESE_STOP_WORDS } from '../utils';

export interface VoiceProgressData {
  lineIndex: number;
  wordFraction: number;
  isSpeaking: boolean;
  transcript: string;
}

interface Props {
  isEnabled: boolean;
  scriptContent: string;
  currentLineIndex: number;
  onVoiceProgress: (data: VoiceProgressData) => void;
  onToggleVoice: (enabled: boolean) => void;
}

interface IndexedLine {
  lineIndex: number;
  rawText: string;
  cleanText: string;
  normalizedWords: string[];
  wordCount: number;
}

export default function VoiceFollowTracker({
  isEnabled,
  scriptContent,
  currentLineIndex,
  onVoiceProgress,
  onToggleVoice
}: Props) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastTranscript, setLastTranscript] = useState('');
  const [activeMatchedLine, setActiveMatchedLine] = useState(currentLineIndex);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const indexedLinesRef = useRef<IndexedLine[]>([]);
  const currentLineIndexRef = useRef<number>(currentLineIndex);
  currentLineIndexRef.current = currentLineIndex;

  const currentMatchLineRef = useRef<number>(currentLineIndex);
  const isEnabledRef = useRef<boolean>(isEnabled);
  isEnabledRef.current = isEnabled;
  const isListeningRef = useRef<boolean>(false);
  isListeningRef.current = isListening;
  const isStoppingRef = useRef<boolean>(false);
  const restartTimerRef = useRef<NodeJS.Timeout | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const onVoiceProgressRef = useRef(onVoiceProgress);
  onVoiceProgressRef.current = onVoiceProgress;

  // Index and normalize lines from script content
  useEffect(() => {
    const rawLines = scriptContent.split('\n');
    const indexed: IndexedLine[] = rawLines.map((raw, idx) => {
      const clean = stripAllScriptMarkers(raw);
      const normalized = normalizeVoiceText(clean);
      const words = normalized.split(' ').filter(w => w.length > 0);
      return {
        lineIndex: idx,
        rawText: raw,
        cleanText: clean,
        normalizedWords: words,
        wordCount: words.length
      };
    });
    indexedLinesRef.current = indexed;
  }, [scriptContent]);

  // Keep internal match line in sync when external currentLineIndex changes significantly (e.g. manual scroll or escaleta jump)
  useEffect(() => {
    if (Math.abs(currentLineIndex - currentMatchLineRef.current) > 2) {
      currentMatchLineRef.current = currentLineIndex;
      setActiveMatchedLine(currentLineIndex);
    }
  }, [currentLineIndex]);

  const scoreLineMatch = useCallback((line: IndexedLine, spokenWords: string[]): { score: number; lastWordIdx: number } => {
    if (line.normalizedWords.length === 0 || spokenWords.length === 0) {
      return { score: 0, lastWordIdx: -1 };
    }

    let matchScore = 0;
    let lastWordIdx = -1;
    let consecutiveMatches = 0;

    for (let s = 0; s < spokenWords.length; s++) {
      const word = spokenWords[s];
      if (word.length < 2) continue;

      const isStopWord = PORTUGUESE_STOP_WORDS.has(word);
      const pos = line.normalizedWords.indexOf(word);

      if (pos !== -1) {
        // Stopwords get small weight, distinctive words get high weight
        const baseScore = isStopWord ? 0.35 : 1.4;
        matchScore += baseScore;

        // Bigram and trigram bonuses for ordered consecutive words
        if (lastWordIdx !== -1 && pos === lastWordIdx + 1) {
          consecutiveMatches++;
          matchScore += 2.5 * consecutiveMatches;
        } else {
          consecutiveMatches = 0;
        }

        lastWordIdx = Math.max(lastWordIdx, pos);
      }
    }

    return { score: matchScore, lastWordIdx };
  }, []);

  const processSpeech = useCallback((spokenRaw: string) => {
    const normalizedSpoken = normalizeVoiceText(spokenRaw);
    const spokenTokens = normalizedSpoken.split(' ').filter(w => w.length > 0);
    if (spokenTokens.length === 0) return;

    // Use the most recent ~10 words (current phrase/utterance)
    const recentSpoken = spokenTokens.slice(-10);
    const displaySnippet = spokenTokens.slice(-6).join(' ');
    setLastTranscript(displaySnippet);

    const lines = indexedLinesRef.current;
    if (lines.length === 0) return;

    const curLine = currentLineIndexRef.current;
    let bestLineIndex = -1;
    let bestScore = 0;
    let bestLastWordIdx = -1;

    // 1. First priority: Search local window around current reading line [curLine - 1, curLine + 7]
    const localStart = Math.max(0, curLine - 1);
    const localEnd = Math.min(lines.length - 1, curLine + 7);

    for (let i = localStart; i <= localEnd; i++) {
      const candidate = lines[i];
      if (!candidate || candidate.wordCount === 0) continue;

      const { score, lastWordIdx } = scoreLineMatch(candidate, recentSpoken);
      if (score > bestScore) {
        bestScore = score;
        bestLineIndex = candidate.lineIndex;
        bestLastWordIdx = lastWordIdx;
      }
    }

    // 2. Second priority: If no good local match, perform global scan across entire script
    // Require higher confidence (score >= 2.8) to prevent false jumps
    if (bestScore < 1.2) {
      for (let i = 0; i < lines.length; i++) {
        // Skip already checked local window
        if (i >= localStart && i <= localEnd) continue;

        const candidate = lines[i];
        if (!candidate || candidate.wordCount === 0) continue;

        const { score, lastWordIdx } = scoreLineMatch(candidate, recentSpoken);
        if (score > bestScore && score >= 2.8) {
          bestScore = score;
          bestLineIndex = candidate.lineIndex;
          bestLastWordIdx = lastWordIdx;
        }
      }
    }

    // If a confident match was identified:
    if (bestLineIndex !== -1 && bestScore >= 1.0) {
      const targetLine = lines[bestLineIndex];
      const wordFraction = (targetLine && targetLine.wordCount > 0 && bestLastWordIdx >= 0)
        ? Math.min(0.95, (bestLastWordIdx + 1) / targetLine.wordCount)
        : 0.1;

      currentMatchLineRef.current = bestLineIndex;
      setActiveMatchedLine(bestLineIndex);
      setIsSpeaking(true);

      // Notify parent to smoothly scroll the text to this position
      onVoiceProgressRef.current({
        lineIndex: bestLineIndex,
        wordFraction,
        isSpeaking: true,
        transcript: displaySnippet
      });

      // Clear any pending silence timeout
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }

      // If user stops speaking for 1.8 seconds, signal silence to pause the scroll
      silenceTimerRef.current = setTimeout(() => {
        setIsSpeaking(false);
        onVoiceProgressRef.current({
          lineIndex: currentMatchLineRef.current,
          wordFraction: 0,
          isSpeaking: false,
          transcript: ''
        });
      }, 1800);
    }
  }, [scoreLineMatch]);

  useEffect(() => {
    if (!isEnabled) {
      isStoppingRef.current = true;
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      stopListening();
      return;
    }

    isStoppingRef.current = false;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setErrorMsg('Reconhecimento de voz não suportado neste navegador. Use Chrome, Edge ou Safari.');
      onToggleVoice(false);
      return;
    }

    const initRecognition = () => {
      if (isStoppingRef.current || !isEnabledRef.current) return;

      try {
        if (recognitionRef.current) {
          recognitionRef.current.onstart = null;
          recognitionRef.current.onend = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.onresult = null;
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
          isListeningRef.current = true;
          setErrorMsg(null);
        };

        recognition.onerror = (event: any) => {
          console.warn('Speech recognition error:', event.error);
          if (event.error === 'not-allowed') {
            setErrorMsg('Permissão de microfone não autorizada. Clique no ícone de cadeado do navegador para permitir.');
            onToggleVoice(false);
          } else if (event.error === 'audio-capture') {
            setErrorMsg('Microfone ocupado pela câmera. Reconectando...');
            scheduleRestart(800);
          } else if (event.error === 'aborted') {
            scheduleRestart(300);
          } else if (event.error === 'network') {
            setErrorMsg('Reconectando serviço de voz...');
            scheduleRestart(1000);
          }
        };

        recognition.onend = () => {
          setIsListening(false);
          isListeningRef.current = false;
          if (isStoppingRef.current || !isEnabledRef.current) {
            return;
          }
          // Safely restart after end
          scheduleRestart(250);
        };

        recognition.onresult = (event: any) => {
          let fullUtterance = '';
          for (let i = 0; i < event.results.length; ++i) {
            fullUtterance += event.results[i][0].transcript + ' ';
          }

          processSpeech(fullUtterance);
        };

        recognition.start();
        recognitionRef.current = recognition;
      } catch (e) {
        console.warn('Recognition init err:', e);
        scheduleRestart(1000);
      }
    };

    const scheduleRestart = (delayMs: number) => {
      if (isStoppingRef.current || !isEnabledRef.current) return;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      restartTimerRef.current = setTimeout(() => {
        if (isEnabledRef.current && !isStoppingRef.current) {
          initRecognition();
        }
      }, delayMs);
    };

    // Watchdog to ensure recognition stays active
    const watchdog = setInterval(() => {
      if (isEnabledRef.current && !isStoppingRef.current && !isListeningRef.current) {
        initRecognition();
      }
    }, 2500);

    const handleCameraToggle = () => {
      if (isEnabledRef.current && !isStoppingRef.current) {
        setTimeout(() => {
          initRecognition();
        }, 500);
      }
    };
    window.addEventListener('camera_stream_toggled', handleCameraToggle);

    initRecognition();

    return () => {
      isStoppingRef.current = true;
      clearInterval(watchdog);
      window.removeEventListener('camera_stream_toggled', handleCameraToggle);
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      stopListening();
    };
  }, [isEnabled, onToggleVoice, processSpeech]);

  const stopListening = () => {
    isStoppingRef.current = true;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (recognitionRef.current) {
      recognitionRef.current.onstart = null;
      recognitionRef.current.onend = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onresult = null;
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    setIsListening(false);
    setIsSpeaking(false);
    isListeningRef.current = false;
  };

  const manualRestart = () => {
    isStoppingRef.current = false;
    setErrorMsg(null);
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    try {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
        recognitionRef.current = null;
      }
      const recognition = new SpeechRecognition();
      recognition.lang = 'pt-BR';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onstart = () => {
        setIsListening(true);
        isListeningRef.current = true;
      };
      recognition.onresult = (event: any) => {
        let fullUtterance = '';
        for (let i = 0; i < event.results.length; ++i) {
          fullUtterance += event.results[i][0].transcript + ' ';
        }
        processSpeech(fullUtterance);
      };
      recognition.start();
      recognitionRef.current = recognition;
    } catch (err) {
      console.warn('Manual restart err:', err);
    }
  };

  if (!isEnabled) return null;

  return (
    <div className="fixed bottom-16 sm:bottom-20 left-3 sm:left-6 z-40 bg-[#0A0A0F]/95 backdrop-blur-md border border-indigo-500/50 rounded-2xl px-3.5 py-2.5 shadow-2xl flex items-center gap-3 text-xs text-white max-w-[92vw] sm:max-w-md pointer-events-auto transition-all animate-fadeIn">
      {/* Microphone Status Indicator */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div className={`relative flex h-8 w-8 rounded-full items-center justify-center border ${
          isSpeaking 
            ? 'bg-indigo-500/20 border-indigo-400 text-indigo-300' 
            : isListening 
              ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300' 
              : 'bg-amber-500/20 border-amber-400 text-amber-300'
        }`}>
          {isSpeaking && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-60"></span>
          )}
          <Mic size={16} className={isSpeaking ? 'text-indigo-400 animate-pulse' : isListening ? 'text-emerald-400' : 'text-amber-400'} />
        </div>
      </div>

      {/* Center Feedback Area */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-[11px] uppercase font-bold tracking-wider text-indigo-400 flex items-center gap-1">
            <Sparkles size={12} className="text-amber-400" />
            <span>Smart Follow (Voz)</span>
          </div>

          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-medium ${
            isSpeaking 
              ? 'bg-indigo-900/60 text-indigo-300 border border-indigo-700/60' 
              : 'bg-gray-800 text-gray-400 border border-gray-700'
          }`}>
            {isSpeaking ? `Linha ${activeMatchedLine + 1}` : 'Aguardando voz'}
          </span>
        </div>

        {errorMsg ? (
          <p className="text-[11px] text-amber-400 flex items-center gap-1 mt-0.5">
            <AlertCircle size={11} className="shrink-0" /> <span className="truncate">{errorMsg}</span>
          </p>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] text-gray-300 mt-0.5 truncate">
            {isSpeaking ? (
              <>
                <Volume2 size={11} className="text-indigo-400 shrink-0 animate-pulse" />
                <span className="text-white font-medium truncate">"{lastTranscript}"</span>
                <span className="text-[10px] text-emerald-400 shrink-0 font-semibold">• Rolando</span>
              </>
            ) : isListening ? (
              <>
                <PauseCircle size={11} className="text-amber-400 shrink-0" />
                <span className="text-gray-400 truncate">Fale para o texto rolar automaticamente</span>
              </>
            ) : (
              <span className="text-amber-400 truncate">Reconectando microfone...</span>
            )}
          </div>
        )}
      </div>

      {/* Manual Reconnect Button if disconnected */}
      {!isListening && (
        <button
          onClick={manualRestart}
          className="p-1.5 hover:bg-gray-800 text-amber-400 rounded-lg transition-colors shrink-0"
          title="Reconectar microfone"
        >
          <RefreshCw size={14} />
        </button>
      )}

      {/* Toggle / Disable Voice Follow */}
      <button
        onClick={() => onToggleVoice(false)}
        className="p-1.5 hover:bg-gray-800 text-gray-400 hover:text-white rounded-lg transition-colors shrink-0"
        title="Desativar acompanhamento por voz"
      >
        <MicOff size={15} />
      </button>
    </div>
  );
}
