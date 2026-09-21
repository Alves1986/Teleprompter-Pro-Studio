import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { X, Copy, Check, Smartphone, Users, ExternalLink } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
  onChangeRoomCode: (newCode: string) => void;
  controllersCount: number;
}

export default function RemotePairModal({
  isOpen,
  onClose,
  roomCode,
  onChangeRoomCode,
  controllersCount
}: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [customCode, setCustomCode] = useState(roomCode);

  const remoteUrl = typeof window !== 'undefined'
    ? `${window.location.origin}?remote=${encodeURIComponent(roomCode)}`
    : '';

  useEffect(() => {
    if (remoteUrl) {
      QRCode.toDataURL(remoteUrl, {
        width: 280,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-[#0E0F17] border border-gray-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative text-white">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
            <Smartphone size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-100">Controle Remoto Sem Fio</h3>
            <p className="text-xs text-gray-400">Opere este teleprompter pelo seu celular ou tablet</p>
          </div>
        </div>

        {/* QR Code container */}
        <div className="flex flex-col items-center justify-center bg-white p-4 rounded-xl shadow-inner my-4">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="QR Code para Controle Remoto" className="w-56 h-56 rounded-lg" />
          ) : (
            <div className="w-56 h-56 bg-gray-100 animate-pulse rounded-lg flex items-center justify-center text-gray-400 text-xs">
              Gerando QR Code...
            </div>
          )}
          <p className="text-[11px] text-gray-600 mt-2 font-medium">Aponte a câmera do seu smartphone</p>
        </div>

        {/* Connected devices status */}
        <div className="flex items-center justify-between bg-[#151622] border border-gray-800 px-3.5 py-2.5 rounded-xl mb-4 text-xs">
          <div className="flex items-center gap-2 text-gray-300">
            <Users size={16} className="text-amber-400" />
            <span>Dispositivos Conectados:</span>
          </div>
          <div className="flex items-center gap-1.5 font-bold font-mono">
            <span className={`w-2 h-2 rounded-full ${controllersCount > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
            <span className={controllersCount > 0 ? 'text-emerald-400' : 'text-gray-400'}>
              {controllersCount} {controllersCount === 1 ? 'celular' : 'celulares'}
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
              className="w-full bg-[#1A1B28] border border-gray-700 rounded-lg px-3 py-2 text-sm text-amber-400 font-mono font-bold uppercase focus:outline-none focus:border-amber-500"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            Alterar Sala
          </button>
        </form>

        {/* Copy Link Button */}
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="flex-1 flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 text-black py-2.5 rounded-xl text-xs font-bold transition-colors"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Link Copiado!' : 'Copiar Link do Controle'}
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
      </div>
    </div>
  );
}
