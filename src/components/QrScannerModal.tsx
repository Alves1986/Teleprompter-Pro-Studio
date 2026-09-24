import { useState, useEffect, useRef } from 'react';
import jsQR from 'jsqr';
import { X, Camera, RefreshCw, Zap, ZapOff, Upload, AlertCircle, CheckCircle } from 'lucide-react';
import { extractRoomCode } from '../services/remoteService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (scannedCode: string) => void;
}

export default function QrScannerModal({ isOpen, onClose, onScanSuccess }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [detectedCode, setDetectedCode] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(true);

  const scanAnimFrameRef = useRef<number | null>(null);
  const lastScanTimeRef = useRef<number>(0);

  // Play synthetic feedback beep on success
  const playSuccessBeep = () => {
    try {
      if (typeof window === 'undefined') return;
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {}
  };

  const triggerVibration = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([40, 30, 60]);
      } catch {}
    }
  };

  // Enumerate cameras
  useEffect(() => {
    if (!isOpen) return;

    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices()
        .then(devices => {
          const videoDevs = devices.filter(d => d.kind === 'videoinput');
          setCameras(videoDevs);
          if (videoDevs.length > 0 && !selectedCameraId) {
            // Prefer back/environment camera
            const backCam = videoDevs.find(d => 
              d.label.toLowerCase().includes('back') || 
              d.label.toLowerCase().includes('trás') || 
              d.label.toLowerCase().includes('environment')
            );
            setSelectedCameraId(backCam ? backCam.deviceId : videoDevs[0].deviceId);
          }
        })
        .catch(err => console.warn('Erro listando câmeras:', err));
    }
  }, [isOpen]);

  // Start Camera Stream
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    setCameraError(null);
    setDetectedCode(null);
    setIsScanning(true);

    let active = true;

    async function initCamera() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Câmera não suportada neste navegador.');
        }

        const constraints: MediaStreamConstraints = {
          audio: false,
          video: selectedCameraId
            ? { deviceId: { exact: selectedCameraId } }
            : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
        };

        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!active) {
          mediaStream.getTracks().forEach(t => t.stop());
          return;
        }

        setStream(mediaStream);

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.setAttribute('playsinline', 'true');
          await videoRef.current.play();
        }

        // Check torch support
        const track = mediaStream.getVideoTracks()[0];
        if (track && typeof track.getCapabilities === 'function') {
          const capabilities = track.getCapabilities() as any;
          if (capabilities.torch) {
            setTorchAvailable(true);
          }
        }
      } catch (err: any) {
        console.error('Camera access error:', err);
        let message = 'Não foi possível acessar a câmera do dispositivo.';
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          message = 'Permissão de câmera negada. Conceda permissão no navegador ou envie uma foto do QR Code.';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          message = 'Nenhuma câmera encontrada neste dispositivo.';
        }
        setCameraError(message);
      }
    }

    initCamera();

    return () => {
      active = false;
      stopCamera();
    };
  }, [isOpen, selectedCameraId]);

  const stopCamera = () => {
    if (scanAnimFrameRef.current) {
      cancelAnimationFrame(scanAnimFrameRef.current);
      scanAnimFrameRef.current = null;
    }
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      setStream(null);
    }
  };

  const toggleTorch = async () => {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;

    try {
      const nextState = !torchOn;
      await (track as any).applyConstraints({
        advanced: [{ torch: nextState }]
      });
      setTorchOn(nextState);
    } catch (e) {
      console.warn('Erro ao alternar lanterna:', e);
    }
  };

  const handleSwitchCamera = () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex(c => c.deviceId === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    setSelectedCameraId(cameras[nextIndex].deviceId);
  };

  // Continuous QR scan frame processing
  useEffect(() => {
    if (!isOpen || !stream || !isScanning) return;

    let isRunning = true;

    const processFrame = () => {
      if (!isRunning) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        const now = Date.now();
        // Throttle scans to every 80ms for optimal performance
        if (now - lastScanTimeRef.current >= 80) {
          lastScanTimeRef.current = now;

          const width = video.videoWidth;
          const height = video.videoHeight;

          if (width > 0 && height > 0) {
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(video, 0, 0, width, height);
              const imageData = ctx.getImageData(0, 0, width, height);

              const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'attemptBoth'
              });

              if (code && code.data && code.data.trim()) {
                const cleanCode = extractRoomCode(code.data);
                if (cleanCode) {
                  onFoundCode(cleanCode);
                  return;
                }
              }
            }
          }
        }
      }

      scanAnimFrameRef.current = requestAnimationFrame(processFrame);
    };

    scanAnimFrameRef.current = requestAnimationFrame(processFrame);

    return () => {
      isRunning = false;
      if (scanAnimFrameRef.current) {
        cancelAnimationFrame(scanAnimFrameRef.current);
      }
    };
  }, [isOpen, stream, isScanning]);

  const onFoundCode = (roomCode: string) => {
    setIsScanning(false);
    setDetectedCode(roomCode);
    playSuccessBeep();
    triggerVibration();

    // Small delay so user sees visual confirmation
    setTimeout(() => {
      stopCamera();
      onScanSuccess(roomCode);
      onClose();
    }, 600);
  };

  // Handle image upload scanning (useful when camera is in use or user has a screenshot)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(img, 0, 0, img.width, img.height);
          const imageData = ctx.getImageData(0, 0, img.width, img.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'attemptBoth'
          });
          if (code && code.data) {
            const cleanCode = extractRoomCode(code.data);
            if (cleanCode) {
              onFoundCode(cleanCode);
              return;
            }
          }
          setCameraError('Nenhum QR Code de sala foi identificado nesta imagem.');
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/90 backdrop-blur-md animate-in fade-in">
      <div className="bg-[#0E0F17] border border-gray-800 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl relative text-white flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800/80 bg-[#141522]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400">
              <Camera size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-100">Escanear QR Code</h3>
              <p className="text-[11px] text-gray-400">Aponte para o QR Code de outro dispositivo</p>
            </div>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
            title="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Camera Viewfinder Area */}
        <div className="relative bg-black h-72 sm:h-80 flex items-center justify-center overflow-hidden">
          {detectedCode ? (
            <div className="absolute inset-0 bg-emerald-950/90 flex flex-col items-center justify-center gap-3 z-30 animate-in zoom-in-95">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-emerald-400">
                <CheckCircle size={36} />
              </div>
              <div className="text-center">
                <p className="text-xs uppercase tracking-wider text-emerald-400 font-bold">QR Code Identificado!</p>
                <p className="text-2xl font-mono font-black text-white mt-1">{detectedCode}</p>
                <p className="text-xs text-emerald-300/80 mt-1">Conectando imediatamente...</p>
              </div>
            </div>
          ) : null}

          {cameraError ? (
            <div className="p-6 text-center max-w-xs flex flex-col items-center gap-3 z-20">
              <div className="p-3 bg-red-950/50 border border-red-500/30 rounded-full text-red-400">
                <AlertCircle size={28} />
              </div>
              <p className="text-xs text-gray-300 leading-relaxed">{cameraError}</p>
              <div className="flex flex-col gap-2 w-full mt-2">
                <button
                  onClick={() => {
                    setCameraError(null);
                    setSelectedCameraId(selectedCameraId);
                  }}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-xs font-semibold rounded-lg transition"
                >
                  Tentar Câmera Novamente
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition"
                >
                  <Upload size={14} /> Selecionar Foto do QR Code
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Active Video Stream */}
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                muted
                playsInline
                autoPlay
              />

              {/* Scanning Target Overlay */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="relative w-52 h-52 sm:w-60 sm:h-60 border-2 border-amber-500/50 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] flex items-center justify-center">
                  {/* Corner Accent Brackets */}
                  <span className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-amber-400 rounded-tl-lg" />
                  <span className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-amber-400 rounded-tr-lg" />
                  <span className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-amber-400 rounded-bl-lg" />
                  <span className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-amber-400 rounded-br-lg" />

                  {/* Laser Scanning Line */}
                  <div className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent shadow-[0_0_8px_#f59e0b] animate-scan" />
                </div>
              </div>

              {/* Top Controls Overlay on Camera: Switch Camera & Flashlight */}
              <div className="absolute top-3 inset-x-3 flex items-center justify-between pointer-events-auto z-10">
                {cameras.length > 1 ? (
                  <button
                    onClick={handleSwitchCamera}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur border border-white/20 text-xs text-gray-200 hover:text-white transition active:scale-95"
                    title="Alternar Câmera"
                  >
                    <RefreshCw size={13} />
                    <span>Trocar Câmera</span>
                  </button>
                ) : <div />}

                {torchAvailable && (
                  <button
                    onClick={toggleTorch}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur border text-xs transition active:scale-95 ${
                      torchOn
                        ? 'bg-amber-500 text-black border-amber-400 font-bold'
                        : 'bg-black/60 border-white/20 text-gray-200'
                    }`}
                    title="Ligar/Desligar Lanterna"
                  >
                    {torchOn ? <ZapOff size={13} /> : <Zap size={13} />}
                    <span>{torchOn ? 'Lanterna On' : 'Lanterna'}</span>
                  </button>
                )}
              </div>

              <div className="absolute bottom-3 inset-x-3 flex justify-center pointer-events-none z-10">
                <span className="bg-black/70 backdrop-blur px-3 py-1 rounded-full text-[11px] text-gray-300 border border-white/10 font-medium">
                  Posicione o QR Code dentro do quadrado
                </span>
              </div>
            </>
          )}
        </div>

        {/* Hidden Canvas for QR processing */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Hidden File Input for fallback photo upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileUpload}
        />

        {/* Footer Actions */}
        <div className="p-4 bg-[#141522] border-t border-gray-800/80 flex items-center justify-between gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-amber-400 px-3 py-2 rounded-xl hover:bg-black/30 transition"
          >
            <Upload size={14} />
            <span>Enviar Imagem do QR Code</span>
          </button>

          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-xl text-xs font-semibold transition"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
