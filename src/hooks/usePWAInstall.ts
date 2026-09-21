import { useState, useEffect } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface PWAInstallState {
  isInstallable: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isTablet: boolean;
  isMobile: boolean;
  isTouch: boolean;
  platformName: string;
  install: () => Promise<boolean>;
}

export function usePWAInstall(): PWAInstallState {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isIOS, setIsIOS] = useState<boolean>(false);
  const [isAndroid, setIsAndroid] = useState<boolean>(false);
  const [isTablet, setIsTablet] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [isTouch, setIsTouch] = useState<boolean>(false);
  const [platformName, setPlatformName] = useState<string>('Dispositivo');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Detect standalone mode (already installed as PWA)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
      document.referrer.includes('android-app://');

    setIsInstalled(isStandalone);

    // Detect user agent & device properties
    const ua = window.navigator.userAgent.toLowerCase();
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    setIsTouch(hasTouch);

    // iOS Detection (iPhone, iPad, iPod, or iPadOS on Safari pretending to be Mac)
    const isAppleDevice = /iphone|ipod/.test(ua);
    const isIPad = /ipad/.test(ua) || (hasTouch && /macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const ios = isAppleDevice || isIPad;
    setIsIOS(ios);

    // Android Detection
    const android = /android/.test(ua);
    setIsAndroid(android);

    // Tablet Detection: iPad OR Android without 'mobile' OR touch device with wide screen
    const screenWidth = Math.min(window.innerWidth, window.innerHeight);
    const isAndroidTablet = android && !/mobile/.test(ua);
    const tablet = isIPad || isAndroidTablet || (hasTouch && screenWidth >= 600);
    setIsTablet(tablet);

    // Mobile Phone Detection
    const mobile = (isAppleDevice || (android && /mobile/.test(ua)) || (hasTouch && screenWidth < 600)) && !tablet;
    setIsMobile(mobile);

    // Friendly platform label
    if (isIPad) {
      setPlatformName('iPad');
    } else if (tablet && android) {
      setPlatformName('Tablet Android');
    } else if (tablet) {
      setPlatformName('Tablet');
    } else if (isAppleDevice) {
      setPlatformName('iPhone');
    } else if (mobile && android) {
      setPlatformName('Celular Android');
    } else if (mobile) {
      setPlatformName('Celular');
    } else {
      setPlatformName('Computador');
    }

    // Capture Chrome/Android install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async (): Promise<boolean> => {
    if (!deferredPrompt) return false;

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
        return true;
      }
    } catch (err) {
      console.warn('Install prompt error:', err);
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    isAndroid,
    isTablet,
    isMobile,
    isTouch,
    platformName,
    install
  };
}
