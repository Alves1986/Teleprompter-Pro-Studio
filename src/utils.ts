import { TextStats } from './types';

export interface ScriptWordToken {
  globalIndex: number;
  lineIndex: number;
  wordIndexInLine: number;
  rawWord: string;
  cleanWord: string;
  normalizedWord: string;
  isEmphasis?: boolean;
}

export interface ScriptLineToken {
  lineIndex: number;
  rawText: string;
  words: ScriptWordToken[];
  startGlobalIdx: number;
  endGlobalIdx: number;
  isMarkerOnly: boolean;
}

export interface TokenizedScript {
  allWords: ScriptWordToken[];
  lines: ScriptLineToken[];
}

export const stripMarkers = (text: string) => {
  return text
    .replace(/\[(?:ÊNFASE|ENFASE):\s*(.*?)\]/gi, '$1')
    .replace(/\[(PAUSA|CUE|NOTA|BLOCO|SEÇÃO|SECAO|SEGMENTO)(?::.*?)?\]/gi, '');
};

export const stripAllScriptMarkers = (text: string): string => {
  return text
    .replace(/\[(?:ÊNFASE|ENFASE):\s*(.*?)\]/gi, '$1')
    .replace(/\[(?:PAUSA|CUE|NOTA|BLOCO|SEÇÃO|SECAO|SEGMENTO)(?::.*?)?\]/gi, ' ')
    .replace(/^#+\s+/gm, '') // markdown headings
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1') // markdown bold/italic
    .replace(/_{1,3}([^_]+)_{1,3}/g, '$1');
};

export const tokenizeScript = (content: string): TokenizedScript => {
  if (!content) return { allWords: [], lines: [] };

  const rawLines = content.split('\n');
  const allWords: ScriptWordToken[] = [];
  const lines: ScriptLineToken[] = [];

  let globalWordCounter = 0;

  for (let lineIdx = 0; lineIdx < rawLines.length; lineIdx++) {
    const rawLine = rawLines[lineIdx];
    const trimmed = rawLine.trim();

    // Check if whole line is non-spoken cue/marker
    const isPureMarker = /^\[(?:PAUSA|CUE|NOTA|BLOCO|SEÇÃO|SECAO|SEGMENTO)(?::.*?)?\]$/i.test(trimmed);

    if (!trimmed || isPureMarker) {
      lines.push({
        lineIndex: lineIdx,
        rawText: rawLine,
        words: [],
        startGlobalIdx: globalWordCounter,
        endGlobalIdx: globalWordCounter,
        isMarkerOnly: isPureMarker
      });
      continue;
    }

    const lineWords: ScriptWordToken[] = [];
    const startIdxForLine = globalWordCounter;

    // Parse parts of the line to distinguish emphasis text from non-spoken cues and plain text
    const parts = rawLine.split(/(\[(?:PAUSA|ÊNFASE|ENFASE|CUE|NOTA|BLOCO|SEÇÃO|SECAO|SEGMENTO)(?::[^\]]+)?\])/gi);

    for (const part of parts) {
      if (!part) continue;
      const upper = part.toUpperCase();

      if (upper.startsWith('[ÊNFASE:') || upper.startsWith('[ENFASE:')) {
        const colonIdx = part.indexOf(':');
        const inner = part.slice(colonIdx + 1, -1).trim();
        const tokens = inner.split(/\s+/).filter(Boolean);
        for (const token of tokens) {
          const clean = token.replace(/^[^\w\u00C0-\u017F]+|[^\w\u00C0-\u017F]+$/g, '');
          const normalized = normalizeVoiceText(clean);
          const wordToken: ScriptWordToken = {
            globalIndex: globalWordCounter++,
            lineIndex: lineIdx,
            wordIndexInLine: lineWords.length,
            rawWord: token,
            cleanWord: clean,
            normalizedWord: normalized,
            isEmphasis: true
          };
          lineWords.push(wordToken);
          allWords.push(wordToken);
        }
      } else if (upper.startsWith('[') && upper.endsWith(']')) {
        // Other markers ([PAUSA], [CUE:...], [NOTA:...], [BLOCO:...]) are non-spoken
        continue;
      } else {
        // Plain text part
        const tokens = part.split(/\s+/).filter(Boolean);
        for (const token of tokens) {
          const clean = token.replace(/^[^\w\u00C0-\u017F]+|[^\w\u00C0-\u017F]+$/g, '');
          const normalized = normalizeVoiceText(clean);
          const wordToken: ScriptWordToken = {
            globalIndex: globalWordCounter++,
            lineIndex: lineIdx,
            wordIndexInLine: lineWords.length,
            rawWord: token,
            cleanWord: clean,
            normalizedWord: normalized,
            isEmphasis: false
          };
          lineWords.push(wordToken);
          allWords.push(wordToken);
        }
      }
    }

    lines.push({
      lineIndex: lineIdx,
      rawText: rawLine,
      words: lineWords,
      startGlobalIdx: startIdxForLine,
      endGlobalIdx: globalWordCounter,
      isMarkerOnly: false
    });
  }

  return { allWords, lines };
};

export const normalizeVoiceText = (text: string): string => {
  if (!text) return '';
  let normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics / accents
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')   // strip punctuation
    .replace(/\s+/g, ' ')
    .trim();

  // Normalize common spoken Portuguese contractions & numbers
  const replacements: [RegExp, string][] = [
    [/\bpra\b/g, 'para'],
    [/\bpro\b/g, 'para'],
    [/\bpras\b/g, 'para'],
    [/\bpros\b/g, 'para'],
    [/\bta\b/g, 'esta'],
    [/\bto\b/g, 'estou'],
    [/\btava\b/g, 'estava'],
    [/\btao\b/g, 'estao'],
    [/\bvc\b/g, 'voce'],
    [/\bne\b/g, ''],
    [/\b1\b/g, 'um'],
    [/\b2\b/g, 'dois'],
    [/\b3\b/g, 'tres'],
    [/\b4\b/g, 'quatro'],
    [/\b5\b/g, 'cinco'],
    [/\b6\b/g, 'seis'],
    [/\b7\b/g, 'sete'],
    [/\b8\b/g, 'oito'],
    [/\b9\b/g, 'nove'],
    [/\b10\b/g, 'dez']
  ];

  for (const [pattern, repl] of replacements) {
    normalized = normalized.replace(pattern, repl);
  }

  return normalized.replace(/\s+/g, ' ').trim();
};

// Portuguese lightweight stemmer for matching inflected words (plurals, verb tenses)
export const portugueseStem = (word: string): string => {
  if (word.length <= 3) return word;
  
  // Common Brazilian Portuguese verb and noun suffixes in descending order of length
  const suffixes = [
    'amentos', 'amento', 'amente', 'acoes', 'acao',
    'aremos', 'eremos', 'iremos', 'ariamos', 'eriamos', 'iriamos',
    'assem', 'essem', 'issem', 'assem', 'assemos', 'essemos', 'issemos',
    'ando', 'endo', 'indo',
    'aram', 'eram', 'iram', 'avam', 'arao', 'erao', 'irao',
    'arem', 'erem', 'irem',
    'amos', 'emos', 'imos', 'avas', 'avas',
    'ados', 'adas', 'idos', 'idas',
    'ado', 'ada', 'ido', 'ida',
    'oes', 'ais', 'eis', 'ois',
    'es', 'as', 'os', 's'
  ];

  for (const suffix of suffixes) {
    if (word.length - suffix.length >= 3 && word.endsWith(suffix)) {
      return word.slice(0, -suffix.length);
    }
  }
  return word;
};

// Levenshtein distance for fuzzy speech-to-text tolerance
export const levenshteinDistance = (a: string, b: string): number => {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

// Fuzzy match two Portuguese words (handles phonetics, tenses, accents, plurals)
export const fuzzyWordMatch = (spoken: string, target: string): { matches: boolean; score: number } => {
  if (spoken === target) return { matches: true, score: 1.5 };
  if (spoken.length < 3 || target.length < 3) return { matches: false, score: 0 };

  const stemSpoken = portugueseStem(spoken);
  const stemTarget = portugueseStem(target);

  if (stemSpoken === stemTarget && stemSpoken.length >= 3) {
    return { matches: true, score: 1.25 };
  }

  // Prefix match for longer words (e.g. teleprompter, inteligencia)
  if (spoken.length >= 5 && target.length >= 5) {
    if (spoken.slice(0, 4) === target.slice(0, 4)) {
      return { matches: true, score: 1.1 };
    }
    if (Math.abs(spoken.length - target.length) <= 2) {
      const dist = levenshteinDistance(spoken, target);
      if (dist <= 1) return { matches: true, score: 1.0 };
      if (spoken.length >= 7 && dist <= 2) return { matches: true, score: 0.85 };
    }
  }

  return { matches: false, score: 0 };
};

export const PORTUGUESE_STOP_WORDS = new Set([
  'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas',
  'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas',
  'por', 'para', 'pra', 'com', 'sem', 'sob', 'sobre',
  'e', 'ou', 'mas', 'que', 'se', 'ja', 'so', 'ta', 'ne',
  'ao', 'aos', 'me', 'te', 'lhe', 'lhes'
]);

export const calculateStats = (text: string): TextStats => {
  const cleanText = stripMarkers(text);
  const words = cleanText.trim().split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  const charCount = cleanText.length;
  const lines = cleanText.split('\n').filter(l => l.trim().length > 0);
  const lineCount = lines.length;
  const avgWordsPerLine = lineCount > 0 ? Math.round(wordCount / lineCount) : 0;
  
  const estimatedSegments = (text.match(/\[PAUSA\]/gi) || []).length + 1;
  const wpmRecommended = 130; // Suggested WPM for prompters
  
  const totalMinutes = wordCount / wpmRecommended;
  const readingTimeMinutes = Math.floor(totalMinutes);
  const readingTimeSeconds = Math.round((totalMinutes - readingTimeMinutes) * 60);

  return {
    wordCount,
    readingTimeMinutes,
    readingTimeSeconds,
    charCount,
    lineCount,
    avgWordsPerLine,
    estimatedSegments,
    wpmRecommended
  };
};

export const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

/**
 * Análise de texto e quebra automática para teleprompter:
 * - Divide o texto em linhas dinâmicas de fala (3 a 7 palavras)
 * - Insere intervalos naturais [PAUSA] respeitando o ritmo e respiração
 * - Envolve palavras-chave em [ÊNFASE: palavra]
 * - PRESERVA 100% DAS PALAVRAS ORIGINAIS, sem alterar o conteúdo
 */
export const splitScriptIntervalsLocally = (text: string): string => {
  if (!text || !text.trim()) return text;

  const rawLines = text.split('\n');
  const processedLines: string[] = [];
  let wordsSincePause = 0;
  let phrasesSincePause = 0;

  for (let l = 0; l < rawLines.length; l++) {
    const rawLine = rawLines[l].trim();
    if (!rawLine) {
      if (processedLines.length > 0 && processedLines[processedLines.length - 1] !== '') {
        processedLines.push('');
      }
      continue;
    }

    // Se a linha já é um marcador (ex: [PAUSA], [CUE:...], [BLOCO:...], etc.), mantém exatamente como está
    if (/^\[(?:PAUSA|CUE|NOTA|ÊNFASE|BLOCO|SEÇÃO|SEGMENTO)(?::.*?)?\]/i.test(rawLine)) {
      if (/^\[PAUSA\]/i.test(rawLine)) {
        wordsSincePause = 0;
        phrasesSincePause = 0;
      }
      processedLines.push(rawLine);
      continue;
    }

    // Divide parágrafos ou frases longas respeitando pontuação
    const sentences = rawLine.match(/[^.!?:]+[.!?:]*|.+/g) || [rawLine];

    for (const rawSentence of sentences) {
      const sentence = rawSentence.trim();
      if (!sentence) continue;

      const words = sentence.split(/\s+/).filter(Boolean);

      // Se a frase tem mais de 7 palavras, divide em quebras naturais de locução
      if (words.length > 7) {
        // Divide por vírgulas, ponto e vírgula, dois pontos ou travessões
        const subPhrases = sentence.split(/(?<=[,;—–:])\s+/);
        for (const sub of subPhrases) {
          const subWords = sub.trim().split(/\s+/).filter(Boolean);
          if (subWords.length > 7) {
            let chunk: string[] = [];
            for (let i = 0; i < subWords.length; i++) {
              chunk.push(subWords[i]);
              const nextWord = subWords[i + 1] || '';
              const isConnector = /^(e|mas|porque|pois|onde|quando|que|para|com|como|se|ou|porém|contudo)$/i.test(nextWord);
              if (chunk.length >= 4 && (isConnector || chunk.length >= 7)) {
                processedLines.push(chunk.join(' '));
                chunk = [];
              }
            }
            if (chunk.length > 0) {
              processedLines.push(chunk.join(' '));
            }
          } else if (sub.trim()) {
            processedLines.push(sub.trim());
          }
        }
      } else {
        processedLines.push(sentence);
      }

      phrasesSincePause++;
      wordsSincePause += words.length;

      // Detecta pontos ideais de respiração e pausa
      const endsWithQuestion = /[?]$/.test(sentence);
      const endsWithExclamation = /[!]$/.test(sentence);
      const endsWithPeriod = /[.:]$/.test(sentence);

      if (
        (endsWithQuestion && wordsSincePause >= 8) ||
        (endsWithExclamation && wordsSincePause >= 14) ||
        (endsWithPeriod && (phrasesSincePause >= 3 || wordsSincePause >= 22))
      ) {
        processedLines.push('');
        processedLines.push('[PAUSA]');
        processedLines.push('');
        phrasesSincePause = 0;
        wordsSincePause = 0;
      }
    }
  }

  // Limpeza de pausas repetidas ou duplicadas
  const cleaned: string[] = [];
  for (let i = 0; i < processedLines.length; i++) {
    const line = processedLines[i];
    if (line === '[PAUSA]') {
      if (cleaned.length === 0 || cleaned[cleaned.length - 1] === '[PAUSA]') {
        continue;
      }
      while (cleaned.length > 0 && cleaned[cleaned.length - 1] === '') {
        cleaned.pop();
      }
      cleaned.push('');
      cleaned.push('[PAUSA]');
      cleaned.push('');
    } else {
      cleaned.push(line);
    }
  }

  // Remove pausas soltas no início ou no fim
  while (cleaned.length > 0 && (cleaned[cleaned.length - 1] === '' || cleaned[cleaned.length - 1] === '[PAUSA]')) {
    cleaned.pop();
  }
  while (cleaned.length > 0 && (cleaned[0] === '' || cleaned[0] === '[PAUSA]')) {
    cleaned.shift();
  }

  return cleaned.join('\n');
};

export const parseScriptBlocks = (text: string) => {
  const lines = text.split('\n');
  const blocks: {
    id: string;
    title: string;
    content: string;
    lineIndex: number;
    wordCount: number;
    estimatedSeconds: number;
  }[] = [];

  let currentBlockTitle = 'Abertura';
  let currentBlockLines: string[] = [];
  let currentLineIndex = 0;
  let blockIndex = 1;

  const pushCurrentBlock = () => {
    if (currentBlockLines.length > 0) {
      const content = currentBlockLines.join('\n');
      const clean = stripMarkers(content);
      const words = clean.trim().split(/\s+/).filter(w => w.length > 0).length;
      blocks.push({
        id: `block-${blockIndex}`,
        title: currentBlockTitle,
        content,
        lineIndex: currentLineIndex,
        wordCount: words,
        estimatedSeconds: Math.round((words / 130) * 60)
      });
      blockIndex++;
      currentBlockLines = [];
    }
  };

  lines.forEach((line, idx) => {
    const blockMatch = line.match(/^\[(?:BLOCO|SEÇÃO|SEGMENTO):\s*(.*?)\]/i) || line.match(/^#+\s*(.*)/);
    if (blockMatch) {
      pushCurrentBlock();
      currentBlockTitle = blockMatch[1].trim() || `Bloco ${blockIndex}`;
      currentLineIndex = idx;
    } else {
      currentBlockLines.push(line);
    }
  });

  pushCurrentBlock();

  // If no explicit markers found and script is long, divide into 3-4 natural blocks
  if (blocks.length <= 1 && lines.length > 15) {
    const splitCount = Math.min(4, Math.ceil(lines.length / 10));
    const chunkSize = Math.ceil(lines.length / splitCount);
    const generatedBlocks = [];
    for (let i = 0; i < lines.length; i += chunkSize) {
      const chunkLines = lines.slice(i, i + chunkSize);
      const content = chunkLines.join('\n');
      const words = stripMarkers(content).trim().split(/\s+/).filter(w => w.length > 0).length;
      const partNum = Math.floor(i / chunkSize) + 1;
      generatedBlocks.push({
        id: `gen-part-${partNum}`,
        title: partNum === 1 ? 'Parte 1 - Início' : partNum === splitCount ? 'Parte Final - Conclusão' : `Parte ${partNum}`,
        content,
        lineIndex: i,
        wordCount: words,
        estimatedSeconds: Math.round((words / 130) * 60)
      });
    }
    return generatedBlocks;
  }

  return blocks;
};

// Web Audio API Beep sem dependência de arquivos externos
let audioCtx: AudioContext | null = null;
export const playAudioBeep = (freq = 880, durationMs = 120, type: OscillatorType = 'sine') => {
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    if (audioCtx) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + durationMs / 1000);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + durationMs / 1000);
    }
  } catch (e) {
    console.warn('AudioContext not available or blocked:', e);
  }
};
