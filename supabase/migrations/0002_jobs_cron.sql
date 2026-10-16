-- 주기 작업 예약: pg_cron → pg_net → Edge Function `jobs` (x-job-secret 헤더로 인증)
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- 호출 비밀값은 Vault에서 생성 (파일에 값이 남지 않음)
select vault.create_secret('https://vqqolzpodmaibnjazxus.supabase.co', 'project_url')
where not exists (select 1 from vault.secrets where name = 'project_url');
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'job_secret')
where not exists (select 1 from vault.secrets where name = 'job_secret');

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create function private.run_job(job text) returns bigint
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/jobs?job=' || job,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-job-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'job_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  )
$$;

select cron.schedule('bapmutna-ingest', '* * * * *', $$ select private.run_job('ingest') $$);
select cron.schedule('bapmutna-judge', '*/5 * * * *', $$ select private.run_job('judge') $$);
select cron.schedule('bapmutna-alerts', '2-59/10 * * * *', $$ select private.run_job('alerts') $$);
select cron.schedule('bapmutna-daily', '0 15 * * *', $$ select private.run_job('daily') $$); -- 00:00 KST
