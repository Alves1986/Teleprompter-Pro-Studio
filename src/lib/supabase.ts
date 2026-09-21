import { createClient } from '@supabase/supabase-js';
import { SavedScript } from '../types';

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
  async getAll(): Promise<SavedScript[]> {
    const saved = localStorage.getItem('tp_scripts_local');
    if (!saved) return [];

    try {
      const parsed: any[] = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];

      // Auto-deduplicate scripts that have identical title and content (caused by previous auto-save bugs)
      const seenKeys = new Set<string>();
      const seenIds = new Set<string>();
      const deduped: SavedScript[] = [];

      // Sort by lastModified desc so we keep the newest version of any duplicate
      const sorted = [...parsed].sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));

      for (const s of sorted) {
        if (!s || typeof s !== 'object') continue;
        const contentKey = `${(s.title || '').trim()}:::${(s.content || '').trim()}`;
        const idKey = s.id ? String(s.id) : null;

        if (idKey && seenIds.has(idKey)) continue;
        if (contentKey !== ':::' && seenKeys.has(contentKey)) continue;

        if (idKey) seenIds.add(idKey);
        if (contentKey !== ':::') seenKeys.add(contentKey);
        deduped.push({
          id: String(s.id || 'script-' + Date.now()),
          title: s.title || 'Sem Título',
          content: s.content || '',
          lastModified: s.lastModified || Date.now()
        });
      }

      // If duplicates were pruned, update localStorage immediately
      if (deduped.length !== parsed.length) {
        localStorage.setItem('tp_scripts_local', JSON.stringify(deduped));
      }

      return deduped;
    } catch (err) {
      console.error('Erro ao ler scripts do localStorage:', err);
      return [];
    }
  },

  async upsert(script: any): Promise<SavedScript> {
    const currentScriptsString = localStorage.getItem('tp_scripts_local');
    let scripts: any[] = [];
    if (currentScriptsString) {
      try {
        scripts = JSON.parse(currentScriptsString);
        if (!Array.isArray(scripts)) scripts = [];
      } catch {
        scripts = [];
      }
    }
    
    // Resolve stable ID: never use 'temp' as a persistent ID
    let targetId: string = script.id && script.id !== 'temp' ? String(script.id) : '';

    if (!targetId) {
      // Check if a script with the exact same title & content already exists in library
      const match = scripts.find(s => 
        (s.title || '').trim() === (script.title || '').trim() &&
        (s.content || '').trim() === (script.content || '').trim()
      );

      if (match && match.id) {
        targetId = String(match.id);
      } else {
        targetId = 'script-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
      }
    }

    const newScriptObj: SavedScript = {
      id: targetId,
      title: script.title || 'Sem Título',
      content: script.content || '',
      lastModified: Date.now()
    };

    const index = scripts.findIndex(s => s.id === targetId);
    if (index >= 0) {
      scripts[index] = newScriptObj;
    } else {
      // Also check if another record with identical content exists and overwrite it instead of duplicating
      const duplicateIndex = scripts.findIndex(s => 
        (s.title || '').trim() === (newScriptObj.title || '').trim() &&
        (s.content || '').trim() === (newScriptObj.content || '').trim()
      );

      if (duplicateIndex >= 0) {
        scripts[duplicateIndex] = newScriptObj;
      } else {
        scripts.unshift(newScriptObj);
      }
    }

    // Ensure no duplicate identical entries exist in storage
    const seen = new Set<string>();
    const cleaned: any[] = [];
    for (const s of scripts) {
      const key = `${s.id}:::${(s.title || '').trim()}:::${(s.content || '').trim()}`;
      if (!seen.has(key)) {
        seen.add(key);
        cleaned.push(s);
      }
    }

    localStorage.setItem('tp_scripts_local', JSON.stringify(cleaned));
    return newScriptObj;
  },

  async delete(id: string) {
    const currentScriptsString = localStorage.getItem('tp_scripts_local');
    let scripts: any[] = [];
    if (currentScriptsString) {
      try {
        scripts = JSON.parse(currentScriptsString);
        if (!Array.isArray(scripts)) scripts = [];
      } catch {
        scripts = [];
      }
    }
    
    const targetIdStr = String(id);
    scripts = scripts.filter(s => s && String(s.id) !== targetIdStr);
    localStorage.setItem('tp_scripts_local', JSON.stringify(scripts));
  },

  async purgeDuplicates() {
    return this.getAll();
  }
};

