-- ============================================================
-- SCHEMA - CONTROLE DE APOSTAS (com login por usuário)
-- Execute no SQL Editor do Supabase. Pode rodar mais de uma vez.
-- ============================================================

-- CASAS
create table if not exists casas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null,
  saldo numeric(12,2) not null default 0,
  saldo_inicial numeric(12,2) not null default 0,
  criado_em timestamptz not null default now(),
  unique (user_id, nome)
);

-- GRUPOS / MEIOS
create table if not exists grupos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null,
  criado_em timestamptz not null default now(),
  unique (user_id, nome)
);

-- APOSTAS
create table if not exists apostas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  casa_id uuid not null references casas(id) on delete cascade,
  grupo_id uuid references grupos(id) on delete set null,
  valor numeric(12,2) not null,
  odd numeric(10,2),
  retorno_potencial numeric(12,2),
  resultado text not null default 'pendente'
    check (resultado in ('ganhou','perdeu','devolvida','pendente')),
  lucro numeric(12,2) not null default 0,
  descricao text,
  data_aposta date not null default current_date,
  criado_em timestamptz not null default now()
);

create index if not exists idx_apostas_user on apostas(user_id);
create index if not exists idx_apostas_casa on apostas(casa_id);
create index if not exists idx_apostas_data on apostas(data_aposta);

-- COLUNAS NOVAS (se a tabela já existia)
alter table casas   add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table casas   add column if not exists saldo_inicial numeric(12,2) not null default 0;
alter table grupos  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table apostas add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- SEGURANCA POR USUARIO (RLS)
alter table casas   enable row level security;
alter table grupos  enable row level security;
alter table apostas enable row level security;

drop policy if exists "casas_proprias"   on casas;
drop policy if exists "grupos_proprios"  on grupos;
drop policy if exists "apostas_proprias" on apostas;

create policy "casas_proprias"   on casas   for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "grupos_proprios"  on grupos  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "apostas_proprias" on apostas for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
