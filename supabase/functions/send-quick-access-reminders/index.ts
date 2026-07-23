import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.6";
import webpush from "npm:web-push@3.6.7";

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  language: "es" | "ca";
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });

const readServiceRoleKey = () => {
  const legacyKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacyKey) return legacyKey;

  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    return Object.values(keys).find((value): value is string => typeof value === "string") ?? "";
  } catch {
    return "";
  }
};

const reminderPayload = (language: "es" | "ca") => ({
  title: "Spirit Coffee",
  body: language === "ca"
    ? "Pots accedir als nostres accessos ràpids des de l’app Spirit Coffee."
    : "Puedes acceder a nuestros accesos rápidos desde la app Spirit Coffee.",
  tag: "spirit-quick-access-reminder",
  url: "/#quick-access",
  icon: "/assets/icons/spirit-192.png",
  badge: "/assets/icons/favicon-64.png",
});

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  const vapidSubject = Deno.env.get("VAPID_SUBJECT")
    ?? "https://cafeteria-spirit.vercel.app";

  if (request.method === "GET") {
    if (!vapidPublicKey) {
      return json({ error: "Push configuration unavailable" }, 503, corsHeaders);
    }
    return json({ publicKey: vapidPublicKey }, 200, corsHeaders);
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = readServiceRoleKey();
  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
    return json({ error: "Server configuration unavailable" }, 503);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const suppliedSecret = request.headers.get("x-cron-secret") ?? "";
  const { data: authenticated, error: authenticationError } = await supabase
    .rpc("verify_push_cron_secret", { p_secret: suppliedSecret });

  if (authenticationError || authenticated !== true) {
    return json({ error: "Unauthorized" }, 401);
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const { data, error: claimError } = await supabase
    .rpc("claim_due_push_subscriptions", { p_limit: 250 });

  if (claimError) {
    console.error("Unable to claim due push subscriptions", claimError);
    return json({ error: "Unable to claim reminders" }, 500);
  }

  const subscriptions = (data ?? []) as PushSubscriptionRow[];
  let sent = 0;
  let removed = 0;
  let failed = 0;

  for (let offset = 0; offset < subscriptions.length; offset += 20) {
    const batch = subscriptions.slice(offset, offset + 20);
    await Promise.all(batch.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth_key,
            },
          },
          JSON.stringify(reminderPayload(subscription.language)),
          { TTL: 86400, urgency: "normal" },
        );

        const { error } = await supabase
          .from("push_subscriptions")
          .update({
            last_notified_at: new Date().toISOString(),
            delivery_claimed_at: null,
          })
          .eq("id", subscription.id);
        if (error) throw error;
        sent += 1;
      } catch (error) {
        const statusCode = Number(
          (error as { statusCode?: number; status?: number })?.statusCode
            ?? (error as { status?: number })?.status
            ?? 0,
        );

        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", subscription.id);
          removed += 1;
          return;
        }

        await supabase
          .from("push_subscriptions")
          .update({ delivery_claimed_at: null })
          .eq("id", subscription.id);
        console.error("Push delivery failed", { subscriptionId: subscription.id, statusCode });
        failed += 1;
      }
    }));
  }

  return json({ claimed: subscriptions.length, sent, removed, failed });
});
