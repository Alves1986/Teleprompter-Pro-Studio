import { useState, useEffect } from 'react';

export type OrientationMode = 'portrait' | 'landscape';

export interface OrientationInfo {
  orientation: OrientationMode;
  isLandscape: boolean;
  isPortrait: boolean;
  angle: number;
  width: number;
  height: number;
  aspectRatio: number;
}

export function useOrientation(): OrientationInfo {
  const getOrientationState = (): OrientationInfo => {
    if (typeof window === 'undefined') {
      return {
        orientation: 'landscape',
        isLandscape: true,
        isPortrait: false,
        angle: 0,
        width: 1920,
        height: 1080,
        aspectRatio: 16 / 9
      };
    }

    const width = window.innerWidth || document.documentElement.clientWidth || 1024;
    const height = window.innerHeight || document.documentElement.clientHeight || 768;
    const isLandscape = width >= height;
    const orientation: OrientationMode = isLandscape ? 'landscape' : 'portrait';
    const angle = (typeof screen !== 'undefined' && screen.orientation?.angle) || 0;

    return {
      orientation,
      isLandscape,
      isPortrait: !isLandscape,
      angle,
      width,
      height,
      aspectRatio: height > 0 ? width / height : 1
    };
  };

  const [state, setState] = useState<OrientationInfo>(getOrientationState);

  useEffect(() => {
    const handleUpdate = () => {
      setState(getOrientationState());
    };

    // 1. Resize listener (triggers on window resize, devtools toggle, iframe scale)
    window.addEventListener('resize', handleUpdate, { passive: true });

    // 2. Window orientationchange (mobile devices tilt)
    window.addEventListener('orientationchange', handleUpdate, { passive: true });

    // 3. Screen orientation change API (modern standard)
    if (typeof screen !== 'undefined' && screen.orientation) {
      screen.orientation.addEventListener('change', handleUpdate);
    }

    // 4. MatchMedia orientation listeners (backup across iOS Safari and WebKit)
    let mqlLandscape: MediaQueryList | null = null;
    let mqlPortrait: MediaQueryList | null = null;

    if (typeof window.matchMedia === 'function') {
      try {
        mqlLandscape = window.matchMedia('(orientation: landscape)');
        mqlPortrait = window.matchMedia('(orientation: portrait)');

        if (mqlLandscape.addEventListener) {
          mqlLandscape.addEventListener('change', handleUpdate);
          mqlPortrait.addEventListener('change', handleUpdate);
        } else if ((mqlLandscape as any).addListener) {
          (mqlLandscape as any).addListener(handleUpdate);
          (mqlPortrait as any).addListener(handleUpdate);
        }
      } catch {
        // Ignored
      }
    }

    // Initial check
    handleUpdate();

    return () => {
      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('orientationchange', handleUpdate);
      if (typeof screen !== 'undefined' && screen.orientation) {
        screen.orientation.removeEventListener('change', handleUpdate);
      }
      if (mqlLandscape) {
        if (mqlLandscape.removeEventListener) {
          mqlLandscape.removeEventListener('change', handleUpdate);
          mqlPortrait?.removeEventListener('change', handleUpdate);
        } else if ((mqlLandscape as any).removeListener) {
          (mqlLandscape as any).removeListener(handleUpdate);
          (mqlPortrait as any).removeListener(handleUpdate);
        }
      }
    };
  }, []);

  return state;
}
