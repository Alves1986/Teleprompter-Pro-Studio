import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  Gauge,
  Activity
} from 'lucide-react';
import { 
  tokenizeScript,
  ScriptWordToken,
  ScriptLineToken,
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
  cadenceWpm: number;
  cadenceRatio: number;
  cadenceQuality: 'slow' | 'normal' | 'fast';
  matchedGlobalWordIndex: number;
  trechoStartWordIndex: number;
  trechoEndWordIndex: number;
  activeSnippet: string;
}

export type VoiceActionCommand = 'play' | 'pause' | 'speed_up' | 'speed_down' | 'restart';

interface Props {
  isEnabled: boolean;
  scriptContent: string;
  currentLineIndex: number;
  currentWordIndex?: number;
  onVoiceProgress: (data: VoiceProgressData) => void;
  onToggleVoice: (enabled: boolean) => void;
  onVoiceCommand?: (cmd: VoiceActionCommand) => void;
  isCameraRecording?: boolean;
}

interface CadencePoint {
  time: number;
  wordIndex: number;
}

export default function VoiceFollowTracker({
  isEnabled,
  scriptContent,
  currentLineIndex,
  currentWordIndex = 0,
  onVoiceProgress,
  onToggleVoice,
  onVoiceCommand,
  isCameraRecording = false
}: Props) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastTranscript, setLastTranscript] = useState('');
  const [activeMatchedLine, setActiveMatchedLine] = useState(currentLineIndex);
  const [activeMatchedWord, setActiveMatchedWord] = useState(currentWordIndex);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeVoiceCommand, setActiveVoiceCommand] = useState<string | null>(null);
  const [showCommandsHelp, setShowCommandsHelp] = useState(false);
  const [isCamRecordingInternal, setIsCamRecordingInternal] = useState(isCameraRecording);
  const [liveCadenceWpm, setLiveCadenceWpm] = useState<number>(130);
  const [cadenceQuality, setCadenceQuality] = useState<'slow' | 'normal' | 'fast'>('normal');

  const recognitionRef = useRef<any>(null);
  const currentWordIdxRef = useRef<number>(currentWordIndex);
  currentWordIdxRef.current = currentWordIndex;

  const currentLineIndexRef = useRef<number>(currentLineIndex);
  currentLineIndexRef.current = currentLineIndex;

  const isEnabledRef = useRef<boolean>(isEnabled);
  isEnabledRef.current = isEnabled;
  const isListeningRef = useRef<boolean>(false);
  isListeningRef.current = isListening;
  const isStoppingRef = useRef<boolean>(false);
  const restartTimerRef = useRef<NodeJS.Timeout | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const commandFeedbackTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastProcessedSpokenRef = useRef<string>('');

  // Rhythm and Speech cadence tracking refs
  const cadenceHistoryRef = useRef<CadencePoint[]>([]);
  const currentCadenceWpmRef = useRef<number>(130);
  const currentCadenceRatioRef = useRef<number>(1.0);

  const onVoiceProgressRef = useRef(onVoiceProgress);
  onVoiceProgressRef.current = onVoiceProgress;
  const onVoiceCommandRef = useRef(onVoiceCommand);
  onVoiceCommandRef.current = onVoiceCommand;

  // Tokenize the script into words and lines
  const tokenized = useMemo(() => tokenizeScript(scriptContent), [scriptContent]);
  const allWordsRef = useRef<ScriptWordToken[]>([]);
  allWordsRef.current = tokenized.allWords;
  const linesRef = useRef<ScriptLineToken[]>([]);
  linesRef.current = tokenized.lines;

  // Sync external camera recording prop
  useEffect(() => {
    setIsCamRecordingInternal(isCameraRecording);
  }, [isCameraRecording]);

  // Keep internal word/line match in sync when external index jumps significantly (e.g. user dragged scroll)
  useEffect(() => {
    if (typeof currentWordIndex === 'number' && Math.abs(currentWordIndex - currentWordIdxRef.current) > 5) {
      currentWordIdxRef.current = currentWordIndex;
      setActiveMatchedWord(currentWordIndex);
      if (allWordsRef.current[currentWordIndex]) {
        setActiveMatchedLine(allWordsRef.current[currentWordIndex].lineIndex);
      }
    }
  }, [currentWordIndex]);

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

  /**
   * Search for the exact spoken passage (trecho) in the tokenized script.
   * Compares candidate word windows with fuzzy Portuguese phonetic and inflection matching.
   */
  const findBestTrechoMatch = useCallback((
    spokenTokens: string[], 
    searchStart: number, 
    searchEnd: number
  ): { score: number; startIdx: number; endIdx: number; matchedWords: number } => {
    const allWords = allWordsRef.current;
    if (allWords.length === 0 || spokenTokens.length === 0) {
      return { score: 0, startIdx: -1, endIdx: -1, matchedWords: 0 };
    }

    const startBound = Math.max(0, searchStart);
    const endBound = Math.min(allWords.length - 1, searchEnd);

    let bestScore = 0;
    let bestStart = -1;
    let bestEnd = -1;
    let bestMatchedWords = 0;

    // Slide candidate window across script words
    for (let candidateStart = startBound; candidateStart <= endBound; candidateStart++) {
      let currentScore = 0;
      let consecutive = 0;
      let matchedCount = 0;
      let lastMatchedScriptPos = -1;
      let firstMatchedScriptPos = -1;

      // Try matching spoken tokens in order
      let scriptScanPos = candidateStart;
      for (let s = 0; s < spokenTokens.length; s++) {
        const sw = spokenTokens[s];
        if (sw.length < 2) continue;
        const isStopWord = PORTUGUESE_STOP_WORDS.has(sw);

        // Search in a narrow forward window of 4 script words from current scan
        let foundWordPos = -1;
        let wordScore = 0;
        const lookahead = Math.min(allWords.length - 1, scriptScanPos + 4);

        for (let p = scriptScanPos; p <= lookahead; p++) {
          const tw = allWords[p].normalizedWord;
          const match = fuzzyWordMatch(sw, tw);
          if (match.matches) {
            foundWordPos = p;
            wordScore = match.score;
            break;
          }
        }

        if (foundWordPos !== -1) {
          matchedCount++;
          if (firstMatchedScriptPos === -1) firstMatchedScriptPos = foundWordPos;

          const baseWeight = isStopWord ? 0.45 : 1.85;
          currentScore += baseWeight * wordScore;

          // Sequential consecutive word bonus (creates high confidence on multi-word phrases)
          if (lastMatchedScriptPos !== -1 && (foundWordPos === lastMatchedScriptPos + 1)) {
            consecutive++;
            currentScore += 2.8 * consecutive;
          } else {
            consecutive = 0;
          }

          lastMatchedScriptPos = foundWordPos;
          scriptScanPos = foundWordPos + 1;
        }
      }

      // Add proximity priority: candidates closer to current reading position are favored
      const distFromCurrent = Math.abs(candidateStart - currentWordIdxRef.current);
      const proximityMultiplier = 1.0 + Math.max(0, (15 - distFromCurrent) * 0.04);
      const finalScore = currentScore * proximityMultiplier;

      if (finalScore > bestScore && matchedCount >= 1) {
        bestScore = finalScore;
        bestStart = firstMatchedScriptPos !== -1 ? firstMatchedScriptPos : candidateStart;
        bestEnd = lastMatchedScriptPos !== -1 ? lastMatchedScriptPos : candidateStart;
        bestMatchedWords = matchedCount;
      }
    }

    return { 
      score: bestScore, 
      startIdx: bestStart, 
      endIdx: bestEnd, 
      matchedWords: bestMatchedWords 
    };
  }, []);

  const processSpeech = useCallback((spokenRaw: string) => {
    if (!spokenRaw) return;
    const normalizedSpoken = normalizeVoiceText(spokenRaw);
    if (!normalizedSpoken || normalizedSpoken === lastProcessedSpokenRef.current) return;
    lastProcessedSpokenRef.current = normalizedSpoken;

    // Check voice direct action commands first
    if (checkVoiceCommands(normalizedSpoken)) {
      return;
    }

    const spokenTokens = normalizedSpoken.split(' ').filter(w => w.length > 0);
    if (spokenTokens.length === 0) return;

    const allWords = allWordsRef.current;
    if (allWords.length === 0) return;

    const curWord = currentWordIdxRef.current;

    // 1. Primary search: Forward window around current reading position [curWord - 4, curWord + 35]
    let matchResult = findBestTrechoMatch(spokenTokens.slice(-8), curWord - 4, curWord + 35);

    // 2. Secondary search: Backward window in case user repeats or stumbles [curWord - 25, curWord]
    if (matchResult.score < 2.0) {
      const backResult = findBestTrechoMatch(spokenTokens.slice(-8), curWord - 25, curWord);
      if (backResult.score > matchResult.score && backResult.score >= 1.8) {
        matchResult = backResult;
      }
    }

    // 3. Global search: If reader jumped to another section
    if (matchResult.score < 1.6) {
      const globalResult = findBestTrechoMatch(spokenTokens.slice(-8), 0, allWords.length - 1);
      if (globalResult.score >= 3.0) {
        matchResult = globalResult;
      }
    }

    // Confident match found!
    if (matchResult.endIdx !== -1 && matchResult.score >= 1.0) {
      const matchedEndWordIdx = matchResult.endIdx;
      const matchedStartWordIdx = matchResult.startIdx;
      const matchedWord = allWords[matchedEndWordIdx];
      const lineIndex = matchedWord.lineIndex;

      // Real-time Reading Rhythm / Cadence (WPM / PPM) Calculation
      const now = performance.now();
      cadenceHistoryRef.current.push({ time: now, wordIndex: matchedEndWordIdx });
      // Keep sliding window of last 4.5 seconds
      cadenceHistoryRef.current = cadenceHistoryRef.current.filter(e => now - e.time <= 4500);

      let calculatedWpm = currentCadenceWpmRef.current;
      if (cadenceHistoryRef.current.length >= 2) {
        const oldest = cadenceHistoryRef.current[0];
        const elapsedSec = (now - oldest.time) / 1000;
        const wordsPassed = matchedEndWordIdx - oldest.wordIndex;

        if (elapsedSec >= 0.7 && wordsPassed >= 2) {
          const instantWpm = (wordsPassed / elapsedSec) * 60;
          const clamped = Math.max(70, Math.min(230, Math.round(instantWpm)));
          // Smooth exponential moving average (alpha = 0.38)
          calculatedWpm = Math.round(currentCadenceWpmRef.current * 0.62 + clamped * 0.38);
          currentCadenceWpmRef.current = calculatedWpm;
        }
      }

      // Prompter nominal baseline in Portuguese is ~130 WPM
      const calculatedRatio = Math.max(0.60, Math.min(1.90, +(calculatedWpm / 130).toFixed(2)));
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

      currentWordIdxRef.current = matchedEndWordIdx;
      setActiveMatchedWord(matchedEndWordIdx);
      setActiveMatchedLine(lineIndex);
      setIsSpeaking(true);

      const displaySnippet = spokenTokens.slice(-6).join(' ');
      setLastTranscript(displaySnippet);

      // Line progress fraction
      const lineToken = linesRef.current[lineIndex];
      const wordFraction = lineToken && lineToken.words.length > 0
        ? Math.min(0.98, (matchedEndWordIdx - lineToken.startGlobalIdx + 1) / lineToken.words.length)
        : 0.2;

      // Broadcast precise word and trecho position with rhythm data
      onVoiceProgressRef.current({
        lineIndex,
        wordFraction,
        isSpeaking: true,
        transcript: displaySnippet,
        cadenceWpm: calculatedWpm,
        cadenceRatio: calculatedRatio,
        cadenceQuality: quality,
        matchedGlobalWordIndex: matchedEndWordIdx,
        trechoStartWordIndex: matchedStartWordIdx,
        trechoEndWordIndex: matchedEndWordIdx,
        activeSnippet: displaySnippet
      });

      // Clear any pending silence timer
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }

      // If user pauses reading for 1.4s, gently pause the scrolling pace
      silenceTimerRef.current = setTimeout(() => {
        setIsSpeaking(false);
        cadenceHistoryRef.current = [];
        onVoiceProgressRef.current({
          lineIndex: lineIndex,
          wordFraction,
          isSpeaking: false,
          transcript: '',
          cadenceWpm: currentCadenceWpmRef.current,
          cadenceRatio: 1.0,
          cadenceQuality: 'normal',
          matchedGlobalWordIndex: currentWordIdxRef.current,
          trechoStartWordIndex: currentWordIdxRef.current,
          trechoEndWordIndex: currentWordIdxRef.current,
          activeSnippet: ''
        });
      }, 1400);
    }
  }, [checkVoiceCommands, findBestTrechoMatch]);

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
            return;
          }
          console.warn('Speech recognition status:', err);

          if (err === 'not-allowed') {
            setErrorMsg('Permissão de microfone negada. Clique no cadeado do navegador para permitir.');
            onToggleVoice(false);
          } else if (err === 'audio-capture') {
            setErrorMsg('Sincronizando áudio...');
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
          scheduleRestart(200);
        };

        recognition.onresult = (event: any) => {
          // Accumulate the most recent recognized speech results (keeps context across phrase finals)
          let combinedPhrase = '';
          const startResultIdx = Math.max(0, event.results.length - 3);
          for (let i = startResultIdx; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            combinedPhrase += transcript + ' ';
          }

          const trimmed = combinedPhrase.trim();
          if (trimmed) {
            processSpeech(trimmed);
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

    // Keep recognition active
    const watchdog = setInterval(() => {
      if (isEnabledRef.current && !isStoppingRef.current && !isListeningRef.current) {
        initRecognition();
      }
    }, 2500);

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
        for (let i = Math.max(0, event.results.length - 3); i < event.results.length; ++i) {
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

  const totalWords = allWordsRef.current.length;
  const speedPercentDiff = Math.round((currentCadenceRatioRef.current - 1.0) * 100);

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
              <span>Smart Voice Follow</span>
            </div>

            {/* Trecho Lido Badge */}
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
              isSpeaking 
                ? 'bg-indigo-900/60 text-indigo-200 border border-indigo-700/60' 
                : 'bg-gray-800 text-gray-400 border border-gray-700'
            }`}>
              {isSpeaking 
                ? `Trecho: Palavra ${activeMatchedWord + 1}${totalWords > 0 ? `/${totalWords}` : ''} • L${activeMatchedLine + 1}` 
                : 'Aguardando sua fala'}
            </span>

            {/* Live Speech Cadence (WPM / PPM) Speed Rhythm Badge */}
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 border transition-all ${
                isSpeaking
                  ? cadenceQuality === 'fast'
                    ? 'bg-amber-950/90 border-amber-500 text-amber-300'
                    : cadenceQuality === 'slow'
                      ? 'bg-blue-950/90 border-blue-500 text-blue-300'
                      : 'bg-emerald-950/90 border-emerald-500 text-emerald-300'
                  : 'bg-gray-800/90 border-gray-700 text-gray-400'
              }`}
              title={`Ritmo da fala: ${liveCadenceWpm} PPM (${cadenceQuality === 'fast' ? 'Acelerado' : cadenceQuality === 'slow' ? 'Pausado' : 'Ritmo Ideal'}). A velocidade de rolagem acompanha seu ritmo automaticamente.`}
            >
              <Gauge size={10} className={isSpeaking ? (cadenceQuality === 'fast' ? 'text-amber-400 animate-pulse' : 'text-emerald-400') : 'text-gray-400'} />
              <span>{isSpeaking ? `${liveCadenceWpm} PPM` : '130 PPM'}</span>
              {isSpeaking && speedPercentDiff !== 0 && (
                <span className="text-[9px] opacity-80">
                  ({speedPercentDiff > 0 ? `+${speedPercentDiff}%` : `${speedPercentDiff}%`})
                </span>
              )}
            </span>

            {/* Camera Sync Badge */}
            {isCamRecordingInternal && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-red-950/80 border border-red-600/80 text-red-300 flex items-center gap-1 animate-pulse">
                <Video size={10} className="text-red-400" />
                <span>REC</span>
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
                  <span className="text-[10px] text-emerald-400 shrink-0 font-semibold flex items-center gap-0.5">
                    <Activity size={10} className="animate-pulse" />
                    <span>No ritmo</span>
                  </span>
                </>
              ) : isListening ? (
                <>
                  <PauseCircle size={11} className="text-amber-400 shrink-0" />
                  <span className="text-gray-400 truncate">Leia o roteiro: o texto rola no seu ritmo</span>
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
            O teleprompter reconhece o trecho exato da sua leitura e ajusta a velocidade ao seu ritmo natural.
          </span>
        </div>
      )}
    </div>
  );
}
