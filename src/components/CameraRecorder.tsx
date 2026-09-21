import { useState, useEffect, useRef } from 'react';
import { Video, Circle, Square, Pause, Play, Download, X, Eye, RefreshCw, AlertCircle, Mic, MicOff } from 'lucide-react';
import { formatTime } from '../utils';

interface Props {
  isEnabled: boolean;
  opacity: number;
  onToggleEnabled: (enabled: boolean) => void;
  onChangeOpacity: (opacity: number) => void;
}

export default function CameraRecorder({
  isEnabled,
  opacity,
  onToggleEnabled,
  onChangeOpacity
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioRecordStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordWithMic, setRecordWithMic] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isMirrored, setIsMirrored] = useState(true);

  const durationTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Start / Stop Camera Stream
  useEffect(() => {
    if (isEnabled) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isEnabled]);

  const startCamera = async () => {
    setCameraError(null);
    try {
      // audio: false is essential so camera display never locks the microphone,
      // allowing Speech Recognition / Voice Follow to stay 100% active and responsive!
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('camera_stream_toggled', { detail: { active: true } }));
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setCameraError('Permissão da câmera não concedida no navegador.');
      onToggleEnabled(false);
    }
  };

  const stopCamera = () => {
    if (mediaRecorderRef.current && isRecording) {
      stopRecording();
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioRecordStreamRef.current) {
      audioRecordStreamRef.current.getTracks().forEach(track => track.stop());
      audioRecordStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('camera_stream_toggled', { detail: { active: false } }));
    }
  };

  const startRecording = async () => {
    if (!mediaStreamRef.current) return;
    recordedChunksRef.current = [];
    setRecordedVideoUrl(null);
    setRecordDuration(0);

    try {
      let recordingStream = mediaStreamRef.current;

      // If user enabled audio recording, acquire mic audio for the recording take
      if (recordWithMic) {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          audioRecordStreamRef.current = audioStream;
          recordingStream = new MediaStream([
            ...mediaStreamRef.current.getVideoTracks(),
            ...audioStream.getAudioTracks()
          ]);
        } catch (audioErr) {
          console.warn('Microfone não acessível para gravação, gravando apenas vídeo:', audioErr);
        }
      }

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/mp4')
        ? 'video/mp4'
        : 'video/webm';

      const recorder = new MediaRecorder(recordingStream, { mimeType });
      
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setRecordedVideoUrl(url);

        // Clean up temporary audio tracks
        if (audioRecordStreamRef.current) {
          audioRecordStreamRef.current.getTracks().forEach(t => t.stop());
          audioRecordStreamRef.current = null;
        }
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setIsPaused(false);

      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
      durationTimerRef.current = setInterval(() => {
        setRecordDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Error starting MediaRecorder:', err);
      setCameraError('Não foi possível inicializar a gravação de vídeo.');
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      if (isPaused) {
        mediaRecorderRef.current.resume();
        setIsPaused(false);
        durationTimerRef.current = setInterval(() => {
          setRecordDuration(prev => prev + 1);
        }, 1000);
      } else {
        mediaRecorderRef.current.pause();
        setIsPaused(true);
        if (durationTimerRef.current) clearInterval(durationTimerRef.current);
      }
    }
  };

  const stopRecording = () => {
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setIsPaused(false);
  };

  const downloadRecording = () => {
    if (!recordedVideoUrl) return;
    const a = document.createElement('a');
    a.href = recordedVideoUrl;
    a.download = `teleprompter-take-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (!isEnabled && !recordedVideoUrl) return null;

  return (
    <>
      {/* Background Video Camera Stream */}
      {isEnabled && (
        <div 
          className="fixed inset-0 z-0 overflow-hidden pointer-events-none transition-opacity duration-300"
          style={{ opacity: opacity / 100 }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${isMirrored ? 'scale-x-[-1]' : ''}`}
          />
        </div>
      )}

      {/* Floating Camera Control HUD in prompter view */}
      {isEnabled && (
        <div className="fixed top-4 left-4 z-40 flex flex-col gap-2 pointer-events-auto">
          {cameraError && (
            <div className="text-[11px] text-red-400 bg-red-950/80 border border-red-800 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 max-w-[260px]">
              <AlertCircle size={14} className="shrink-0" />
              <span>{cameraError}</span>
            </div>
          )}
          <div className="bg-[#0A0A0F]/90 backdrop-blur-md border border-gray-800 rounded-xl p-2.5 shadow-2xl flex items-center gap-3 text-white text-xs">
            {/* Recording status */}
            {isRecording ? (
              <div className="flex items-center gap-2 pr-2 border-r border-gray-700">
                <span className="w-3 h-3 rounded-full bg-red-500 animate-ping"></span>
                <span className="font-mono font-bold text-red-400">REC {formatTime(recordDuration)}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-gray-400 pr-2 border-r border-gray-700">
                <Video size={14} className="text-amber-400" />
                <span>Câmera</span>
              </div>
            )}

            {/* Record / Pause / Stop Buttons */}
            {!isRecording ? (
              <button
                onClick={startRecording}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold transition-colors shadow"
              >
                <Circle size={12} className="fill-current" />
                Gravar
              </button>
            ) : (
              <>
                <button
                  onClick={pauseRecording}
                  className="p-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-200"
                  title={isPaused ? 'Continuar Gravação' : 'Pausar Gravação'}
                >
                  {isPaused ? <Play size={14} /> : <Pause size={14} />}
                </button>
                <button
                  onClick={stopRecording}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-red-700 hover:bg-red-600 rounded-lg text-white font-bold"
                  title="Finalizar Gravação"
                >
                  <Square size={12} className="fill-current" />
                  Parar
                </button>
              </>
            )}

            {/* Opacity slider */}
            <div className="flex items-center gap-1.5 pl-2 border-l border-gray-700">
              <Eye size={14} className="text-gray-400" />
              <input
                type="range"
                min="10"
                max="90"
                step="5"
                value={opacity}
                onChange={(e) => onChangeOpacity(Number(e.target.value))}
                className="w-16 accent-amber-500 cursor-pointer"
                title={`Opacidade do Vídeo: ${opacity}%`}
              />
            </div>

            {/* Mirror toggle */}
            <button
              onClick={() => setIsMirrored(!isMirrored)}
              className={`p-1.5 rounded-lg transition-colors ${isMirrored ? 'bg-amber-600/30 text-amber-400' : 'bg-gray-800 text-gray-400'}`}
              title="Espelhar Câmera"
            >
              <RefreshCw size={13} />
            </button>

            {/* Audio in recording toggle */}
            {!isRecording && (
              <button
                onClick={() => setRecordWithMic(!recordWithMic)}
                className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 ${
                  recordWithMic 
                    ? 'bg-red-600/30 text-red-400 border border-red-500/40' 
                    : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                }`}
                title={
                  recordWithMic 
                    ? 'Gravar vídeo COM áudio do microfone' 
                    : 'Gravação sem áudio (Recomendado para manter o Reconhecimento de Voz 100% ativo)'
                }
              >
                {recordWithMic ? <Mic size={13} /> : <MicOff size={13} />}
                <span className="text-[10px] hidden sm:inline">{recordWithMic ? 'Mic ON' : 'Mic OFF'}</span>
              </button>
            )}

            {/* Close camera */}
            <button
              onClick={() => onToggleEnabled(false)}
              className="p-1.5 hover:bg-gray-800 text-gray-400 hover:text-white rounded-lg"
              title="Desativar Câmera"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Recorded video popup / download modal */}
      {recordedVideoUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm pointer-events-auto">
          <div className="bg-[#0F101A] border border-gray-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl text-white">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Video className="text-emerald-400" size={18} />
                Gravação Concluída ({formatTime(recordDuration)})
              </h3>
              <button
                onClick={() => setRecordedVideoUrl(null)}
                className="text-gray-400 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="rounded-xl overflow-hidden bg-black aspect-video mb-4 border border-gray-800">
              <video src={recordedVideoUrl} controls className="w-full h-full object-contain" />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setRecordedVideoUrl(null)}
                className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 rounded-xl text-xs font-medium transition-colors"
              >
                Descartar
              </button>
              <button
                onClick={downloadRecording}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors shadow-lg"
              >
                <Download size={16} />
                Baixar Gravação (.webm)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
