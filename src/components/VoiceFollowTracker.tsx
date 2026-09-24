import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Mic, 
  MicOff, 
  AlertCircle, 
  RefreshCw, 
  Volume2, 
  Sparkles, 
  PauseCircle, 
  Video, 
  HelpCircle, 
  CheckCircle,
  Gauge
} from 'lucide-react';
import { 
  stripAllScriptMarkers, 
  normalizeVoiceText, 
  PORTUGUESE_STOP_WORDS, 
  fuzzyWordMatch, 
  playAudioBeep 
} from '../utils';

export interface VoiceProgressData {
  lineIndex: number;
  wordFraction: number;
  isSpeaking: boolean;
  transcript: string;
  cadenceWpm?: number;
  cadenceRatio?: number;
  cadenceQuality?: 'slow' | 'normal' | 'fast';
}

export type VoiceActionCommand = 'play' | 'pause' | 'speed_up' | 'speed_down' | 'restart';

interface Props {
  isEnabled: boolean;
  scriptContent: string;
  currentLineIndex: number;
  onVoiceProgress: (data: VoiceProgressData) => void;
  onToggleVoice: (enabled: boolean) => void;
  onVoiceCommand?: (cmd: VoiceActionCommand) => void;
  isCameraRecording?: boolean;
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
  onToggleVoice,
  onVoiceCommand,
  isCameraRecording = false
}: Props) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastTranscript, setLastTranscript] = useState('');
  const [activeMatchedLine, setActiveMatchedLine] = useState(currentLineIndex);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeVoiceCommand, setActiveVoiceCommand] = useState<string | null>(null);
  const [showCommandsHelp, setShowCommandsHelp] = useState(false);
  const [isCamRecordingInternal, setIsCamRecordingInternal] = useState(isCameraRecording);
  const [liveCadenceWpm, setLiveCadenceWpm] = useState<number>(130);
  const [cadenceQuality, setCadenceQuality] = useState<'slow' | 'normal' | 'fast'>('normal');

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
  const commandFeedbackTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastProcessedSpokenRef = useRef<string>('');

  // Speech cadence tracking refs
  const speechEventsRef = useRef<{ time: number; wordCount: number }[]>([]);
  const lastCadenceTokensCountRef = useRef<number>(0);
  const currentCadenceWpmRef = useRef<number>(130);
  const currentCadenceRatioRef = useRef<number>(1.0);

  const onVoiceProgressRef = useRef(onVoiceProgress);
  onVoiceProgressRef.current = onVoiceProgress;
  const onVoiceCommandRef = useRef(onVoiceCommand);
  onVoiceCommandRef.current = onVoiceCommand;

  // Sync external camera recording prop
  useEffect(() => {
    setIsCamRecordingInternal(isCameraRecording);
  }, [isCameraRecording]);

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

  // Keep internal match line in sync when external currentLineIndex jumps significantly
  useEffect(() => {
    if (Math.abs(currentLineIndex - currentMatchLineRef.current) > 2) {
      currentMatchLineRef.current = currentLineIndex;
      setActiveMatchedLine(currentLineIndex);
    }
  }, [currentLineIndex]);

  // Direct Voice Commands Parser (pausar, continuar, mais rápido, mais devagar, reiniciar)
  const checkVoiceCommands = useCallback((spokenText: string): boolean => {
    if (!spokenText || !onVoiceCommandRef.current) return false;
    const clean = normalizeVoiceText(spokenText);

    let detectedCmd: VoiceActionCommand | null = null;
    let label = '';

    if (
      clean.includes('pausar') || 
      clean.includes('pausa') || 
      clean.includes('parar teleprompter') || 
      clean.includes('parar texto') ||
      clean === 'parar' ||
      clean.includes('espera um pouco')
    ) {
      detectedCmd = 'pause';
      label = 'Pausar Leitura ⏸️';
    } else if (
      clean.includes('continuar') || 
      clean.includes('prosseguir') || 
      clean.includes('rolar texto') || 
      clean.includes('play') ||
      clean.includes('iniciar leitura') ||
      clean === 'rolar'
    ) {
      detectedCmd = 'play';
      label = 'Continuar Leitura ▶️';
    } else if (
      clean.includes('mais rapido') || 
      clean.includes('acelerar') || 
      clean.includes('aumentar velocidade')
    ) {
      detectedCmd = 'speed_up';
      label = 'Mais Rápido ⏩';
    } else if (
      clean.includes('mais devagar') || 
      clean.includes('desacelerar') || 
      clean.includes('diminuir velocidade') ||
      clean.includes('mais lento')
    ) {
      detectedCmd = 'speed_down';
      label = 'Mais Devagar ⏪';
    } else if (
      clean.includes('reiniciar') || 
      clean.includes('voltar ao inicio') || 
      clean.includes('do comeco') ||
      clean.includes('recomecar')
    ) {
      detectedCmd = 'restart';
      label = 'Reiniciar do Início 🔄';
    }

    if (detectedCmd) {
      playAudioBeep(750, 100);
      onVoiceCommandRef.current(detectedCmd);
      setActiveVoiceCommand(label);
      if (commandFeedbackTimerRef.current) clearTimeout(commandFeedbackTimerRef.current);
      commandFeedbackTimerRef.current = setTimeout(() => {
        setActiveVoiceCommand(null);
      }, 2500);
      return true;
    }

    return false;
  }, []);

  // Sequence-based line matching algorithm with Portuguese fuzzy & inflection tolerance
  const scoreLineMatch = useCallback((line: IndexedLine, spokenWords: string[]): { score: number; lastWordIdx: number; matchedWords: number } => {
    if (line.normalizedWords.length === 0 || spokenWords.length === 0) {
      return { score: 0, lastWordIdx: -1, matchedWords: 0 };
    }

    let matchScore = 0;
    let lastPos = -1;
    let consecutiveMatches = 0;
    let matchedWordsCount = 0;

    for (let s = 0; s < spokenWords.length; s++) {
      const sw = spokenWords[s];
      if (sw.length < 2) continue;
      const isStopWord = PORTUGUESE_STOP_WORDS.has(sw);

      let bestPos = -1;
      let bestWordScore = 0;

      // 1. Search forward from lastPos in the line (ordered sequence)
      const startSearch = lastPos >= 0 ? lastPos + 1 : 0;
      for (let p = startSearch; p < line.normalizedWords.length; p++) {
        const lw = line.normalizedWords[p];
        const match = fuzzyWordMatch(sw, lw);
        if (match.matches) {
          bestPos = p;
          bestWordScore = match.score;
          break;
        }
      }

      // 2. If not found forward, search full line with slight penalty
      if (bestPos === -1 && startSearch > 0) {
        for (let p = 0; p < line.normalizedWords.length; p++) {
          const lw = line.normalizedWords[p];
          const match = fuzzyWordMatch(sw, lw);
          if (match.matches) {
            bestPos = p;
            bestWordScore = match.score * 0.8;
            break;
          }
        }
      }

      if (bestPos !== -1) {
        matchedWordsCount++;
        const baseWeight = isStopWord ? 0.45 : 1.7;
        matchScore += baseWeight * bestWordScore;

        // Bigram and trigram bonuses for ordered consecutive words
        if (lastPos !== -1 && (bestPos === lastPos + 1 || bestPos === lastPos + 2)) {
          consecutiveMatches++;
          matchScore += 3.2 * consecutiveMatches;
        } else {
          consecutiveMatches = 0;
        }

        lastPos = bestPos;
      }
    }

    return { score: matchScore, lastWordIdx: lastPos, matchedWords: matchedWordsCount };
  }, []);

  const processSpeech = useCallback((spokenRaw: string) => {
    if (!spokenRaw) return;
    const normalizedSpoken = normalizeVoiceText(spokenRaw);
    if (!normalizedSpoken || normalizedSpoken === lastProcessedSpokenRef.current) return;
    lastProcessedSpokenRef.current = normalizedSpoken;

    // First, test for direct voice action commands
    if (checkVoiceCommands(normalizedSpoken)) {
      return;
    }

    const spokenTokens = normalizedSpoken.split(' ').filter(w => w.length > 0);
    if (spokenTokens.length === 0) return;

    // Real-time speech cadence calculation (Words Per Minute / PPM)
    const now = performance.now();
    const tokenCount = spokenTokens.length;
    const deltaWords = Math.max(1, tokenCount - lastCadenceTokensCountRef.current);
    lastCadenceTokensCountRef.current = tokenCount;

    speechEventsRef.current.push({ time: now, wordCount: deltaWords });
    // Keep sliding window of last 4.5 seconds of spoken events
    speechEventsRef.current = speechEventsRef.current.filter(e => now - e.time <= 4500);

    let calculatedWpm = currentCadenceWpmRef.current;
    if (speechEventsRef.current.length >= 2) {
      const windowStart = speechEventsRef.current[0].time;
      const windowDurationSec = (now - windowStart) / 1000;
      const totalWords = speechEventsRef.current.reduce((acc, e) => acc + e.wordCount, 0);

      if (windowDurationSec >= 0.8 && totalWords >= 2) {
        const wordsPerSec = totalWords / windowDurationSec;
        const rawWpm = wordsPerSec * 60;
        const clampedWpm = Math.max(65, Math.min(230, Math.round(rawWpm)));
        // Smooth exponential moving average (alpha = 0.35)
        calculatedWpm = Math.round(currentCadenceWpmRef.current * 0.65 + clampedWpm * 0.35);
        currentCadenceWpmRef.current = calculatedWpm;
      }
    }

    // Teleprompter nominal baseline in Portuguese is ~130 WPM
    const calculatedRatio = Math.max(0.65, Math.min(1.85, +(calculatedWpm / 130).toFixed(2)));
    currentCadenceRatioRef.current = calculatedRatio;

    let quality: 'slow' | 'normal' | 'fast' = 'normal';
    if (calculatedWpm < 110) {
      quality = 'slow';
    } else if (calculatedWpm > 155) {
      quality = 'fast';
    } else {
      quality = 'normal';
    }

    setLiveCadenceWpm(calculatedWpm);
    setCadenceQuality(quality);

    // Use the most recent 12 words (current phrase/utterance)
    const recentSpoken = spokenTokens.slice(-12);
    const displaySnippet = spokenTokens.slice(-5).join(' ');
    setLastTranscript(displaySnippet);

    const lines = indexedLinesRef.current;
    if (lines.length === 0) return;

    const curLine = currentLineIndexRef.current;
    let bestLineIndex = -1;
    let bestScore = 0;
    let bestLastWordIdx = -1;

    // Tier 1: Forward local window around current reading line [curLine, curLine + 12]
    // Uses proximity weighting so lines immediately ahead have high priority
    const forwardStart = Math.max(0, curLine);
    const forwardEnd = Math.min(lines.length - 1, curLine + 12);

    for (let i = forwardStart; i <= forwardEnd; i++) {
      const candidate = lines[i];
      if (!candidate || candidate.wordCount === 0) continue;

      const { score, lastWordIdx } = scoreLineMatch(candidate, recentSpoken);
      const distance = i - curLine;
      const proximityMultiplier = 1.0 + Math.max(0, (6 - distance) * 0.06);
      const adjustedScore = score * proximityMultiplier;

      if (adjustedScore > bestScore && adjustedScore >= 1.2) {
        bestScore = adjustedScore;
        bestLineIndex = candidate.lineIndex;
        bestLastWordIdx = lastWordIdx;
      }
    }

    // Tier 2: Backward local window [curLine - 3, curLine - 1] (in case speaker stumbles or re-reads)
    if (bestScore < 2.5) {
      const backStart = Math.max(0, curLine - 3);
      for (let i = backStart; i < curLine; i++) {
        const candidate = lines[i];
        if (!candidate || candidate.wordCount === 0) continue;

        const { score, lastWordIdx } = scoreLineMatch(candidate, recentSpoken);
        if (score > bestScore && score >= 2.0) {
          bestScore = score;
          bestLineIndex = candidate.lineIndex;
          bestLastWordIdx = lastWordIdx;
        }
      }
    }

    // Tier 3: Global scan across entire script (requires higher confidence threshold)
    if (bestScore < 2.0) {
      for (let i = 0; i < lines.length; i++) {
        if (i >= forwardStart && i <= forwardEnd) continue;
        const candidate = lines[i];
        if (!candidate || candidate.wordCount === 0) continue;

        const { score, lastWordIdx } = scoreLineMatch(candidate, recentSpoken);
        if (score > bestScore && score >= 3.2) {
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

      // Notify parent to smoothly scroll the text to this position with cadence
      onVoiceProgressRef.current({
        lineIndex: bestLineIndex,
        wordFraction,
        isSpeaking: true,
        transcript: displaySnippet,
        cadenceWpm: calculatedWpm,
        cadenceRatio: calculatedRatio,
        cadenceQuality: quality
      });

      // Clear any pending silence timeout
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }

      // If user stops speaking for 1.8 seconds, signal silence to pause the scroll
      silenceTimerRef.current = setTimeout(() => {
        setIsSpeaking(false);
        speechEventsRef.current = [];
        lastCadenceTokensCountRef.current = 0;
        onVoiceProgressRef.current({
          lineIndex: currentMatchLineRef.current,
          wordFraction: 0,
          isSpeaking: false,
          transcript: '',
          cadenceWpm: currentCadenceWpmRef.current,
          cadenceRatio: 1.0,
          cadenceQuality: 'normal'
        });
      }, 1800);
    }
  }, [checkVoiceCommands, scoreLineMatch]);

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
          const err = event.error;
          if (err === 'no-speech') {
            // Normal pause in speech: keep listening, do not display error
            return;
          }
          console.warn('Speech recognition status:', err);

          if (err === 'not-allowed') {
            setErrorMsg('Permissão de microfone negada. Clique no cadeado do navegador para permitir.');
            onToggleVoice(false);
          } else if (err === 'audio-capture') {
            // Camera or OS audio device handover
            setErrorMsg('Sincronizando áudio da câmera...');
            scheduleRestart(400);
          } else if (err === 'aborted') {
            scheduleRestart(250);
          } else if (err === 'network') {
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
          // Seamless restart on pause
          scheduleRestart(200);
        };

        recognition.onresult = (event: any) => {
          let latestInterim = '';
          let latestFinal = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              latestFinal += transcript + ' ';
            } else {
              latestInterim += transcript + ' ';
            }
          }

          const currentPhrase = (latestFinal + ' ' + latestInterim).trim();
          if (currentPhrase) {
            processSpeech(currentPhrase);
          }
        };

        recognition.start();
        recognitionRef.current = recognition;
      } catch (e) {
        console.warn('Recognition init err:', e);
        scheduleRestart(800);
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

    // Listen to camera hardware events to prevent microphone collisions
    const handleCameraStreamToggle = () => {
      if (isEnabledRef.current && !isStoppingRef.current) {
        scheduleRestart(350);
      }
    };

    const handleCameraRecordingState = (e: any) => {
      const rec = e.detail?.isRecording;
      setIsCamRecordingInternal(Boolean(rec));
      if (isEnabledRef.current && !isStoppingRef.current) {
        scheduleRestart(300);
      }
    };

    window.addEventListener('camera_stream_toggled', handleCameraStreamToggle);
    window.addEventListener('camera_recording_state', handleCameraRecordingState);

    initRecognition();

    return () => {
      isStoppingRef.current = true;
      clearInterval(watchdog);
      window.removeEventListener('camera_stream_toggled', handleCameraStreamToggle);
      window.removeEventListener('camera_recording_state', handleCameraRecordingState);
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      if (commandFeedbackTimerRef.current) {
        clearTimeout(commandFeedbackTimerRef.current);
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
        let chunk = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          chunk += event.results[i][0].transcript + ' ';
        }
        processSpeech(chunk.trim());
      };
      recognition.start();
      recognitionRef.current = recognition;
    } catch (err) {
      console.warn('Manual restart err:', err);
    }
  };

  if (!isEnabled) return null;

  return (
    <div className="fixed bottom-16 sm:bottom-20 left-3 sm:left-6 z-40 bg-[#0A0A0F]/95 backdrop-blur-md border border-indigo-500/50 rounded-2xl px-3.5 py-2.5 shadow-2xl flex flex-col gap-2 text-xs text-white max-w-[92vw] sm:max-w-md pointer-events-auto transition-all animate-fadeIn">
      {/* Top Banner if Active Voice Command Detected */}
      {activeVoiceCommand && (
        <div className="bg-amber-500/20 border border-amber-400/50 text-amber-300 px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center justify-between animate-bounce">
          <span className="flex items-center gap-1.5">
            <Sparkles size={13} className="text-amber-400" />
            Comando de Voz: {activeVoiceCommand}
          </span>
          <CheckCircle size={13} className="text-emerald-400" />
        </div>
      )}

      <div className="flex items-center gap-3">
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
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-[11px] uppercase font-bold tracking-wider text-indigo-400 flex items-center gap-1">
              <Sparkles size={12} className="text-amber-400" />
              <span>Smart Follow (Voz)</span>
            </div>

            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-medium ${
              isSpeaking 
                ? 'bg-indigo-900/60 text-indigo-300 border border-indigo-700/60' 
                : 'bg-gray-800 text-gray-400 border border-gray-700'
            }`}>
              {isSpeaking ? `Linha ${activeMatchedLine + 1}` : 'Aguardando fala'}
            </span>

            {/* Live Speech Cadence (WPM / PPM) Speed Matching Badge */}
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 border transition-all ${
                isSpeaking
                  ? cadenceQuality === 'fast'
                    ? 'bg-amber-950/80 border-amber-500/80 text-amber-300'
                    : cadenceQuality === 'slow'
                      ? 'bg-blue-950/80 border-blue-500/80 text-blue-300'
                      : 'bg-emerald-950/80 border-emerald-500/80 text-emerald-300'
                  : 'bg-gray-800/90 border-gray-700 text-gray-400'
              }`}
              title={`Cadência da fala: ${liveCadenceWpm} PPM (${cadenceQuality === 'fast' ? 'Acelerada' : cadenceQuality === 'slow' ? 'Pausada' : 'Ritmo Ideal'}). A velocidade de rolagem acompanha seu ritmo automaticamente.`}
            >
              <Gauge size={10} className={isSpeaking ? (cadenceQuality === 'fast' ? 'text-amber-400 animate-pulse' : 'text-emerald-400') : 'text-gray-400'} />
              <span>{isSpeaking ? `${liveCadenceWpm} PPM` : '130 PPM'}</span>
            </span>

            {/* Camera Sync Badge */}
            {isCamRecordingInternal && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-red-950/80 border border-red-600/80 text-red-300 flex items-center gap-1 animate-pulse">
                <Video size={10} className="text-red-400" />
                <span>REC Sincronizado</span>
              </span>
            )}
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

        {/* Action Buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Voice Commands Info Toggle */}
          <button
            onClick={() => setShowCommandsHelp(prev => !prev)}
            className={`p-1.5 rounded-lg transition-colors ${
              showCommandsHelp ? 'bg-indigo-900/60 text-indigo-300' : 'hover:bg-gray-800 text-gray-400 hover:text-gray-200'
            }`}
            title="Ver comandos de voz disponíveis"
          >
            <HelpCircle size={14} />
          </button>

          {/* Manual Reconnect Button if disconnected */}
          {!isListening && (
            <button
              onClick={manualRestart}
              className="p-1.5 hover:bg-gray-800 text-amber-400 rounded-lg transition-colors"
              title="Reconectar microfone"
            >
              <RefreshCw size={14} />
            </button>
          )}

          {/* Toggle / Disable Voice Follow */}
          <button
            onClick={() => onToggleVoice(false)}
            className="p-1.5 hover:bg-gray-800 text-gray-400 hover:text-white rounded-lg transition-colors"
            title="Desativar acompanhamento por voz"
          >
            <MicOff size={15} />
          </button>
        </div>
      </div>

      {/* Expandable Voice Commands Help Box */}
      {showCommandsHelp && (
        <div className="pt-2 border-t border-gray-800 text-[11px] text-gray-300 flex flex-col gap-1 bg-[#141622]/90 -mx-1 -mb-1 p-2 rounded-xl">
          <span className="font-bold text-indigo-300 flex items-center gap-1">
            <Sparkles size={11} /> Comandos por Voz Suportados:
          </span>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-gray-300 mt-1">
            <div>• <strong className="text-white">"Pausar"</strong> / "Parar"</div>
            <div>• <strong className="text-white">"Continuar"</strong> / "Play"</div>
            <div>• <strong className="text-white">"Mais rápido"</strong> / "Acelerar"</div>
            <div>• <strong className="text-white">"Mais devagar"</strong></div>
            <div className="col-span-2">• <strong className="text-white">"Reiniciar"</strong> / "Voltar ao início"</div>
          </div>
          <span className="text-[9px] text-gray-400 mt-1 italic">
            Além dos comandos, o texto rola continuamente conforme você lê o roteiro.
          </span>
        </div>
      )}
    </div>
  );
}
