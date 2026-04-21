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
