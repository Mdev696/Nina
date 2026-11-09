-- Rode no SQL Editor do Supabase
create table if not exists compromissos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  titulo text not null,
  obs text,
  data_hora timestamptz not null,
  email text,
  telefone text,                       -- só números, com DDI+DDD (ex: 5511999999999)
  canal_email boolean not null default true,
  canal_whatsapp boolean not null default true,
  lembrete_enviado boolean not null default false,
  ultimo_erro text,
  criado_em timestamptz not null default now()
);

create index if not exists idx_compromissos_pendentes
  on compromissos (data_hora) where lembrete_enviado = false;

alter table compromissos enable row level security;

create policy "dono le"      on compromissos for select using (auth.uid() = user_id);
create policy "dono insere"  on compromissos for insert with check (auth.uid() = user_id);
create policy "dono altera"  on compromissos for update using (auth.uid() = user_id);
create policy "dono exclui"  on compromissos for delete using (auth.uid() = user_id);
-- O backend usa a service role key, que ignora RLS.
