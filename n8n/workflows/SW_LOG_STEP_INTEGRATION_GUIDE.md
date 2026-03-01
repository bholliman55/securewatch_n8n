# SW_LOG_STEP Integration Guide

This document describes how to integrate the `SW_LOG_STEP` sub-workflow into any
SecureWatch n8n agent workflow, and how to add `trace_id` propagation end-to-end.

---

## 1. Import the Sub-Workflow

1. In n8n Cloud → **Workflows** → **Import from file** → select
   `n8n/workflows/SW_LOG_STEP.json`.
2. **Activate** the workflow (it won't run on its own — it only runs when called).
3. Note its Workflow ID (shown in the URL: `/workflow/<id>`).

---

## 2. Required n8n Environment Variables

In n8n Cloud → **Settings** → **Environment Variables**, add:

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Your Supabase project URL, e.g. `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key (not the anon key) |
| `ALERT_WINDOW_MINUTES` | How far back the alert cron looks (default `15`) |
| `ALERT_EMAIL_TO` | Alert recipient email |

---

## 3. Generate `trace_id` at Webhook Entry

Add a **Code** node immediately after each agent's Webhook Trigger node:

```javascript
// "Generate trace_id" Code node
// Attach this directly after Webhook Trigger

const { randomUUID } = require('crypto');  // available in n8n Node.js runtime

const body = $input.first().json.body || $input.first().json;

// Generate trace_id (or accept one from caller for replay scenarios)
const trace_id = body.trace_id || randomUUID();

return [{
  json: {
    ...body,
    trace_id,
    scan_id:   body.scan_id   || null,
    client_id: body.client_id || null,
    fixture_mode: body.fixture_mode === true,
    _started_at: Date.now(),
  }
}];
```

---

## 4. Call SW_LOG_STEP Throughout the Workflow

Insert an **Execute Workflow** node at each lifecycle stage.
Set **Workflow** to the imported `SW_LOG_STEP` workflow ID.
Set **Source** to `Parameter` and provide the JSON input below.

### 4a. workflow.start (after Generate trace_id node)

```json
{
  "trace_id":   "={{ $('Generate trace_id').first().json.trace_id }}",
  "source":     "n8n:agent-1",
  "event_type": "workflow.start",
  "event_name": "Security Scanner started",
  "scan_id":    "={{ $('Generate trace_id').first().json.scan_id }}",
  "client_id":  "={{ $('Generate trace_id').first().json.client_id }}",
  "status":     "info",
  "req": {
    "client_id":  "={{ $('Generate trace_id').first().json.client_id }}",
    "scan_type":  "={{ $('Generate trace_id').first().json.scan_type }}",
    "webhook_path": "/security-scanner-start"
  },
  "meta": {
    "fixture_mode": "={{ $('Generate trace_id').first().json.fixture_mode }}",
    "webhook_path": "/security-scanner-start"
  }
}
```

### 4b. tool.call (before each external API call)

```json
{
  "trace_id":   "={{ $('Generate trace_id').first().json.trace_id }}",
  "source":     "n8n:agent-1",
  "event_type": "tool.call",
  "event_name": "Shodan Host Lookup",
  "scan_id":    "={{ $('Generate trace_id').first().json.scan_id }}",
  "client_id":  "={{ $('Generate trace_id').first().json.client_id }}",
  "status":     "info",
  "req":        { "ip_address": "={{ $json.ip_address }}" },
  "meta":       { "fixture_mode": "={{ $('Generate trace_id').first().json.fixture_mode }}" }
}
```

### 4c. tool.result (after each external API call succeeds)

```json
{
  "trace_id":     "={{ $('Generate trace_id').first().json.trace_id }}",
  "source":       "n8n:agent-1",
  "event_type":   "tool.result",
  "event_name":   "Shodan Host Lookup Result",
  "scan_id":      "={{ $('Generate trace_id').first().json.scan_id }}",
  "client_id":    "={{ $('Generate trace_id').first().json.client_id }}",
  "status":       "ok",
  "res":          { "total_ports": "={{ $json.total_ports }}", "findings_count": "={{ ($json.findings || []).length }}" },
  "duration_ms":  "={{ Date.now() - $('Generate trace_id').first().json._started_at }}",
  "meta":         { "fixture_mode": "={{ $('Generate trace_id').first().json.fixture_mode }}" }
}
```

### 4d. workflow.complete (before Final Response node)

```json
{
  "trace_id":     "={{ $('Generate trace_id').first().json.trace_id }}",
  "source":       "n8n:agent-1",
  "event_type":   "workflow.complete",
  "event_name":   "Security Scanner completed",
  "scan_id":      "={{ $('Generate trace_id').first().json.scan_id }}",
  "client_id":    "={{ $('Generate trace_id').first().json.client_id }}",
  "status":       "ok",
  "res": {
    "scan_result_id": "={{ $json.scan_result_id }}",
    "risk_score":     "={{ $json.risk_score }}"
  },
  "duration_ms":  "={{ Date.now() - $('Generate trace_id').first().json._started_at }}",
  "meta":         { "fixture_mode": "={{ $('Generate trace_id').first().json.fixture_mode }}" }
}
```

### 4e. workflow.error (in error-handling branch)

```json
{
  "trace_id":   "={{ $('Generate trace_id').first().json.trace_id }}",
  "source":     "n8n:agent-1",
  "event_type": "workflow.error",
  "event_name": "Security Scanner failed",
  "scan_id":    "={{ $('Generate trace_id').first().json.scan_id }}",
  "client_id":  "={{ $('Generate trace_id').first().json.client_id }}",
  "status":     "error",
  "err": {
    "message": "={{ $json.error?.message || 'Unknown error' }}",
    "code":    "={{ $json.error?.code }}",
    "stack":   "={{ $json.error?.stack }}"
  },
  "meta":       { "fixture_mode": "={{ $('Generate trace_id').first().json.fixture_mode }}" }
}
```

---

## 5. fixture_mode Support

When the webhook payload includes `"fixture_mode": true`:

1. The **Generate trace_id** code node captures it.
2. All SW_LOG_STEP calls include `"meta": { "fixture_mode": true }`.
3. Add IF nodes in your workflow to branch on `$('Generate trace_id').first().json.fixture_mode`:
   - **true branch**: return mock/deterministic data instead of calling external APIs.
   - **false branch**: normal external API calls.

This ensures the full pipeline executes (including logging) with deterministic results.

---

## 6. Propagate trace_id to Supabase Inserts

When inserting scan results into Supabase (via HTTP Request nodes), add `trace_id`
to the row:

```json
{
  "scan_result_id":   "={{ $json.scan_result_id }}",
  "client_id":        "={{ $json.client_id }}",
  "trace_id":         "={{ $('Generate trace_id').first().json.trace_id }}",
  "risk_score":       "={{ $json.risk_score }}"
}
```

---

## 7. Alert Workflow Setup

Import `SW_ALERT_CRON.json` and configure:

1. **Schedule**: Set the cron interval (default: every 15 min).
2. **Slack** node: Add your Slack Bot Token credential in n8n, set the channel.
3. **Email** node: Add your SMTP credential, set `ALERT_EMAIL_TO` env var.
4. Either channel can be disabled by simply not connecting it.

The alert workflow calls the `sw_event_log_errors_since(minutes)` PostgreSQL function
deployed with migration `20240301000003_sw_event_log_helpers.sql`.

---

## 8. Node Configuration Summary

| Stage | n8n Node Type | event_type |
|-------|--------------|------------|
| Webhook received | Execute Workflow (calls SW_LOG_STEP) | `workflow.start` |
| Before external API | Execute Workflow | `tool.call` |
| After external API | Execute Workflow | `tool.result` |
| Before final response | Execute Workflow | `workflow.complete` |
| Error handler branch | Execute Workflow | `workflow.error` |

---

## 9. Searching Traces

Once events are flowing into `sw_event_log`, search by trace_id in Supabase:

```sql
-- Full lifecycle for a trace
SELECT created_at, event_type, source, status, scan_id, err
FROM sw_event_log
WHERE trace_id = 'your-trace-uuid'
ORDER BY created_at ASC;

-- Or use the view
SELECT * FROM v_trace_timeline WHERE trace_id = 'your-trace-uuid';
```
