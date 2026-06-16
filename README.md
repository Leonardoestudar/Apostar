# Banca — Controle de Apostas (com login)

App pessoal de controle de apostas. Login por e-mail/senha, banco no Supabase, deploy no Vercel.

## Recursos
- Login e cadastro (cada usuário vê só os próprios dados).
- Cadastro de aposta com cálculo automático do ganho estimado (valor × odd).
- Botão de resultado rápido na lista: Green / Red / Devolvida em 1 clique, sem abrir edição.
- Saldo da casa sobe/desce sozinho conforme Green/Red; ajuste manual para depósitos e saques.
- Painel com filtros de data (hoje, 7 dias, mês, tudo ou intervalo personalizado).
- Indicadores: resultado do período, total apostado, ganho estimado em aberto, saldo nas casas, taxa de acerto, ROI, nº de apostas e pendentes.
- Resultado por casa e por grupo/meio.

## Como o resultado vira lucro
- Green: lucro = ganho estimado − valor apostado
- Red: lucro = − valor apostado
- Devolvida / Pendente: 0

---

## Passo 1 — Supabase
1. Crie um projeto em https://supabase.com
2. **SQL Editor → New query** → cole `supabase_schema.sql` → **Run**.
3. **Authentication → Providers → Email**: deixe habilitado. Para entrar sem confirmar e-mail, desligue "Confirm email" (Authentication → Sign In / Providers).
4. **Project Settings → API**, copie:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** key → `SUPABASE_ANON_KEY`  (NÃO use a service_role aqui)

> A anon key pode ficar no navegador: a Row Level Security (criada pelo schema) garante que cada pessoa só acessa os próprios dados.

## Passo 2 — Vercel
1. Suba o conteúdo desta pasta para um repositório no GitHub (os arquivos na **raiz**, não dentro de uma subpasta).
2. https://vercel.com → **Add New → Project** → importe o repositório.
3. **Environment Variables** — adicione (Chave = nome, Valor = conteúdo):
   - `SUPABASE_URL` = sua Project URL
   - `SUPABASE_ANON_KEY` = sua anon public key
4. Framework Preset: **Other**. **Deploy**.

## Estrutura
```
supabase_schema.sql  → tabelas + RLS
api/config.js        → entrega URL e anon key ao navegador
public/index.html    → tela de login + app
public/styles.css    → estilos
public/app.js        → lógica (auth, cálculo, filtros, saldo)
vercel.json          → roteamento de /config.js
```

## Responsabilidade
Ferramenta de controle pessoal. Aposte só o que pode perder. Se sentir que está perdendo o controle, o Jogadores Anônimos (https://jogadoresanonimos.org.br) oferece apoio gratuito no Brasil.
