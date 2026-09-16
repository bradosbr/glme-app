-- Busca de importadores sem diferenciar acentos, como fazia o MySQL (utf8mb4_unicode_ci).
-- No Supabase, extensões ficam no schema "extensions"; a consulta usa extensions.unaccent().
CREATE SCHEMA IF NOT EXISTS extensions;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;--> statement-breakpoint

-- Supabase expõe o schema "public" pela Data API (chave anônima). Sem RLS, qualquer um com a
-- chave pública leria/escreveria estas tabelas — inclusive users.passwordHash.
-- RLS ligado e SEM políticas: a Data API não acessa nada; o app conecta como dono das
-- tabelas (role postgres), que não é afetado pelo RLS.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "importadores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recintos" ENABLE ROW LEVEL SECURITY;
