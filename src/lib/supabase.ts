import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// URLs no Supabase seguem o padrão https://xyz.supabase.co
const isValidUrl = supabaseUrl && supabaseUrl.startsWith('https://');

// Inicialização segura
export const supabase = createClient(
  isValidUrl ? supabaseUrl : 'https://abcdefghijklm.supabase.co', 
  supabaseAnonKey || 'dummy-key'
);

export const isConfigured = !!(isValidUrl && supabaseAnonKey);

// Log para depuração interna (visível se o usuário abrir o console)
if (!isConfigured) {
  console.warn('Teleprompter Pro: Supabase não está configurado. Por favor, adicione VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no menu de Secrets.');
}

export const scriptsApi = {
  async getAll() {
    const saved = localStorage.getItem('tp_scripts_local');
    if (saved) {
      return JSON.parse(saved);
    }
    return [];
  },

  async upsert(script: any) {
    const currentScriptsString = localStorage.getItem('tp_scripts_local');
    let scripts: any[] = currentScriptsString ? JSON.parse(currentScriptsString) : [];
    
    // Simulate an auto-generated ID if temp or empty. 
    // We keep UUID-like lengths if we want to be safe, but Date.now is fine
    const isNew = !script.id || script.id === 'temp';
    const idToUse = isNew ? Date.now().toString() : script.id;

    const newScriptObj = {
      id: idToUse,
      title: script.title,
      content: script.content,
      lastModified: script.lastModified || Date.now(),
      tags: script.tags || [],
      color: script.color,
      duration: script.duration,
      lastSynced: Date.now()
    };

    if (isNew) {
      scripts.push(newScriptObj);
    } else {
      const index = scripts.findIndex(s => s.id === script.id);
      if (index >= 0) {
        scripts[index] = newScriptObj;
      } else {
        scripts.push(newScriptObj);
      }
    }

    localStorage.setItem('tp_scripts_local', JSON.stringify(scripts));
    return newScriptObj;
  },

  async delete(id: string) {
    const currentScriptsString = localStorage.getItem('tp_scripts_local');
    let scripts: any[] = currentScriptsString ? JSON.parse(currentScriptsString) : [];
    
    scripts = scripts.filter(s => s.id !== id);
    localStorage.setItem('tp_scripts_local', JSON.stringify(scripts));
  }
};

