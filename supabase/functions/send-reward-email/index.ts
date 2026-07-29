import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.6";
import { renderRewardEmail, sendWithResend } from "./email.js";

type RewardNotification = {
  id: string;
  customer_id: string;
  customer_card_id: string;
  reward_sequence: number;
  reward_description: string;
  claim_attempt: number;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

const readServiceRoleKey = () => {
  const legacyKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacyKey) return legacyKey;

  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    return Object.values(keys).find((value): value is string =>
      typeof value === "string"
    ) ?? "";
  } catch {
    return "";
  }
};

const safeError = (error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown delivery error";
  return message.replace(/[\u0000-\u001f\u007f]/gu, " ").slice(0, 500);
};

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = readServiceRoleKey();
  const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const resendFrom = Deno.env.get("RESEND_FROM_EMAIL") ?? "";
  const appUrl = Deno.env.get("SPIRIT_APP_URL") ?? "https://www.spiritcoffee.es/";

  if (!supabaseUrl || !serviceRoleKey || !resendApiKey || !resendFrom) {
    return json({ error: "Server configuration unavailable" }, 503);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const suppliedSecret = request.headers.get("x-reward-email-secret") ?? "";
  const { data: authenticated, error: authenticationError } = await supabase
    .rpc("verify_reward_email_worker_secret", { p_secret: suppliedSecret });

  if (authenticationError || authenticated !== true) {
    return json({ error: "Unauthorized" }, 401);
  }

  let requestedNotificationId: string | null = null;
  try {
    const body = await request.json();
    requestedNotificationId = typeof body?.notification_id === "string"
      ? body.notification_id
      : null;
  } catch {
    // Cron intentionally sends an empty object and lets the worker claim a batch.
  }

  const batchLimit = requestedNotificationId ? 1 : 20;
  let sent = 0;
  let failed = 0;
  let claimed = 0;

  for (let index = 0; index < batchLimit; index += 1) {
    const { data, error: claimError } = await supabase
      .rpc("claim_reward_email_notification", {
        p_notification_id: requestedNotificationId,
        p_max_attempts: 5,
      });

    if (claimError) {
      console.error("Unable to claim reward email", claimError);
      return json({ error: "Unable to claim reward emails" }, 500);
    }

    const notification = (data?.[0] ?? null) as RewardNotification | null;
    if (!notification) break;
    claimed += 1;

    try {
      const [{ data: authResult, error: authError }, { data: profile, error: profileError }] =
        await Promise.all([
          supabase.auth.admin.getUserById(notification.customer_id),
          supabase
            .from("profiles")
            .select("display_name")
            .eq("id", notification.customer_id)
            .maybeSingle(),
        ]);

      if (authError) throw authError;
      if (profileError) throw profileError;

      const email = authResult.user?.email;
      if (!email) throw new Error("Customer email is unavailable");

      const html = renderRewardEmail({
        displayName: profile?.display_name ?? "",
        rewardDescription: notification.reward_description,
        appUrl,
      });

      const providerMessageId = await sendWithResend({
        apiKey: resendApiKey,
        from: resendFrom,
        to: email,
        subject: "¡Has conseguido un café gratis en Spirit! ☕",
        html,
        idempotencyKey: `spirit-reward-${notification.id}`,
      });

      const { data: completed, error: completionError } = await supabase.rpc(
        "complete_reward_email_notification",
        {
          p_notification_id: notification.id,
          p_claim_attempt: notification.claim_attempt,
          p_provider_message_id: providerMessageId,
        },
      );

      if (completionError || completed !== true) {
        throw completionError ?? new Error("The email claim is no longer current");
      }
      sent += 1;
    } catch (error) {
      const errorSummary = safeError(error);
      console.error("Reward email delivery failed", {
        notificationId: notification.id,
        attempt: notification.claim_attempt,
        error: errorSummary,
      });

      const { error: failureError } = await supabase.rpc(
        "fail_reward_email_notification",
        {
          p_notification_id: notification.id,
          p_claim_attempt: notification.claim_attempt,
          p_error: errorSummary,
        },
      );
      if (failureError) {
        console.error("Unable to release failed reward email", failureError);
      }
      failed += 1;
    }

    if (requestedNotificationId) break;
  }

  return json({ claimed, sent, failed });
});
