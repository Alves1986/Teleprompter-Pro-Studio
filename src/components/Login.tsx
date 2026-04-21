import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Mail, Lock, Loader2, AlertCircle, Terminal, User, Check } from 'lucide-react';

export default function Login() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { data, error: authError } = mode === 'login' 
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ 
            email, 
            password,
            options: {
              data: {
                full_name: fullName
              }
            }
          });

      if (authError) throw authError;

      if (mode === 'signup') {
        setSuccess('Conta criada com sucesso! Agora você pode fazer o login.');
        setMode('login');
        setPassword('');
        setLoading(false);
        return;
      }

    } catch (err: any) {
      setError(err.message || 'Erro ao processar autenticação');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[#1E2030] border border-gray-800 rounded-2xl p-8 shadow-2xl animate-in fade-in zoom-in duration-300">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-amber-500 p-3 rounded-xl mb-4">
            <Terminal size={32} className="text-[#0A0A0F]" />
          </div>
          <h1 className="text-3xl font-display font-bold text-white">
            Teleprompter<span className="text-amber-500">Pro</span>
          </h1>
          <p className="text-gray-500 mt-2 text-center text-sm">
            {mode === 'login' ? 'Entre para acessar seus roteiros na nuvem' : 'Crie sua conta para começar a gravar'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {mode === 'signup' && (
            <div className="flex flex-col gap-1.5 animate-in slide-in-from-top-2 duration-300">
              <label className="text-sm font-medium text-gray-400 ml-1">Nome Completo</label>
              <div className="relative">
                <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input 
                  type="text" 
                  required
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="w-full bg-black/40 border border-gray-800 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all"
                  placeholder="Seu nome"
                />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-400 ml-1">E-mail</label>
            <div className="relative">
              <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input 
                type="email" 
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-black/40 border border-gray-800 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all"
                placeholder="exemplo@email.com"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-400 ml-1">Senha</label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input 
                type="password" 
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-black/40 border border-gray-800 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 p-3 rounded-lg flex items-center gap-2 text-red-500 text-sm">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-500/10 border border-green-500/30 p-3 rounded-lg flex items-center gap-2 text-green-500 text-sm">
              <Check size={16} />
              {success}
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="bg-amber-600 hover:bg-amber-500 text-black py-3 rounded-xl font-bold transition-all shadow-lg hover:shadow-amber-500/20 mt-2 flex justify-center items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : (mode === 'login' ? 'Entrar Agora' : 'Criar Conta')}
          </button>
        </form>

        <div className="mt-8 text-center border-t border-gray-800 pt-6">
          <button 
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            className="text-amber-500 hover:text-amber-400 text-sm font-medium transition-colors"
          >
            {mode === 'login' ? 'Não tem conta? Crie uma agora' : 'Já tem conta? Faça login'}
          </button>
        </div>
      </div>
    </div>
  );
}
