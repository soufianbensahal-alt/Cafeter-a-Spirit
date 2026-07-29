-- Operational setup: run once only after the migration has been applied,
-- RESEND_API_KEY / RESEND_FROM_EMAIL have been configured, and the
-- send-reward-email Edge Function has been deployed.
--
-- The secret is read from Vault at execution time and is never stored here.

select cron.unschedule(jobid)
from cron.job
where jobname = 'spirit-reward-email-worker';

select cron.schedule(
  'spirit-reward-email-worker',
  '* * * * *',
  $schedule$
    select net.http_post(
      url := 'https://iabuhjhyvsqhtiqowarq.supabase.co/functions/v1/send-reward-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-reward-email-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'spirit_reward_email_worker_secret'
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 15000
    );
  $schedule$
);
