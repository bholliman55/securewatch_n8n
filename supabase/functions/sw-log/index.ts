/**
 * Supabase Edge Function: sw-log
 *
 * POST /functions/v1/sw-log
 *
 * Validates and inserts a structured event into sw_event_log.
 * Returns { ok: true, id: "<uuid>" } on success.
 *
 * Required fields:
 *   trace_id   – UUID (correlation ID generated at request entry)
 *   source     – string ("bolt" | "n8n" | "edge_function" | "python" | ...)
 *   event_type – string ("workflow.start" | "tool.call" | "tool.result" |
 *                        "workflow.complete" | "workflow.error" | ...)
 *
 * Optional fields:
 *   scan_id     – string
 *   client_id   – string
 *   event_name  – string (human-readable label)
 *   status      – "info" | "ok" | "error"  (default: "info")
 *   req         – object (request payload snapshot)
 *   res         – object (response payload snapshot)
 *   err         – object { message, code, stack }
 *   meta        – object (arbitrary, e.g. { fixture_mode: true })
 *   duration_ms – integer
 *
 * Auth:
 *   Callers must supply the Supabase service-role key as:
 *     Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
 *   OR the function can be invoked without auth if deployed with
 *   --no-verify-jwt (not recommended for production).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const REQUIRED_FIELDS = ["trace_id", "source", "event_type"] as const;
const VALID_STATUSES = ["info", "ok", "error"] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type EventStatus = (typeof VALID_STATUSES)[number];

interface EventPayload {
  trace_id: string;
  source: string;
  event_type: string;
  scan_id?: string;
  client_id?: string;
  event_name?: string;
  status?: EventStatus;
  req?: Record<string, unknown>;
  res?: Record<string, unknown>;
  err?: { message?: string; code?: string | number; stack?: string; [k: string]: unknown };
  meta?: Record<string, unknown>;
  duration_ms?: number;
}

function jsonError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  // ── CORS preflight ────────────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
      },
    });
  }

  if (req.method !== "POST") {
    return jsonError("Method not allowed. Use POST.", 405);
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: EventPayload;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body.");
  }

  // ── Validate required fields ──────────────────────────────────────────────
  for (const field of REQUIRED_FIELDS) {
    if (!body[field] || typeof body[field] !== "string" || !body[field].trim()) {
      return jsonError(`Missing or invalid required field: ${field}`);
    }
  }

  // Validate trace_id is a valid UUID
  if (!UUID_RE.test(body.trace_id)) {
    return jsonError("trace_id must be a valid UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).");
  }

  // Validate status if provided
  const status: EventStatus =
    body.status && (VALID_STATUSES as readonly string[]).includes(body.status)
      ? body.status
      : "info";

  // ── Build insert row ───────────────────────────────────────────────────────
  const row = {
    trace_id:    body.trace_id.toLowerCase(),
    source:      body.source.trim(),
    event_type:  body.event_type.trim(),
    scan_id:     body.scan_id   ?? null,
    client_id:   body.client_id ?? null,
    event_name:  body.event_name ?? null,
    status,
    req:         body.req         ?? null,
    res:         body.res         ?? null,
    err:         body.err         ?? null,
    meta:        body.meta        ?? null,
    duration_ms: typeof body.duration_ms === "number" ? Math.round(body.duration_ms) : null,
  };

  // ── Supabase client (service role) ────────────────────────────────────────
  const supabaseUrl  = Deno.env.get("SUPABASE_URL");
  const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceKey) {
    console.error("[sw-log] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set.");
    return jsonError("Server configuration error.", 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // ── Insert ─────────────────────────────────────────────────────────────────
  const { data, error } = await supabase
    .from("sw_event_log")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    console.error("[sw-log] Insert error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message, code: error.code }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ ok: true, id: data.id }),
    {
      status: 201,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
});
