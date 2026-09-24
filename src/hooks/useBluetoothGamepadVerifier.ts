import { useState, useEffect, useRef, useCallback } from 'react';
import { detectCurrentDevice, DeviceProfile } from '../services/deviceDetection';

export interface BluetoothSignalEvent {
  id: string;
  source: 'gamepad' | 'keyboard' | 'bluetooth_native' | 'remote_mobile';
  deviceId: string;
  deviceName: string;
  buttonIndex?: number;
  keyLabel?: string;
  action?: string;
  timestamp: number;
}

export interface BluetoothDeviceInfo {
  id: string;
  name: string;
  type: 'pedal' | 'gamepad' | 'presenter' | 'ble';
  connected: boolean;
  buttonCount?: number;
  axesCount?: number;
  vendorId?: string;
  isNativeBle?: boolean;
}

export function useBluetoothGamepadVerifier(enabled = true) {
  const [currentProfile] = useState<DeviceProfile>(() => detectCurrentDevice());
  const [connectedDevices, setConnectedDevices] = useState<BluetoothDeviceInfo[]>([]);
  const [lastSignal, setLastSignal] = useState<BluetoothSignalEvent | null>(null);
  const [signalCount, setSignalCount] = useState(0);
  const [signalHistory, setSignalHistory] = useState<BluetoothSignalEvent[]>([]);
  const [isScanningBle, setIsScanningBle] = useState(false);
  const [bleError, setBleError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const prevButtonsRef = useRef<Map<string, boolean[]>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);

  // Play subtle feedback beep on signal
  const playBeep = useCallback((freq = 680, duration = 0.08) => {
    if (!soundEnabled) return;
    try {
      if (!audioContextRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          audioContextRef.current = new AudioCtx();
        }
      }
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
      if (audioContextRef.current) {
        const ctx = audioContextRef.current;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration);
      }
    } catch {
      // Audio autoplay policy ignored
    }
  }, [soundEnabled]);

  const registerSignal = useCallback((signal: Omit<BluetoothSignalEvent, 'id' | 'timestamp'>) => {
    const fullSignal: BluetoothSignalEvent = {
      ...signal,
      id: `sig_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now()
    };
    setLastSignal(fullSignal);
    setSignalCount(prev => prev + 1);
    setSignalHistory(prev => [fullSignal, ...prev.slice(0, 7)]);
    playBeep(fullSignal.source === 'remote_mobile' ? 820 : 640);
  }, [playBeep]);

  // Gamepad poll loop for Bluetooth Pedals & Gamepads
  useEffect(() => {
    if (!enabled) return;

    let animFrame: number | null = null;
    let scanInterval: NodeJS.Timeout | null = null;

    const checkGamepads = () => {
      if (typeof navigator === 'undefined' || !navigator.getGamepads) return;

      const rawGamepads = navigator.getGamepads();
      const detected: BluetoothDeviceInfo[] = [];

      for (let i = 0; i < rawGamepads.length; i++) {
        const gp = rawGamepads[i];
        if (gp && gp.connected) {
          const deviceId = gp.id || `gamepad_${i}`;
          const isPedal = /pedal|pageflip|airturn|donner|lekato|footswitch|foot/i.test(gp.id);
          const isPresenter = /remote|presenter|clicker|shutter/i.test(gp.id);

          detected.push({
            id: deviceId,
            name: gp.id || `Dispositivo de Entrada ${i + 1}`,
            type: isPedal ? 'pedal' : isPresenter ? 'presenter' : 'gamepad',
            connected: true,
            buttonCount: gp.buttons.length,
            axesCount: gp.axes.length
          });

          // Check button transitions
          let prevStates = prevButtonsRef.current.get(deviceId);
          if (!prevStates || prevStates.length !== gp.buttons.length) {
            prevStates = new Array(gp.buttons.length).fill(false);
            prevButtonsRef.current.set(deviceId, prevStates);
          }

          for (let b = 0; b < gp.buttons.length; b++) {
            const isPressed = gp.buttons[b]?.pressed;
            if (isPressed && !prevStates[b]) {
              // Rising edge detected
              registerSignal({
                source: 'gamepad',
                deviceId,
                deviceName: gp.id || 'Pedal / Gamepad',
                buttonIndex: b,
                action: b === 0 ? 'Play / Pause (Padrão)' : b === 12 ? 'Acelerar (+)' : b === 13 ? 'Desacelerar (-)' : `Botão ${b}`
              });
            }
            prevStates[b] = isPressed;
          }
        }
      }

      setConnectedDevices(prev => {
        // Keep any native BLE devices that were manually connected
        const nativeBle = prev.filter(d => d.isNativeBle);
        return [...detected, ...nativeBle];
      });
    };

    scanInterval = setInterval(checkGamepads, 80);

    return () => {
      if (scanInterval) clearInterval(scanInterval);
      if (animFrame) cancelAnimationFrame(animFrame);
    };
  }, [enabled, registerSignal]);

  // Keyboard Bluetooth Pedal listener (AirTurn, PageFlip in keyboard mode)
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Pedals often send Space, PageDown, PageUp, ArrowUp, ArrowDown, Enter
      const pedalKeys = ['Space', 'PageDown', 'PageUp', 'ArrowUp', 'ArrowDown', 'BracketLeft', 'BracketRight'];
      if (pedalKeys.includes(e.code)) {
        registerSignal({
          source: 'keyboard',
          deviceId: 'keyboard_pedal',
          deviceName: 'Pedal Bluetooth (Modo Teclado HID)',
          keyLabel: e.code,
          action: e.code === 'Space' || e.code === 'PageDown' ? 'Play / Pause' : e.code === 'ArrowUp' || e.code === 'PageUp' ? 'Acelerar' : 'Comando'
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, registerSignal]);

  // Native Web Bluetooth scanner trigger
  const scanWebBluetooth = async () => {
    if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) {
      setBleError('Seu navegador não possui a Web Bluetooth API ativada (comum em iPhones e Firefox). Use o pareamento direto pelo Bluetooth do seu aparelho.');
      return;
    }

    setIsScanningBle(true);
    setBleError(null);

    try {
      const navBle = (navigator as any).bluetooth;
      const device = await navBle.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['battery_service', 'device_information']
      });

      if (device) {
        const newDevice: BluetoothDeviceInfo = {
          id: device.id || `ble_${Date.now()}`,
          name: device.name || 'Dispositivo Bluetooth BLE',
          type: /pedal|foot/i.test(device.name || '') ? 'pedal' : 'ble',
          connected: true,
          isNativeBle: true
        };

        setConnectedDevices(prev => {
          const filtered = prev.filter(d => d.id !== newDevice.id);
          return [newDevice, ...filtered];
        });

        registerSignal({
          source: 'bluetooth_native',
          deviceId: newDevice.id,
          deviceName: newDevice.name,
          action: 'Dispositivo Conectado com Sucesso'
        });
      }
    } catch (err: any) {
      if (err.name !== 'NotFoundError') {
        setBleError(err.message || 'Erro ao conectar via Web Bluetooth.');
      }
    } finally {
      setIsScanningBle(false);
    }
  };

  return {
    currentProfile,
    connectedDevices,
    lastSignal,
    signalCount,
    signalHistory,
    isScanningBle,
    bleError,
    soundEnabled,
    setSoundEnabled,
    scanWebBluetooth,
    registerSignal
  };
}
