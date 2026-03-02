/**
 * Supabase Edge Function: scan-orchestrator
 *
 * POST /functions/v1/scan-orchestrator
 *
 * Routes scan requests to the appropriate n8n agent webhooks and returns
 * aggregated results. Supports all scan types and parallel agent execution.
 *
 * Required fields:
 *   scan_type  – "security_scan" | "vuln_assessment" | "compliance" | "full"
 *   client_id  – string (tenant identifier)
 *
 * Optional fields:
 *   scan_id      – string (auto-generated if absent)
 *   trace_id     – UUID  (auto-generated if absent; propagated to agents)
 *   fixture_mode – boolean (true = skip real API calls in agents)
 *   priority     – "normal" | "high" | "critical"
 *   targets      – array  (Agent 1: [{hostname?, ip_address?}])
 *   airtable_base_id – string (Agent 2: Airtable base ID)
 *   asset_filter – string (Agent 2: "all" | filter expression)
 *   framework    – string (Agent 3: "HIPAA" | "GDPR" | "SOC2" | "ISO27001" | "PCI-DSS")
 *   policy_files – array  (Agent 3: [{filename, mimetype, data: base64}])
 *
 * Environment variables required on the Supabase project:
 *   N8N_WEBHOOK_BASE_URL  – https://your-n8n-instance.n8n.cloud
 *   N8N_WEBHOOK_SECRET    – value for the X-API-Key header on each agent webhook
 *
 * Auth:
 *   Callers must supply the Supabase service-role key as:
 *     Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
 *   OR deploy with --no-verify-jwt for public access (not recommended for production).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SCAN_TYPES = [
  "security_scan",
  "vuln_assessment",
  "compliance",
  "full",
] as const;
type ScanType = (typeof SCAN_TYPES)[number];

/** Maps a concrete scan type to its n8n webhook path. */
const AGENT_PATHS: Record<string, string> = {
  security_scan: "/webhook/security-scanner-start",
  vuln_assessment: "/webhook/vuln-assessment-start",
  compliance: "/webhook/compliance-check",
};

interface PolicyFile {
  filename: string;
  mimetype: string;
  data: string;
}

interface ScanTarget {
  hostname?: string;
  ip_address?: string;
  target_type?: string;
}

interface ScanRequest {
  scan_type: ScanType;
  client_id: string;
  scan_id?: string;
  trace_id?: string;
  fixture_mode?: boolean;
  priority?: "normal" | "high" | "critical";
  // Agent 1 (security_scan)
  targets?: ScanTarget[];
  scan_type_detail?: string;
  // Agent 2 (vuln_assessment)
  airtable_base_id?: string;
  asset_filter?: string;
  // Agent 3 (compliance)
  framework?: string;
  policy_files?: PolicyFile[];
}

interface AgentResult {
  ok: boolean;
  status: number;
  latency_ms: number;
  data: unknown;
  error?: string;
}

type OrchestratorResults = Record<string, AgentResult>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function jsonError(message: string, status = 400): Response {
  return jsonResponse({ ok: false, error: message }, status);
}

/**
 * Calls a single n8n agent webhook and returns a structured result.
 * Never throws — errors are captured and returned as AgentResult.
 */
async function callAgentWebhook(
  baseUrl: string,
  path: string,
  payload: Record<string, unknown>,
  secret: string
): Promise<AgentResult> {
  const url = `${baseUrl}${path}`;
  const t0 = Date.now();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": secret,
      },
      body: JSON.stringify(payload),
    });

    const latency_ms = Date.now() - t0;

    let data: unknown;
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        data = await res.json();
      } catch {
        data = { raw: await res.text() };
      }
    } else {
      data = { raw: await res.text() };
    }

    return { ok: res.ok, status: res.status, latency_ms, data };
  } catch (err) {
    const latency_ms = Date.now() - t0;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[scan-orchestrator] Webhook call to ${url} failed:`, message);
    return { ok: false, status: 0, latency_ms, data: null, error: message };
  }
}

/**
 * Determines which agent scan types to invoke for a given scan_type.
 */
function resolveAgentTypes(scanType: ScanType): string[] {
  if (scanType === "full") {
    return ["security_scan", "vuln_assessment", "compliance"];
  }
  return [scanType];
}

/**
 * Builds the per-agent payload from the common orchestrator request.
 */
function buildAgentPayload(
  agentType: string,
  req: ScanRequest,
  scanId: string,
  traceId: string
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    client_id: req.client_id,
    scan_id: scanId,
    trace_id: traceId,
    fixture_mode: req.fixture_mode === true,
    priority: req.priority ?? "normal",
  };

  switch (agentType) {
    case "security_scan":
      if (req.targets?.length) base.targets = req.targets;
      if (req.scan_type_detail) base.scan_type = req.scan_type_detail;
      break;

    case "vuln_assessment":
      if (req.airtable_base_id) base.airtable_base_id = req.airtable_base_id;
      if (req.asset_filter) base.asset_filter = req.asset_filter;
      break;

    case "compliance":
      if (req.framework) base.framework = req.framework;
      if (req.policy_files?.length) base.policy_files = req.policy_files;
      break;
  }

  return base;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "authorization, content-type, x-client-info, apikey",
      },
    });
  }

  if (req.method !== "POST") {
    return jsonError("Method not allowed. Use POST.", 405);
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: ScanRequest;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body.");
  }

  // ── Validate required fields ──────────────────────────────────────────────
  if (!body.client_id || typeof body.client_id !== "string" || !body.client_id.trim()) {
    return jsonError("Missing or invalid required field: client_id");
  }

  if (!body.scan_type || !(SCAN_TYPES as readonly string[]).includes(body.scan_type)) {
    return jsonError(
      `Invalid or missing scan_type. Allowed values: ${SCAN_TYPES.join(", ")}`
    );
  }

  // Agent 3 requires framework for compliance scans
  if (
    (body.scan_type === "compliance" || body.scan_type === "full") &&
    !body.framework &&
    !body.fixture_mode
  ) {
    console.warn(
      "[scan-orchestrator] compliance scan requested without 'framework'. Proceeding without it."
    );
  }

  // ── Read environment configuration ───────────────────────────────────────
  const n8nBaseUrl = Deno.env.get("N8N_WEBHOOK_BASE_URL");
  const webhookSecret = Deno.env.get("N8N_WEBHOOK_SECRET") ?? "";

  if (!n8nBaseUrl) {
    console.error("[scan-orchestrator] N8N_WEBHOOK_BASE_URL is not set.");
    return jsonError("Orchestrator is not configured (missing N8N_WEBHOOK_BASE_URL).", 500);
  }

  // ── Generate correlation IDs ──────────────────────────────────────────────
  const traceId =
    body.trace_id && UUID_RE.test(body.trace_id)
      ? body.trace_id.toLowerCase()
      : crypto.randomUUID();

  const scanId =
    body.scan_id?.trim() ||
    `SCAN-${body.client_id.toUpperCase()}-${Date.now()}`;

  // ── Determine which agents to call ───────────────────────────────────────
  const agentTypes = resolveAgentTypes(body.scan_type);

  console.log(
    `[scan-orchestrator] scan_id=${scanId} trace_id=${traceId} agents=${agentTypes.join(",")}`
  );

  // ── Fan-out: call all agents in parallel ─────────────────────────────────
  const results: OrchestratorResults = {};

  await Promise.all(
    agentTypes.map(async (agentType) => {
      const path = AGENT_PATHS[agentType];
      const payload = buildAgentPayload(agentType, body, scanId, traceId);

      console.log(
        `[scan-orchestrator] → ${agentType} POST ${n8nBaseUrl}${path}`
      );

      const result = await callAgentWebhook(
        n8nBaseUrl,
        path,
        payload,
        webhookSecret
      );

      results[agentType] = result;

      if (!result.ok) {
        console.error(
          `[scan-orchestrator] ✗ ${agentType} failed: status=${result.status} error=${result.error ?? JSON.stringify(result.data).slice(0, 200)}`
        );
      } else {
        console.log(
          `[scan-orchestrator] ✓ ${agentType} succeeded: status=${result.status} latency=${result.latency_ms}ms`
        );
      }
    })
  );

  // ── Aggregate response ────────────────────────────────────────────────────
  const failedAgents = agentTypes.filter((t) => !results[t].ok);
  const succeededAgents = agentTypes.filter((t) => results[t].ok);
  const allOk = failedAgents.length === 0;

  // HTTP 200 if all succeeded, 207 Multi-Status if partial, 502 if all failed
  let httpStatus = 200;
  if (!allOk) {
    httpStatus = failedAgents.length === agentTypes.length ? 502 : 207;
  }

  return jsonResponse(
    {
      ok: allOk,
      scan_id: scanId,
      trace_id: traceId,
      client_id: body.client_id,
      scan_type: body.scan_type,
      fixture_mode: body.fixture_mode === true,
      agents_called: agentTypes,
      agents_succeeded: succeededAgents,
      agents_failed: failedAgents,
      results,
      orchestrated_at: new Date().toISOString(),
    },
    httpStatus
  );
});
