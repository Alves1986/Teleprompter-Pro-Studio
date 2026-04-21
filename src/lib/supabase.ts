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
    if (!isConfigured) return [];
    
    const { data, error } = await supabase
      .from('scripts')
      .select('*')
      .order('last_modified', { ascending: false });
    
    if (error) throw error;
    return data.map(item => ({
      id: item.id,
      title: item.title,
      content: item.content,
      lastModified: new Date(item.last_modified).getTime(),
      tags: item.tags,
      color: item.color,
      duration: item.duration,
      lastSynced: Date.now()
    }));
  },

  async upsert(script: any) {
    if (!isConfigured) throw new Error('Supabase não configurado');

    const payload: any = {
      title: script.title,
      content: script.content,
      last_modified: new Date(script.lastModified).toISOString(),
      tags: script.tags,
      color: script.color,
      duration: script.duration
    };

    // Só envia o ID se for um UUID válido (existente no banco)
    if (script.id && script.id.length > 20) {
      payload.id = script.id;
    }

    const { data, error } = await supabase
      .from('scripts')
      .upsert(payload)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async delete(id: string) {
    if (!isConfigured) throw new Error('Supabase não configurado');

    const { error } = await supabase
      .from('scripts')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
  }
};
