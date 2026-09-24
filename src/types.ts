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
  rotation?: number;
  autoOrientation?: boolean; // Reconhecimento automático ao girar/mover a tela (padrão: true)
  orientationMode?: 'auto' | 'portrait' | 'landscape';
  // Novos recursos avançados de estúdio
  countdownDuration: number; // 0, 3, 5, 10 segundos
  cameraEnabled: boolean;
  cameraOpacity: number; // 10 a 100%
  voiceFollowEnabled: boolean;
  targetMinutes: number; // meta de tempo em minutos (0 = livre)
  pedalShortcutsEnabled: boolean;
  // Mapeamento de teclas e comandos de pedal
  customKeyBindings?: CustomKeyBindings;
}

export interface CustomKeyBindings {
  playPause: string[];      // ex: ['Space', 'KeyK', 'Numpad0']
  speedUp: string[];        // ex: ['ArrowUp', 'PageUp']
  speedDown: string[];      // ex: ['ArrowDown', 'PageDown']
  fontSizeUp?: string[];    // ex: ['BracketRight']
  fontSizeDown?: string[];  // ex: ['BracketLeft']
  rewind?: string[];        // ex: ['ArrowLeft']
  fastForward?: string[];   // ex: ['ArrowRight']
  restart?: string[];       // ex: ['KeyR']
  pedalPlayButton?: number; // índice do botão Gamepad (padrão: 0)
  pedalSpeedUpButton?: number; // índice do botão Gamepad (padrão: 12)
  pedalSpeedDownButton?: number; // índice do botão Gamepad (padrão: 13)
}

export interface ScriptBlock {
  id: string;
  title: string;
  content: string;
  lineIndex: number;
  wordCount: number;
  estimatedSeconds: number;
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

export interface ConnectedMobileDevice {
  id: string;
  name: string;
  deviceType: 'mobile' | 'tablet' | 'desktop';
  os: string;
  browser?: string;
  connectedAt: number;
  lastSeen: number;
  bluetoothConnected: boolean;
  bluetoothDevices: string[];
  batteryLevel?: number;
  lastSignal?: {
    type: string;
    button: string | number;
    action?: string;
    timestamp: number;
    source: 'gamepad' | 'keyboard' | 'bluetooth' | 'touch';
  };
}
