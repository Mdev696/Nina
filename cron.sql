-- Rode no SQL Editor do Supabase (depois de publicar a função)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Troque SEU-PROJETO e SEU_CRON_SECRET (o mesmo valor do secret CRON_SECRET)
select cron.schedule(
  'enviar-lembretes',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://SEU-PROJETO.supabase.co/functions/v1/enviar-lembretes',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-secret', 'SEU_CRON_SECRET'),
    body    := '{}'::jsonb
  );
  $$
);

-- Para pausar:  select cron.unschedule('enviar-lembretes');
