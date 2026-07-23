-- Operational setup run once per Supabase project after deploying the Edge Function.
-- Replace PROJECT_URL with the API URL returned by `supabase projects list`.
-- The recurring job runs hourly and only claims subscriptions whose last successful
-- notification is at least two days old.

select cron.unschedule(jobid)
from cron.job
where jobname = 'spirit-quick-access-reminders';

select cron.schedule(
  'spirit-quick-access-reminders',
  '17 * * * *',
  $schedule$
    select net.http_post(
      url := 'PROJECT_URL/functions/v1/send-quick-access-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'spirit_push_cron_secret'
        )
      ),
      body := '{"source":"supabase-cron"}'::jsonb,
      timeout_milliseconds := 15000
    );
  $schedule$
);
