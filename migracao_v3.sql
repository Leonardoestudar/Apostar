-- ============================================================
-- MIGRACAO v3 - caixa Banco, limite diario, transferencias
-- Rode no SQL Editor do Supabase (pode rodar mais de uma vez)
-- ============================================================

-- Config do usuario: caixa "Banco" e limite de perda diario
create table if not exists config (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  banco numeric(12,2) not null default 0,        -- carteira fora das casas
  limite_perda_dia numeric(12,2) not null default 0,  -- 0 = sem limite
  atualizado_em timestamptz not null default now()
);

alter table config enable row level security;
drop policy if exists "config_propria" on config;
create policy "config_propria" on config for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Historico de transferencias (opcional, para registro)
create table if not exists transferencias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  origem text not null,        -- nome da casa OU 'Banco'
  destino text not null,
  valor numeric(12,2) not null,
  data_transf date not null default current_date,
  criado_em timestamptz not null default now()
);
alter table transferencias enable row level security;
drop policy if exists "transf_proprias" on transferencias;
create policy "transf_proprias" on transferencias for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
