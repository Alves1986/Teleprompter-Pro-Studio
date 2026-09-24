import { useState } from 'react';
import { Download, Tablet, Smartphone, X, Sparkles, HelpCircle, ChevronRight, Check } from 'lucide-react';
import { PWAInstallState } from '../hooks/usePWAInstall';
import InstallGuideModal from './InstallGuideModal';

interface Props {
  pwaState: PWAInstallState;
  className?: string;
  forceShow?: boolean;
}

export default function InstallAppBanner({ pwaState, className = '', forceShow = false }: Props) {
  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    if (typeof localStorage !== 'undefined') {
      const local = localStorage.getItem('tp_install_banner_dismissed');
      if (local !== null) return local === 'true';
    }
    if (typeof sessionStorage !== 'undefined') {
      return sessionStorage.getItem('tp_install_banner_dismissed') === 'true';
    }
    return false;
  });
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [justInstalled, setJustInstalled] = useState(false);

  // If app is already running as installed standalone PWA, no need to nag
  if (pwaState.isInstalled && !forceShow) {
    return null;
  }

  const handleInstallClick = async () => {
    if (pwaState.isInstallable) {
      const success = await pwaState.install();
      if (success) {
        setJustInstalled(true);
        setTimeout(() => setJustInstalled(false), 4000);
        return;
      }
    }
    // For iOS Safari or browsers where prompt isn't directly invocable, open visual guide
    setIsGuideOpen(true);
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('tp_install_banner_dismissed', 'true');
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('tp_install_banner_dismissed', 'true');
    }
  };

  const handleReopen = () => {
    setIsDismissed(false);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('tp_install_banner_dismissed');
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('tp_install_banner_dismissed');
    }
  };

  // Device-specific copy
  const isTablet = pwaState.isTablet;
  const deviceTitle = isTablet 
    ? 'Baixe no Tablet ou iPad' 
    : 'Baixe no Celular';

  const deviceSubtitle = isTablet
    ? 'Remova as barras do navegador para leitura em tela cheia perfeita no suporte ou vidro refletor.'
    : 'Controle remoto sem fio de baixa latência e leitura portátil 100% offline.';

  // If user dismissed the full banner, render a discreet floating pill
  if (isDismissed && !forceShow) {
    return (
      <>
        <div className="fixed bottom-3 right-3 pb-safe z-40 animate-fadeIn">
          <button
            onClick={handleReopen}
            className="flex items-center gap-1.5 bg-[#1E2030]/95 hover:bg-[#25283d] text-amber-400 border border-amber-500/40 px-3 py-1.5 rounded-full text-xs font-semibold shadow-xl backdrop-blur-md transition hover:scale-105 active:scale-95 touch-manipulation cursor-pointer"
            title="Abrir aviso de instalação do aplicativo"
          >
            {isTablet ? <Tablet size={14} /> : <Smartphone size={14} />}
            <span>Baixar App</span>
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
          </button>
        </div>
        <InstallGuideModal
          isOpen={isGuideOpen}
          onClose={() => setIsGuideOpen(false)}
          pwaState={pwaState}
        />
      </>
    );
  }

  return (
    <>
      {/* Mobile Compact Bar: Slim, zero-overflow, instant touch */}
      <div className={`sm:hidden bg-[#151624] border-b border-amber-500/30 px-3 py-1.5 flex items-center justify-between gap-2 shrink-0 z-20 ${className}`}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-md bg-amber-500 text-black flex items-center justify-center shrink-0 font-bold">
            {isTablet ? <Tablet size={13} /> : <Smartphone size={13} />}
          </div>
          <div className="min-w-0">
            <span className="font-bold text-white text-xs block truncate">{deviceTitle}</span>
            <span className="text-[10px] text-gray-400 block truncate">Modo tela cheia e offline</span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleInstallClick}
            disabled={justInstalled}
            className="bg-amber-500 hover:bg-amber-400 active:bg-amber-300 text-black font-bold text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1 shadow-sm active:scale-95 touch-manipulation cursor-pointer"
          >
            {justInstalled ? <Check size={12} /> : <Download size={12} />}
            <span>{justInstalled ? 'Instalado!' : 'Instalar'}</span>
          </button>
          <button
            onClick={handleDismiss}
            className="text-gray-400 hover:text-white p-1 rounded-md transition active:scale-90 touch-manipulation cursor-pointer"
            title="Fechar aviso"
            aria-label="Fechar aviso"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Tablet & Desktop Expanded Banner */}
      <div 
        className={`hidden sm:block bg-gradient-to-r from-[#171926] via-[#1c1e30] to-[#171926] border-y sm:border sm:rounded-2xl border-amber-500/30 shadow-2xl p-3 sm:p-4 text-gray-200 z-20 shrink-0 transition-all ${className}`}
      >
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          {/* Left Info: Icon & Message */}
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-black flex items-center justify-center font-bold shrink-0 shadow-lg shadow-amber-500/20">
              {isTablet ? <Tablet size={22} /> : <Smartphone size={22} />}
            </div>

            <div className="space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-display font-bold text-white text-sm sm:text-base tracking-wide flex items-center gap-1.5">
                  {deviceTitle}
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  <Sparkles size={11} /> {pwaState.platformName}
                </span>
                <span className="inline-block text-[10px] text-emerald-400 font-medium bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  Sem App Store / Gratuito
                </span>
              </div>
              <p className="text-xs text-gray-300 line-clamp-2">
                {deviceSubtitle}
              </p>
            </div>
          </div>

          {/* Right Controls: Install Action, Guide, Dismiss */}
          <div className="flex items-center gap-2 w-full md:w-auto justify-end pt-1 md:pt-0">
            <button
              onClick={() => setIsGuideOpen(true)}
              className="text-xs text-gray-400 hover:text-amber-400 px-2.5 py-2 rounded-lg hover:bg-black/30 transition flex items-center gap-1 touch-manipulation cursor-pointer"
              title="Ver passo a passo de como instalar no iOS ou Android"
            >
              <HelpCircle size={14} />
              <span className="hidden sm:inline">Instruções</span>
            </button>

            <button
              onClick={handleInstallClick}
              disabled={justInstalled}
              className={`flex-1 md:flex-none font-bold text-xs px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 touch-manipulation cursor-pointer ${
                justInstalled
                  ? 'bg-emerald-600 text-white'
                  : 'bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/20'
              }`}
            >
              {justInstalled ? (
                <>
                  <Check size={15} /> App Instalado!
                </>
              ) : (
                <>
                  <Download size={15} />
                  <span>Baixar / Instalar App</span>
                  <ChevronRight size={14} className="opacity-70" />
                </>
              )}
            </button>

            <button
              onClick={handleDismiss}
              className="text-gray-500 hover:text-gray-300 p-2 rounded-lg hover:bg-black/30 transition shrink-0 touch-manipulation cursor-pointer"
              title="Minimizar aviso"
              aria-label="Minimizar aviso"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Visual Step-by-Step Guide Modal */}
      <InstallGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        pwaState={pwaState}
      />
    </>
  );
}
