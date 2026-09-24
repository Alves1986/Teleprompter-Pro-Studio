/**
 * Utility for detecting client device, OS, and Bluetooth / Gamepad accessories.
 */

export interface DeviceProfile {
  id: string;
  name: string;
  deviceType: 'mobile' | 'tablet' | 'desktop';
  os: 'iOS' | 'Android' | 'macOS' | 'Windows' | 'Linux' | 'Desconhecido';
  browser: string;
  isMobileDevice: boolean;
  supportsBluetooth: boolean;
  supportsGamepad: boolean;
}

export function detectCurrentDevice(): DeviceProfile {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      id: 'server',
      name: 'Servidor',
      deviceType: 'desktop',
      os: 'Desconhecido',
      browser: 'Unknown',
      isMobileDevice: false,
      supportsBluetooth: false,
      supportsGamepad: false
    };
  }

  const ua = navigator.userAgent || '';
  let os: DeviceProfile['os'] = 'Desconhecido';
  let deviceType: DeviceProfile['deviceType'] = 'desktop';
  let name = 'Dispositivo';

  // Detect OS
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    os = 'iOS';
    deviceType = /iPad/.test(ua) || navigator.maxTouchPoints > 1 ? 'tablet' : 'mobile';
    name = deviceType === 'tablet' ? 'Apple iPad' : 'Apple iPhone';
  } else if (/Android/i.test(ua)) {
    os = 'Android';
    deviceType = /Tablet|Nexus 7|Nexus 10/i.test(ua) ? 'tablet' : 'mobile';
    // Try to extract Android model
    const androidMatch = ua.match(/;\s*([^;]+)\s+Build\//);
    if (androidMatch && androidMatch[1]) {
      name = androidMatch[1].trim();
    } else {
      name = deviceType === 'tablet' ? 'Tablet Android' : 'Smartphone Android';
    }
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    os = 'macOS';
    deviceType = 'desktop';
    name = 'Mac';
  } else if (/Windows/i.test(ua)) {
    os = 'Windows';
    deviceType = 'desktop';
    name = 'PC Windows';
  } else if (/Linux/i.test(ua)) {
    os = 'Linux';
    deviceType = 'desktop';
    name = 'Computador Linux';
  }

  // Detect Browser
  let browser = 'Navegador';
  if (/Chrome/i.test(ua) && !/Edge|Edg|OPR/i.test(ua)) {
    browser = 'Chrome';
  } else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) {
    browser = 'Safari';
  } else if (/Edg/i.test(ua)) {
    browser = 'Edge';
  } else if (/Firefox/i.test(ua)) {
    browser = 'Firefox';
  } else if (/SamsungBrowser/i.test(ua)) {
    browser = 'Samsung Internet';
  }

  // Generate or retrieve persistent local device ID
  let deviceId = '';
  try {
    deviceId = localStorage.getItem('tp_local_device_id') || '';
    if (!deviceId) {
      deviceId = `dev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
      localStorage.setItem('tp_local_device_id', deviceId);
    }
  } catch {
    deviceId = `dev_${Date.now().toString(36)}`;
  }

  const supportsBluetooth = typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  const supportsGamepad = typeof navigator !== 'undefined' && 'getGamepads' in navigator;

  return {
    id: deviceId,
    name: `${name} (${browser})`,
    deviceType,
    os,
    browser,
    isMobileDevice: deviceType === 'mobile' || deviceType === 'tablet',
    supportsBluetooth,
    supportsGamepad
  };
}
