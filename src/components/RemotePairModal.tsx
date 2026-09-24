import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { X, Copy, Check, Smartphone, Users, ExternalLink, Camera } from 'lucide-react';
import QrScannerModal from './QrScannerModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
  onChangeRoomCode: (newCode: string) => void;
  controllersCount: number;
  onOpenControllerLocal?: () => void;
  onConnectAsControllerWithCode?: (code: string) => void;
}

export default function RemotePairModal({
  isOpen,
  onClose,
  roomCode,
  onChangeRoomCode,
  controllersCount,
  onOpenControllerLocal,
  onConnectAsControllerWithCode
}: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [customCode, setCustomCode] = useState(roomCode);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [justScannedCode, setJustScannedCode] = useState<string | null>(null);

  useEffect(() => {
    setCustomCode(roomCode);
  }, [roomCode]);

  const remoteUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}?remote=${encodeURIComponent(roomCode)}`
    : '';

  useEffect(() => {
    if (remoteUrl) {
      QRCode.toDataURL(remoteUrl, {
        width: 320,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      })
      .then(url => setQrDataUrl(url))
      .catch(err => console.error('Erro gerando QR Code:', err));
    }
  }, [remoteUrl]);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(remoteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleApplyCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (customCode.trim()) {
      onChangeRoomCode(customCode.trim().toUpperCase());
    }
  };

  const handleScanSuccess = (scannedCode: string) => {
    setJustScannedCode(scannedCode);
    onChangeRoomCode(scannedCode);
    setCustomCode(scannedCode);

    if (onConnectAsControllerWithCode) {
      setTimeout(() => {
        onConnectAsControllerWithCode(scannedCode);
        onClose();
      }, 500);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in overflow-y-auto">
        <div className="bg-[#0E0F17] border border-gray-800 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl relative text-white my-auto max-h-[92vh] overflow-y-auto">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <X size={20} />
          </button>

          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
              <Smartphone size={22} />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-gray-100">Controle Remoto Sem Fio</h3>
              <p className="text-xs text-gray-400">Opere o teleprompter por celular ou tablet</p>
            </div>
          </div>

          {/* Quick Scanner Action Button */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mb-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs">
              <Camera size={18} className="text-amber-400 shrink-0" />
              <div>
                <span className="font-bold text-amber-300 block">Deseja controlar outro dispositivo?</span>
                <span className="text-[11px] text-gray-300">Escaneie o QR Code exibido na tela dele</span>
              </div>
            </div>
            <button
              onClick={() => setIsScannerOpen(true)}
              className="bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-black px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition shrink-0 shadow-md cursor-pointer active:scale-95"
            >
              <Camera size={14} />
              <span>Escanear QR</span>
            </button>
          </div>

          {/* Just scanned feedback banner */}
          {justScannedCode && (
            <div className="bg-emerald-950/80 border border-emerald-500/80 p-3 rounded-xl mb-3 flex items-center justify-between text-xs text-emerald-300 animate-in fade-in">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
                <span>Sala pareada com sucesso: <strong>{justScannedCode}</strong></span>
              </div>
            </div>
          )}

          {/* QR Code container */}
          <div className="flex flex-col items-center justify-center bg-white p-3.5 sm:p-4 rounded-xl shadow-xl my-3 text-center">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR Code para Controle Remoto" className="w-48 h-48 sm:w-56 sm:h-56 rounded-lg object-contain" />
            ) : (
              <div className="w-48 h-48 sm:w-56 sm:h-56 bg-gray-100 animate-pulse rounded-lg flex items-center justify-center text-gray-500 text-xs">
                Gerando QR Code...
              </div>
            )}
            <p className="text-xs text-gray-800 mt-2 font-bold flex items-center gap-1.5">
              <Smartphone size={14} className="text-amber-600" />
              Aponte a câmera do seu celular para escanear
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5 max-w-xs">
              Abre instantaneamente no navegador do seu smartphone. Sem instalar aplicativos.
            </p>
          </div>

          {/* Connected devices status */}
          <div className="flex items-center justify-between bg-[#151622] border border-gray-800 px-3.5 py-2 rounded-xl mb-3 text-xs">
            <div className="flex items-center gap-2 text-gray-300">
              <Users size={16} className="text-amber-400" />
              <span>Dispositivos Conectados:</span>
            </div>
            <div className="flex items-center gap-1.5 font-bold font-mono">
              <span className={`w-2 h-2 rounded-full ${controllersCount > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}`}></span>
              <span className={controllersCount > 0 ? 'text-emerald-400' : 'text-gray-400'}>
                {controllersCount} {controllersCount === 1 ? 'celular conectado' : 'celulares conectados'}
              </span>
            </div>
          </div>

          {/* Room Code Selector */}
          <form onSubmit={handleApplyCode} className="flex gap-2 mb-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={customCode}
                onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                placeholder="Código da Sala"
                className="w-full bg-[#1A1B28] border border-gray-700 rounded-lg px-3 py-2 text-xs text-amber-400 font-mono font-bold uppercase focus:outline-none focus:border-amber-500"
              />
            </div>
            <button
              type="submit"
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xs font-semibold transition-colors"
            >
              Alterar Sala
            </button>
          </form>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-black py-2.5 rounded-xl text-xs font-bold transition-colors shadow-lg shadow-amber-500/20 active:scale-95"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Link Copiado!' : 'Copiar Link Direto para o Celular'}
              </button>
              <a
                href={remoteUrl}
                target="_blank"
                rel="noreferrer"
                className="p-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-xl flex items-center justify-center transition-colors"
                title="Abrir controle em nova aba"
              >
                <ExternalLink size={16} />
              </a>
            </div>

            {onOpenControllerLocal && (
              <button
                onClick={() => {
                  onClose();
                  onOpenControllerLocal();
                }}
                className="w-full py-2 bg-[#151622] hover:bg-gray-800 border border-gray-800 hover:border-gray-700 text-gray-400 hover:text-white rounded-xl text-xs font-medium transition-colors"
              >
                Abrir tela de controle neste navegador
              </button>
            )}
          </div>
        </div>
      </div>

      {/* QR Code Scanner Camera Modal */}
      <QrScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
      />
    </>
  );
}
