export enum AppTheme {
  DARK = 'dark',
  LIGHT = 'light',
  CONTRAST = 'contrast',
  STUDIO = 'studio'
}

export interface PrompterConfig {
  speed: number;
  fontSize: number;
  mirrorX: boolean;
  mirrorY: boolean;
  width: number;
  theme: AppTheme;
  columnMode: 'single' | 'double';
  voiceControl: boolean;
  lineHeight: number;
  letterSpacing: number;
  highlightCurrentLine: boolean;
  showProgressBar: boolean;
  showTimeRemaining: boolean;
}

export interface TextStats {
  wordCount: number;
  readingTimeMinutes: number;
  readingTimeSeconds: number;
  charCount: number;
  lineCount: number;
  avgWordsPerLine: number;
  estimatedSegments: number;
  wpmRecommended: number;
}

export interface SavedScript {
  id: string;
  title: string;
  content: string;
  lastModified: number;
  tags?: string[];
  color?: string;
  duration?: number;
  lastSynced?: number; // NOVO: para controle de sincronismo com Supabase
}

export interface Bookmark {
  id: string;
  scrollPosition: number;
  label?: string;
  createdAt: number;
}
