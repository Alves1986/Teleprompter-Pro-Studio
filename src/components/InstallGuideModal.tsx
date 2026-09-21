import { useState } from 'react';
import { X, Download, Share2, PlusSquare, MoreVertical, Smartphone, Tablet, CheckCircle, Sparkles, ExternalLink } from 'lucide-react';
import { PWAInstallState } from '../hooks/usePWAInstall';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  pwaState: PWAInstallState;
}

export default function InstallGuideModal({ isOpen, onClose, pwaState }: Props) {
  const [activeTab, setActiveTab] = useState<'auto' | 'ios' | 'android'>(() => {
    if (pwaState.isIOS) return 'ios';
    if (pwaState.isAndroid) return 'android';
    return 'auto';
  });

  if (!isOpen) return null;

  const handleDirectInstall = async () => {
    if (pwaState.isInstallable) {
      const installed = await pwaState.install();
      if (installed) {
        onClose();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div 
        className="bg-[#12131C] border border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-gray-800 flex items-center justify-between bg-[#1E2030]/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              {pwaState.isTablet ? <Tablet size={22} /> : <Smartphone size={22} />}
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Baixar Teleprompter Pro
                <span className="text-[10px] uppercase font-bold tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
                  {pwaState.platformName}
                </span>
              </h2>
              <p className="text-xs text-gray-400">
                Experiência 100% tela cheia para suporte, tripé ou controle remoto
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-800 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Device Tabs */}
        <div className="flex border-b border-gray-800 bg-black/40 px-4 pt-2 gap-2 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('auto')}
            className={`pb-2.5 px-3 border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'auto'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Sparkles size={14} /> Recomendado ({pwaState.platformName})
          </button>
          <button
            onClick={() => setActiveTab('ios')}
            className={`pb-2.5 px-3 border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'ios'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Tablet size={14} /> iPad / iPhone (Safari)
          </button>
          <button
            onClick={() => setActiveTab('android')}
            className={`pb-2.5 px-3 border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'android'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Smartphone size={14} /> Android (Chrome)
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-sm">
          {/* If ready for direct 1-tap browser install */}
          {pwaState.isInstallable && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-amber-400 text-sm flex items-center gap-1.5">
                  <CheckCircle size={16} /> Instalação Rápida Disponível
                </h3>
                <p className="text-xs text-gray-300 mt-0.5">
                  Seu navegador suporta instalação com 1 toque direto para a tela inicial.
                </p>
              </div>
              <button
                onClick={handleDirectInstall}
                className="w-full sm:w-auto bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 transition shadow-md"
              >
                <Download size={15} /> Instalar Agora
              </button>
            </div>
          )}

          {/* iOS / iPadOS Instructions */}
          {(activeTab === 'ios' || (activeTab === 'auto' && pwaState.isIOS)) && (
            <div className="space-y-3">
              <div className="text-xs text-amber-300/90 font-medium bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20">
                💡 <strong>Dica para iPad / iPhone:</strong> No navegador Safari da Apple, a instalação é feita pelo botão Compartilhar.
              </div>

              <div className="space-y-2.5 text-xs text-gray-300">
                <div className="flex items-start gap-3 bg-gray-900/60 p-3 rounded-xl border border-gray-800">
                  <div className="w-6 h-6 rounded-full bg-amber-500 text-black font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                    1
                  </div>
                  <div>
                    <span className="font-semibold text-white">Abra no Safari e toque em Compartilhar</span>
                    <p className="text-gray-400 mt-1 flex items-center gap-1">
                      Toque no ícone <Share2 size={14} className="text-blue-400 inline" /> (quadrado com seta para cima) na barra de ferramentas do Safari.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-gray-900/60 p-3 rounded-xl border border-gray-800">
                  <div className="w-6 h-6 rounded-full bg-amber-500 text-black font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                    2
                  </div>
                  <div>
                    <span className="font-semibold text-white">Selecione "Adicionar à Tela de Início"</span>
                    <p className="text-gray-400 mt-1 flex items-center gap-1">
                      Role a lista de opções para baixo e toque em <PlusSquare size={14} className="text-amber-400 inline" /> <strong>"Adicionar à Tela de Início"</strong>.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-gray-900/60 p-3 rounded-xl border border-gray-800">
                  <div className="w-6 h-6 rounded-full bg-amber-500 text-black font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                    3
                  </div>
                  <div>
                    <span className="font-semibold text-white">Toque em "Adicionar"</span>
                    <p className="text-gray-400 mt-1">
                      Confirme no canto superior direito. O ícone do Teleprompter Pro aparecerá na tela inicial como um app nativo!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Android Tablet / Phone Instructions */}
          {(activeTab === 'android' || (activeTab === 'auto' && pwaState.isAndroid && !pwaState.isInstallable)) && (
            <div className="space-y-3">
              <div className="text-xs text-amber-300/90 font-medium bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20">
                💡 <strong>Dica para Android (Chrome / Edge / Samsung):</strong>
              </div>

              <div className="space-y-2.5 text-xs text-gray-300">
                <div className="flex items-start gap-3 bg-gray-900/60 p-3 rounded-xl border border-gray-800">
                  <div className="w-6 h-6 rounded-full bg-amber-500 text-black font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                    1
                  </div>
                  <div>
                    <span className="font-semibold text-white">Abra o menu do navegador</span>
                    <p className="text-gray-400 mt-1 flex items-center gap-1">
                      Toque nos 3 pontinhos <MoreVertical size={14} className="text-gray-300 inline" /> no canto superior direito do Chrome.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-gray-900/60 p-3 rounded-xl border border-gray-800">
                  <div className="w-6 h-6 rounded-full bg-amber-500 text-black font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                    2
                  </div>
                  <div>
                    <span className="font-semibold text-white">Toque em "Instalar aplicativo"</span>
                    <p className="text-gray-400 mt-1 flex items-center gap-1">
                      Selecione <Download size={14} className="text-amber-400 inline" /> <strong>"Instalar aplicativo"</strong> ou <strong>"Adicionar à tela inicial"</strong>.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-gray-900/60 p-3 rounded-xl border border-gray-800">
                  <div className="w-6 h-6 rounded-full bg-amber-500 text-black font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                    3
                  </div>
                  <div>
                    <span className="font-semibold text-white">Pronto!</span>
                    <p className="text-gray-400 mt-1">
                      O app será instalado sem precisar acessar a Play Store e abrirá em tela cheia instantaneamente.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Fallback / Desktop Instructions */}
          {activeTab === 'auto' && !pwaState.isIOS && !pwaState.isAndroid && !pwaState.isInstallable && (
            <div className="space-y-3">
              <div className="bg-gray-900/70 p-3.5 rounded-xl border border-gray-800 text-xs text-gray-300 space-y-2">
                <p className="font-semibold text-white flex items-center gap-1.5">
                  <ExternalLink size={14} className="text-amber-400" /> No computador ou tablet:
                </p>
                <p className="text-gray-400">
                  No Google Chrome ou Edge, clique no ícone de computador/download <Download size={13} className="inline text-amber-400" /> no lado direito da barra de endereço para instalar como aplicativo de desktop.
                </p>
              </div>
            </div>
          )}

          {/* Value props list */}
          <div className="border-t border-gray-800/80 pt-3">
            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
              Por que baixar no Tablet ou Celular?
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-400">
              <div className="flex items-center gap-2 bg-black/30 p-2 rounded-lg border border-gray-800/60">
                <CheckCircle size={14} className="text-emerald-400 shrink-0" />
                <span>100% tela cheia (sem barras)</span>
              </div>
              <div className="flex items-center gap-2 bg-black/30 p-2 rounded-lg border border-gray-800/60">
                <CheckCircle size={14} className="text-emerald-400 shrink-0" />
                <span>Funciona offline sem internet</span>
              </div>
              <div className="flex items-center gap-2 bg-black/30 p-2 rounded-lg border border-gray-800/60">
                <CheckCircle size={14} className="text-emerald-400 shrink-0" />
                <span>Ideal para suporte e tripés</span>
              </div>
              <div className="flex items-center gap-2 bg-black/30 p-2 rounded-lg border border-gray-800/60">
                <CheckCircle size={14} className="text-emerald-400 shrink-0" />
                <span>Controle sem fio super rápido</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 bg-[#1E2030]/40 flex items-center justify-between gap-3">
          <span className="text-[11px] text-gray-500 font-mono">
            PWA Standalone Engine • v2.4
          </span>
          <div className="flex items-center gap-2">
            {pwaState.isInstallable ? (
              <button
                onClick={handleDirectInstall}
                className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 transition shadow"
              >
                <Download size={14} /> Instalar
              </button>
            ) : null}
            <button
              onClick={onClose}
              className="bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium px-4 py-2 rounded-lg text-xs transition"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
