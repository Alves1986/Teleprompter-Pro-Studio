import { useState, useEffect } from 'react';
import { 
  X, 
  Smartphone, 
  Gamepad2, 
  Radio, 
  CheckCircle2, 
  RefreshCw, 
  Volume2, 
  VolumeX, 
  QrCode, 
  Keyboard, 
  Activity, 
  Check, 
  Send,
  Sliders,
  Zap
} from 'lucide-react';
import { ConnectedMobileDevice } from '../types';
import { useBluetoothGamepadVerifier } from '../hooks/useBluetoothGamepadVerifier';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
  controllersCount: number;
  connectedMobileDevices?: ConnectedMobileDevice[];
  onOpenQrPair?: () => void;
  onOpenShortcuts?: () => void;
  onSendTestSignal?: () => void;
}

export default function BluetoothVerifierModal({
  isOpen,
  onClose,
  roomCode,
  controllersCount,
  connectedMobileDevices = [],
  onOpenQrPair,
  onOpenShortcuts,
  onSendTestSignal
}: Props) {
  const {
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
  } = useBluetoothGamepadVerifier(isOpen);

  const [activeTab, setActiveTab] = useState<'verifier' | 'guide'>('verifier');
  const [testSentToast, setTestSentToast] = useState(false);

  // Auto-listen to signals forwarded from mobile via connectedMobileDevices
  useEffect(() => {
    if (!isOpen) return;
    const latestMobile = connectedMobileDevices.find(d => d.lastSignal);
    if (latestMobile && latestMobile.lastSignal) {
      const sig = latestMobile.lastSignal;
      const isNew = !lastSignal || Math.abs(Date.now() - sig.timestamp) < 400;
      if (isNew) {
        registerSignal({
          source: 'remote_mobile',
          deviceId: latestMobile.id,
          deviceName: `${latestMobile.name} (Mobile)`,
          buttonIndex: typeof sig.button === 'number' ? sig.button : undefined,
          keyLabel: typeof sig.button === 'string' ? sig.button : undefined,
          action: sig.action || 'Comando do Celular'
        });
      }
    }
  }, [connectedMobileDevices, isOpen, registerSignal]);

  if (!isOpen) return null;

  // Check whether any mobile device reports a connected Bluetooth pedal/controller
  const mobileWithBluetooth = connectedMobileDevices.find(d => d.bluetoothConnected || (d.bluetoothDevices && d.bluetoothDevices.length > 0));
  const isMobileConnected = controllersCount > 0 || connectedMobileDevices.length > 0;
  const isBluetoothOnMobile = Boolean(mobileWithBluetooth);
  const isBluetoothLocal = connectedDevices.length > 0;

  const handleManualTestPing = () => {
    registerSignal({
      source: currentProfile.isMobileDevice ? 'remote_mobile' : 'gamepad',
      deviceId: 'test_ping',
      deviceName: currentProfile.isMobileDevice ? 'Simulador Mobile' : 'Dispositivo Local',
      buttonIndex: 0,
      action: 'Play / Pause (Sinal de Teste)'
    });
    setTestSentToast(true);
    setTimeout(() => setTestSentToast(false), 1800);
    if (onSendTestSignal) {
      onSendTestSignal();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in overflow-y-auto">
      <div className="bg-[#0D0F18] border border-gray-800 rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl relative text-white my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/10 border border-blue-500/30 rounded-xl text-blue-400 flex items-center justify-center relative">
              <Radio size={22} className="text-blue-400" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-gray-100">
                  Verificador de Conexão Bluetooth & Mobile
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-950/80 border border-blue-600/50 text-blue-300 uppercase">
                  Diagnóstico Ativo
                </span>
              </div>
              <p className="text-xs text-gray-400">
                Verifique se o seu pedal ou apresentador está conectado com o celular e respondendo em tempo real
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2 rounded-lg border transition-colors ${
                soundEnabled 
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-400' 
                  : 'bg-gray-800 border-gray-700 text-gray-400'
              }`}
              title={soundEnabled ? 'Som de clique/bipe ativado' : 'Som desativado'}
            >
              {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>

            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-800 transition-colors"
              title="Fechar"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 my-3 shrink-0">
          <button
            onClick={() => setActiveTab('verifier')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 border ${
              activeTab === 'verifier'
                ? 'bg-[#181A2A] border-amber-500/50 text-amber-300 shadow-sm'
                : 'bg-[#10121D] border-gray-800 text-gray-400 hover:text-gray-200'
            }`}
          >
            <Activity size={14} className="text-amber-400" />
            <span>Verificador & Teste em Tempo Real</span>
            {signalCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-black font-mono text-[10px] font-bold">
                {signalCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('guide')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 border ${
              activeTab === 'guide'
                ? 'bg-[#181A2A] border-amber-500/50 text-amber-300 shadow-sm'
                : 'bg-[#10121D] border-gray-800 text-gray-400 hover:text-gray-200'
            }`}
          >
            <Zap size={14} className="text-blue-400" />
            <span>Como Conectar no Celular</span>
          </button>
        </div>

        {/* Main Body */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-4">
          {activeTab === 'verifier' ? (
            <>
              {/* O Verificador em 2 Painéis Principais: Mobile e Bluetooth */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* 1. Status do Celular (Mobile) */}
                <div className={`p-4 rounded-xl border transition-all ${
                  isMobileConnected 
                    ? 'bg-emerald-950/20 border-emerald-500/40 shadow-sm' 
                    : 'bg-[#131422] border-gray-800'
                }`}>
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${isMobileConnected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-800 text-gray-400'}`}>
                        <Smartphone size={16} />
                      </div>
                      <span className="text-xs font-bold text-gray-200 uppercase tracking-wider">
                        1. Conexão do Celular (Mobile)
                      </span>
                    </div>
                    {isMobileConnected ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 font-mono text-[10px] font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        {controllersCount || connectedMobileDevices.length} Celular Conectado
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-medium">
                        Aguardando Celular
                      </span>
                    )}
                  </div>

                  {isMobileConnected ? (
                    <div className="space-y-2 text-xs">
                      <div className="bg-[#0B0D16] p-2.5 rounded-lg border border-gray-800/80">
                        <div className="text-gray-300 font-medium flex items-center justify-between">
                          <span>Aparelho Conectado:</span>
                          <span className="text-emerald-400 font-mono font-bold">
                            {connectedMobileDevices[0]?.name || (currentProfile.isMobileDevice ? currentProfile.name : 'Celular Pareado')}
                          </span>
                        </div>
                        <div className="text-gray-400 text-[11px] mt-1 flex items-center justify-between">
                          <span>Sala do Teleprompter:</span>
                          <span className="text-amber-400 font-mono font-bold">{roomCode}</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-emerald-300/80 flex items-center gap-1">
                        <Check size={13} className="text-emerald-400" />
                        Comunicação direta sem fio ativa e sincronizada
                      </p>
                    </div>
                  ) : (
                    <div className="text-xs space-y-2">
                      <p className="text-gray-400 text-[11px]">
                        Nenhum celular conectado a esta sala no momento. Para usar seu celular como ponte para o pedal Bluetooth:
                      </p>
                      {onOpenQrPair && (
                        <button
                          onClick={onOpenQrPair}
                          className="w-full py-2 px-3 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg text-xs flex items-center justify-center gap-2 transition-colors shadow-sm"
                        >
                          <QrCode size={14} />
                          <span>Exibir QR Code para Conectar o Celular</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* 2. Verificador do Dispositivo Conectado ao Mobile */}
                <div className={`p-4 rounded-xl border transition-all ${
                  isBluetoothOnMobile || isBluetoothLocal
                    ? 'bg-blue-950/25 border-blue-500/40 shadow-sm'
                    : 'bg-[#131422] border-gray-800'
                }`}>
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${isBluetoothOnMobile || isBluetoothLocal ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-800 text-gray-400'}`}>
                        <Gamepad2 size={16} />
                      </div>
                      <span className="text-xs font-bold text-gray-200 uppercase tracking-wider">
                        2. Dispositivo Bluetooth (Pedal/Controle)
                      </span>
                    </div>

                    {isBluetoothOnMobile ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 font-mono text-[10px] font-bold flex items-center gap-1">
                        <CheckCircle2 size={11} className="text-emerald-400" />
                        Conectado ao Celular
                      </span>
                    ) : isBluetoothLocal ? (
                      <span className="px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-500/50 text-blue-300 font-mono text-[10px] font-bold">
                        {connectedDevices.length} Conectado Localmente
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 text-[10px]">
                        Nenhum Detectado
                      </span>
                    )}
                  </div>

                  {/* Resposta direta: O dispositivo está conectado com o mobile já? */}
                  <div className="bg-[#0B0D16] p-3 rounded-lg border border-gray-800/80 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Conectado com o Mobile:</span>
                      {isBluetoothOnMobile ? (
                        <span className="text-emerald-400 font-bold flex items-center gap-1">
                          <CheckCircle2 size={13} className="text-emerald-400" />
                          SIM, CONECTADO!
                        </span>
                      ) : (
                        <span className="text-amber-400/90 font-medium">
                          {isMobileConnected ? 'Aguardando pedal no celular' : 'Conecte o celular primeiro'}
                        </span>
                      )}
                    </div>

                    {/* Dispositivos listados */}
                    {isBluetoothOnMobile && mobileWithBluetooth ? (
                      <div className="pt-1.5 border-t border-gray-800 text-[11px]">
                        <span className="text-gray-400 block mb-1">Acessórios no celular:</span>
                        {mobileWithBluetooth.bluetoothDevices?.map((dev, i) => (
                          <div key={i} className="text-emerald-300 font-mono font-semibold flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            {dev}
                          </div>
                        ))}
                      </div>
                    ) : isBluetoothLocal ? (
                      <div className="pt-1.5 border-t border-gray-800 text-[11px]">
                        <span className="text-gray-400 block mb-1">Detectado neste computador:</span>
                        {connectedDevices.map((dev, i) => (
                          <div key={i} className="text-blue-300 font-mono font-semibold flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                            {dev.name}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-gray-500 pt-1">
                        Pressione qualquer pedal ou botão do apresentador para ativar a leitura do sinal.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Área Interativa de Verificação de Sinal em Tempo Real (Live Signal Verifier) */}
              <div className="bg-[#111320] border border-gray-800 rounded-xl p-4 shadow-lg">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Radio size={16} className="text-amber-400" />
                    <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
                      Área de Teste de Sinais em Tempo Real
                    </h4>
                  </div>
                  <span className="text-[11px] text-gray-400 font-mono">
                    Total de pulsos recebidos: <strong className="text-amber-400">{signalCount}</strong>
                  </span>
                </div>

                {/* Grande LED Indicador Visual de Sinal Recebido */}
                <div className={`p-4 rounded-xl border transition-all duration-300 flex flex-col sm:flex-row items-center justify-between gap-3 ${
                  lastSignal && Date.now() - lastSignal.timestamp < 1500
                    ? 'bg-emerald-950/40 border-emerald-500/80 ring-4 ring-emerald-500/20 shadow-emerald-900/30 shadow-lg'
                    : 'bg-[#090A10] border-gray-800'
                }`}>
                  <div className="flex items-center gap-3.5">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                      lastSignal && Date.now() - lastSignal.timestamp < 1500
                        ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/50 scale-110 animate-pulse'
                        : 'bg-gray-800 text-gray-500'
                    }`}>
                      <Activity size={20} />
                    </div>

                    <div>
                      {lastSignal && Date.now() - lastSignal.timestamp < 3000 ? (
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-extrabold text-emerald-300 uppercase tracking-wide">
                              Sinal Confirmado com Sucesso!
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-900/70 text-emerald-200 border border-emerald-500/40">
                              {lastSignal.source === 'remote_mobile' ? 'Via Celular Mobile' : 'Local'}
                            </span>
                          </div>
                          <p className="text-xs text-gray-200 mt-0.5 font-medium">
                            Dispositivo: <strong className="text-amber-400">{lastSignal.deviceName}</strong> • Ação: <strong className="text-white">{lastSignal.action}</strong>
                          </p>
                        </div>
                      ) : (
                        <div>
                          <span className="text-xs font-bold text-gray-400">
                            Aguardando acionamento de pedal ou controle...
                          </span>
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            Pise no pedal ou aperte qualquer botão no seu celular para testar a resposta imediata.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Botão de Teste Manual */}
                  <button
                    onClick={handleManualTestPing}
                    className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-gray-200 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border border-gray-700 shrink-0 cursor-pointer active:scale-95"
                    title="Simula um acionamento de pedal para verificar a linha de transmissão"
                  >
                    <Send size={13} className="text-amber-400" />
                    <span>{testSentToast ? 'Sinal Enviado!' : 'Disparar Teste'}</span>
                  </button>
                </div>

                {/* Grade de Botões Virtuais Rápidos (Test Pad) */}
                <div className="mt-3">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">
                    Mapeamento Típico de Botões de Pedal:
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                    <div className={`p-2 rounded-lg border transition-colors ${
                      lastSignal?.buttonIndex === 0 || lastSignal?.keyLabel === 'Space'
                        ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300 font-bold'
                        : 'bg-[#151726] border-gray-800/80 text-gray-400'
                    }`}>
                      <div className="text-[10px] text-gray-500 font-mono">BOTÃO 0 / ESPAÇO</div>
                      <div className="text-xs font-bold mt-0.5 text-gray-200">Play / Pausa</div>
                    </div>

                    <div className={`p-2 rounded-lg border transition-colors ${
                      lastSignal?.buttonIndex === 12 || lastSignal?.keyLabel === 'ArrowUp' || lastSignal?.keyLabel === 'PageUp'
                        ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300 font-bold'
                        : 'bg-[#151726] border-gray-800/80 text-gray-400'
                    }`}>
                      <div className="text-[10px] text-gray-500 font-mono">BOTÃO 12 / CIMA</div>
                      <div className="text-xs font-bold mt-0.5 text-gray-200">Acelerar (+)</div>
                    </div>

                    <div className={`p-2 rounded-lg border transition-colors ${
                      lastSignal?.buttonIndex === 13 || lastSignal?.keyLabel === 'ArrowDown' || lastSignal?.keyLabel === 'PageDown'
                        ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300 font-bold'
                        : 'bg-[#151726] border-gray-800/80 text-gray-400'
                    }`}>
                      <div className="text-[10px] text-gray-500 font-mono">BOTÃO 13 / BAIXO</div>
                      <div className="text-xs font-bold mt-0.5 text-gray-200">Desacelerar (-)</div>
                    </div>

                    <div className={`p-2 rounded-lg border transition-colors ${
                      lastSignal?.buttonIndex === 1 || lastSignal?.keyLabel === 'KeyR'
                        ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300 font-bold'
                        : 'bg-[#151726] border-gray-800/80 text-gray-400'
                    }`}>
                      <div className="text-[10px] text-gray-500 font-mono">BOTÃO 1 / REWIND</div>
                      <div className="text-xs font-bold mt-0.5 text-gray-200">Voltar ao Início</div>
                    </div>
                  </div>
                </div>

                {/* Histórico dos Últimos Sinais */}
                {signalHistory.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-800/80">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">
                      Histórico Recente de Sinais:
                    </span>
                    <div className="space-y-1 font-mono text-[11px] max-h-24 overflow-y-auto">
                      {signalHistory.map((sig) => (
                        <div key={sig.id} className="flex items-center justify-between text-gray-400 bg-[#0A0B12] px-2.5 py-1 rounded border border-gray-800/60">
                          <span className="text-emerald-400 font-semibold">{sig.deviceName}</span>
                          <span className="text-gray-300">{sig.action}</span>
                          <span className="text-gray-500 text-[10px]">
                            {new Date(sig.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Varredura Nativa Web Bluetooth (se disponível no navegador) */}
              <div className="bg-[#10121D] border border-gray-800 rounded-xl p-3.5 flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
                    <Radio size={14} className="text-blue-400" />
                    Busca Direta Web Bluetooth (BLE)
                  </h4>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {currentProfile.supportsBluetooth
                      ? 'Navegador com suporte direto a pareamento Web Bluetooth.'
                      : 'Navegador sem Web Bluetooth nativo (o pareamento é feito nos Ajustes do sistema).'}
                  </p>
                  {bleError && (
                    <p className="text-[11px] text-red-400 mt-1">{bleError}</p>
                  )}
                </div>

                {currentProfile.supportsBluetooth && (
                  <button
                    onClick={scanWebBluetooth}
                    disabled={isScanningBle}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shrink-0 disabled:opacity-50 cursor-pointer active:scale-95"
                  >
                    <RefreshCw size={13} className={isScanningBle ? 'animate-spin' : ''} />
                    <span>{isScanningBle ? 'Buscando...' : 'Parear BLE'}</span>
                  </button>
                )}
              </div>
            </>
          ) : (
            /* Guia Passo a Passo: Como Conectar no Celular */
            <div className="space-y-3 text-xs text-gray-300">
              <div className="bg-[#111320] border border-gray-800 rounded-xl p-4 space-y-3">
                <h4 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                  <Smartphone size={16} />
                  Como usar Pedal Bluetooth com o Celular
                </h4>

                <div className="space-y-2.5 text-xs text-gray-300">
                  <div className="flex gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-amber-500 text-black font-bold flex items-center justify-center shrink-0 text-xs">
                      1
                    </div>
                    <div>
                      <strong className="text-white block">Pareie o Pedal no Celular:</strong>
                      Vá em <em>Configurações / Ajustes &gt; Bluetooth</em> do seu celular ou tablet e conecte o seu pedal (Lekato, Donner, AirTurn, PageFlip, etc.).
                    </div>
                  </div>

                  <div className="flex gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-amber-500 text-black font-bold flex items-center justify-center shrink-0 text-xs">
                      2
                    </div>
                    <div>
                      <strong className="text-white block">Abra o Controle Remoto no Celular:</strong>
                      Escaneie o QR Code desta tela usando a câmera do seu celular. A tela de controle remoto abrirá instantaneamente sem precisar instalar nada.
                    </div>
                  </div>

                  <div className="flex gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-amber-500 text-black font-bold flex items-center justify-center shrink-0 text-xs">
                      3
                    </div>
                    <div>
                      <strong className="text-white block">Verifique o Sinal:</strong>
                      Pise no pedal enquanto estiver com o celular aberto. O celular vibrará e o verificador aqui confirmará <strong>"Sinal Confirmado"</strong> na mesma hora!
                    </div>
                  </div>
                </div>
              </div>

              {/* Dica para pedais no modo teclado */}
              <div className="bg-[#111320] border border-gray-800 rounded-xl p-4 text-xs space-y-1">
                <span className="font-bold text-blue-400 flex items-center gap-1.5">
                  <Keyboard size={14} />
                  Modos de Operação do seu Pedal:
                </span>
                <p className="text-gray-400 text-[11px]">
                  • <strong>Modo Gamepad / Hid:</strong> Envia botões numéricos (Botão 0 = Play/Pausa). Totalmente suportado.<br/>
                  • <strong>Modo Teclado (PageDown / Espaço):</strong> Alguns pedais simulam teclas de teclado. O sistema reconhece ambos automaticamente!
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-3.5 border-t border-gray-800 flex flex-wrap items-center justify-between gap-2 shrink-0 mt-3">
          <div className="flex items-center gap-2">
            {onOpenShortcuts && (
              <button
                onClick={() => {
                  onClose();
                  onOpenShortcuts();
                }}
                className="px-3 py-1.5 bg-[#151726] hover:bg-gray-800 border border-gray-700 text-gray-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Sliders size={13} className="text-amber-400" />
                <span>Mapeamento de Botões</span>
              </button>
            )}

            {onOpenQrPair && (
              <button
                onClick={() => {
                  onClose();
                  onOpenQrPair();
                }}
                className="px-3 py-1.5 bg-[#151726] hover:bg-gray-800 border border-gray-700 text-gray-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <QrCode size={13} className="text-amber-400" />
                <span>QR Code Celular</span>
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg text-xs transition-colors shadow-md active:scale-95"
          >
            Concluir Verificação
          </button>
        </div>
      </div>
    </div>
  );
}
