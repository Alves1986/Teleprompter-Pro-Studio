import { TextStats } from './types';

export const stripMarkers = (text: string) => {
  return text.replace(/\[(PAUSA|CUE|NOTA|ÊNFASE)(?::.*?)?\]/gi, '');
};

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
