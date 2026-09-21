import { useState, useEffect } from 'react';
import { playAudioBeep } from '../utils';

interface Props {
  durationSeconds: number;
  onComplete: () => void;
  onCancel: () => void;
}

export default function CountdownOverlay({
  durationSeconds,
  onComplete,
  onCancel
}: Props) {
  const [timeLeft, setTimeLeft] = useState(durationSeconds);
  const [isAction, setIsAction] = useState(false);

  useEffect(() => {
    setTimeLeft(durationSeconds);
    setIsAction(false);

    // Initial beep
    playAudioBeep(700, 100);

    let current = durationSeconds;
    const interval = setInterval(() => {
      current--;
      if (current > 0) {
        setTimeLeft(current);
        playAudioBeep(700, 100);
      } else if (current === 0) {
        setIsAction(true);
        playAudioBeep(1200, 250);
        setTimeout(() => {
          clearInterval(interval);
          onComplete();
        }, 600);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [durationSeconds]);

  return (
    <div 
      onClick={onComplete}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md cursor-pointer select-none"
    >
      <div className="relative flex items-center justify-center">
        {/* Pulsing ring */}
        <div className="absolute w-52 h-52 sm:w-64 sm:h-64 rounded-full border-4 border-amber-500/40 animate-ping" />
        
        {/* Countdown display */}
        <div className="w-48 h-48 sm:w-56 sm:h-56 rounded-full bg-gradient-to-br from-gray-900 to-black border-4 border-amber-500 flex flex-col items-center justify-center shadow-2xl">
          {isAction ? (
            <span className="text-3xl sm:text-4xl font-extrabold text-emerald-400 tracking-wider animate-bounce">
              AÇÃO!
            </span>
          ) : (
            <span className="text-7xl sm:text-8xl font-black font-mono text-amber-400">
              {timeLeft}
            </span>
          )}
        </div>
      </div>

      <p className="mt-8 text-sm text-gray-400 font-medium">
        Prepare-se para falar • Toque para pular
      </p>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onCancel();
        }}
        className="mt-4 px-4 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-xs font-semibold transition-colors"
      >
        Cancelar
      </button>
    </div>
  );
}
