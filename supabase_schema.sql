
/* 
  COMANDO SQL PARA O SUPABASE (SQL Editor)
  Crie a tabela 'scripts' para armazenar os roteiros vinculados aos usuários.
*/

-- Criar a tabela de scripts
CREATE TABLE scripts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  title TEXT NOT NULL,
  content TEXT,
  last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  tags TEXT[],
  color TEXT,
  duration INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE scripts ENABLE ROW LEVEL SECURITY;

-- Política: Usuários podem ver apenas seus próprios scripts
CREATE POLICY "Users can view their own scripts" 
ON scripts FOR SELECT 
USING (auth.uid() = user_id);

-- Política: Usuários podem inserir seus próprios scripts
CREATE POLICY "Users can insert their own scripts" 
ON scripts FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Política: Usuários podem atualizar seus próprios scripts
CREATE POLICY "Users can update their own scripts" 
ON scripts FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Política: Usuários podem deletar seus próprios scripts
CREATE POLICY "Users can delete their own scripts" 
ON scripts FOR DELETE 
USING (auth.uid() = user_id);

-- Índice para performance por usuário
CREATE INDEX idx_scripts_user_id ON scripts(user_id);
