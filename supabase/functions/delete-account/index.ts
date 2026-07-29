import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

const readServiceRoleKey = () => {
  const legacyKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacyKey) return legacyKey;

  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    return Object.values(keys).find(
      (value): value is string => typeof value === "string",
    ) ?? "";
  } catch {
    return "";
  }
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const requestId = crypto.randomUUID();
  const authorization = request.headers.get("Authorization") ?? "";
  const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!accessToken) {
    return json({ error: "not_authenticated" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = readServiceRoleKey();
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Account deletion unavailable", {
      requestId,
      code: "server_configuration_unavailable",
    });
    return json({ error: "server_unavailable" }, 503);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data: authentication, error: authenticationError } =
    await authClient.auth.getUser(accessToken);
  if (authenticationError || !authentication.user) {
    return json({ error: "not_authenticated" }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const { error: deletionError } = await adminClient.auth.admin.deleteUser(
    authentication.user.id,
  );
  if (deletionError) {
    console.error("Account deletion failed", {
      requestId,
      code: deletionError.code ?? "auth_admin_delete_failed",
      status: deletionError.status ?? 500,
    });
    return json({ error: "account_deletion_failed" }, 500);
  }

  return json({ success: true });
});
