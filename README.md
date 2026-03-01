# SecureWatch n8n Agents

Multi-agent security automation stack built on n8n Cloud. Each agent is a self-contained n8n workflow for a specific security domain.

## Agents

| # | Agent | Status | Directory |
|---|-------|--------|-----------|
| 1 | Security Scanner | Implemented | `agents/agent-1-security-scanner/` |
| 2 | Vulnerability Assessment | Implemented | `agents/agent-2-vulnerability-assessment/` |
| 3 | Compliance & Policy Management | Implemented | `agents/agent-3-compliance/` |
| 4 | Training & Phishing | Planned | `agents/agent-4-training-phishing/` |
| 5 | Breach Response | Planned | `agents/agent-5-breach-response/` |

---

## Project Structure

```
agents/
  agent-1-security-scanner/
    PLAYBOOK.md          # Full spec: workflow, credentials, Airtable schema
    workflow.json        # n8n-importable workflow
    test-payload.json    # Sample webhook payload
  agent-2-vulnerability-assessment/
    PLAYBOOK.md
    workflow.json
    test-payload.json
  agent-3-compliance/
    PLAYBOOK.md
    workflow.json
    test-payload.json
  agent-4-training-phishing/
    PLAYBOOK.md          # Planned spec
  agent-5-breach-response/
    PLAYBOOK.md          # Planned spec

debug/                   # Python debug tooling
  .env.example           # Template for required environment variables
  requirements.txt       # Python dependencies
  replay_runner.py       # Fetch & replay a trace by trace_id
  contract_tests.py      # pytest invariant tests for pipeline correctness

n8n/workflows/
  SW_LOG_STEP.json                   # Reusable logging sub-workflow (import into n8n)
  SW_ALERT_CRON.json                 # Cron alert workflow for recent errors
  SW_LOG_STEP_INTEGRATION_GUIDE.md   # Step-by-step node configuration guide

supabase/
  migrations/
    20240301000001_create_sw_event_log.sql       # Main event ledger table + RLS
    20240301000002_create_sw_event_artifacts.sql  # Large-payload artifact table + RLS
    20240301000003_sw_event_log_helpers.sql       # Views + RPC helper functions
  functions/
    sw-log/
      index.ts           # Supabase Edge Function: POST event to sw_event_log

tests/
  e2e/
    run-tests.js             # End-to-end test runner (Node.js)
    test-config.env.example  # Webhook URL configuration
```

---

## Distributed Tracing System

Every request that enters a SecureWatch agent workflow carries a single
**`trace_id`** (UUID). This correlation ID is:

- Generated at webhook entry (or accepted from the caller for replays)
- Inserted alongside every `sw_event_log` row
- Passed through to Supabase inserts and Edge Function calls
- Returned in the final webhook response

This lets you trace the full lifecycle of any request from a single query:

```sql
SELECT created_at, event_type, source, status, scan_id, err
FROM sw_event_log
WHERE trace_id = 'your-trace-uuid'
ORDER BY created_at ASC;
```

### Event lifecycle

| Stage | `event_type` |
|-------|-------------|
| Webhook received | `workflow.start` |
| Before each external API | `tool.call` |
| After each external API | `tool.result` |
| Before final response | `workflow.complete` |
| Error handler branch | `workflow.error` |

---

## Setup

### Prerequisites

- Supabase project (free tier is fine)
- n8n Cloud or self-hosted n8n instance
- Python ≥ 3.11 (for debug tooling)
- Node.js ≥ 18 (for e2e tests)
- Supabase CLI (for local development + migration deployment)

### 1. Deploy Supabase Migrations

```bash
# Install Supabase CLI if needed
npm install -g supabase

# Log in and link to your project
supabase login
supabase link --project-ref <your-project-ref>

# Apply all migrations
supabase db push
```

Migrations create:
- `sw_event_log` — append-only event ledger
- `sw_event_artifacts` — optional large-payload overflow
- `v_trace_timeline` / `v_recent_errors` views
- `sw_event_log_errors_since(minutes)` RPC function

### 2. Deploy the sw-log Edge Function

```bash
supabase functions deploy sw-log --no-verify-jwt
```

> **Note**: `--no-verify-jwt` allows n8n to call the function using the
> service-role key in the Authorization header. For production, consider
> using the default JWT verification with a dedicated service account.

Test the deployment:

```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/sw-log \
  -H "Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "trace_id": "00000000-0000-0000-0000-000000000001",
    "source": "curl-test",
    "event_type": "workflow.start",
    "event_name": "Manual test",
    "status": "info"
  }'
# Expected: {"ok":true,"id":"<uuid>"}
```

### 3. Configure n8n Environment Variables

In n8n Cloud → **Settings** → **Environment Variables**, add:

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key (Settings → API in Supabase) |
| `ALERT_WINDOW_MINUTES` | Error lookback window in minutes (default `15`) |
| `ALERT_EMAIL_TO` | Alert recipient email |

### 4. Import n8n Workflows

1. **SW_LOG_STEP** (sub-workflow — import first):
   - n8n → Workflows → Import from file → `n8n/workflows/SW_LOG_STEP.json`
   - Activate it (it will be called by agent workflows)

2. **SW_ALERT_CRON** (error alerting):
   - n8n → Workflows → Import from file → `n8n/workflows/SW_ALERT_CRON.json`
   - Configure Slack and/or SMTP credentials in n8n, then activate

3. **Agent workflows**:
   - Follow `n8n/workflows/SW_LOG_STEP_INTEGRATION_GUIDE.md` to add trace_id
     generation and SW_LOG_STEP calls to each agent workflow.

### 5. Install Python Debug Tools

```bash
cd debug
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your Supabase URL, keys, and entrypoint URLs
```

---

## Running n8n Agent Tests

```bash
# Install dependencies
npm install

# Copy and configure test URLs
cp tests/e2e/test-config.env.example tests/e2e/test-config.env
# Edit test-config.env with your n8n webhook URLs and API key

# Run all e2e tests
npm test

# Run a specific agent test
npm run test:agent1
npm run test:agent2
npm run test:agent3
```

---

## Replay Runner

Fetch the original root request for any `trace_id` and re-trigger it into
staging or local:

```bash
cd debug
source .venv/bin/activate

# Replay into staging (default)
python replay_runner.py --trace-id <uuid>

# Replay into local n8n
python replay_runner.py --trace-id <uuid> --env local

# Dry-run: print payload without sending
python replay_runner.py --trace-id <uuid> --dry-run

# Override webhook path
python replay_runner.py --trace-id <uuid> --webhook-path /security-scanner-start
```

The runner will:
1. Fetch all events for the trace from `sw_event_log`
2. Print the full event timeline
3. Extract the root event's `req` payload
4. Re-POST it with the original `trace_id` preserved (so the replay is traceable)

---

## Contract Tests

Validate pipeline invariants for any completed trace:

```bash
cd debug
source .venv/bin/activate

# Run all invariant checks against a trace
TRACE_ID=<uuid> pytest contract_tests.py -v

# Stop on first failure
TRACE_ID=<uuid> pytest contract_tests.py -v -x

# Assert fixture_mode was recorded
TRACE_ID=<uuid> FIXTURE_MODE=true pytest contract_tests.py -v
```

### Invariants checked

| # | Invariant |
|---|-----------|
| 1 | At least one event exists for the trace_id |
| 2 | A `workflow.start` event exists |
| 3 | At least one `tool.call` / `tool.result` activity event exists |
| 4 | A terminal event (`workflow.complete` or `workflow.error`) exists |
| 5 | `workflow.error` events have a non-null `err.message` |
| 6 | All events with a `scan_id` share the same value |
| 7 | Events are temporally ordered (non-decreasing `created_at`) |
| 8 | If `FIXTURE_MODE=true`, all events record `meta.fixture_mode=true` |
| 9 | sw-log Edge Function returns 201 for a valid health-check insert |

### Example passing output

```
TRACE_ID=abc12345-... pytest debug/contract_tests.py -v

PASSED TestTraceExists::test_events_found
PASSED TestTraceExists::test_all_events_share_trace_id
PASSED TestWorkflowStart::test_workflow_start_present
PASSED TestWorkflowStart::test_workflow_start_has_source
PASSED TestToolOrWebhookCall::test_activity_event_present
PASSED TestTerminalEvent::test_terminal_event_present
PASSED TestTerminalEvent::test_only_one_terminal_event
PASSED TestErrorInvariant::test_error_events_have_err_field
PASSED TestScanIdConsistency::test_scan_id_consistent
PASSED TestTemporalOrdering::test_events_are_ordered
SKIPPED TestFixtureMode::test_fixture_mode_in_meta
PASSED TestSwLogHealthCheck::test_sw_log_endpoint_accepts_valid_event

[contract_tests] PASS — trace_id=abc12345-... satisfies all invariants.
```

### Example failing output (missing terminal event)

```
FAILED TestTerminalEvent::test_terminal_event_present
AssertionError: No terminal event found (expected one of: {'workflow.complete', 'workflow.error'}).
  Every completed or failed workflow must log a terminal event.
```

---

## fixture_mode

Append `"fixture_mode": true` to any webhook payload to run the pipeline with
mocked external calls but full event logging:

```json
{
  "client_id": "CL001",
  "scan_type": "full",
  "fixture_mode": true
}
```

Agents must check `fixture_mode` in the **Generate trace_id** code node and branch
to mock responses (see `SW_LOG_STEP_INTEGRATION_GUIDE.md`). The flag is recorded in
`meta.fixture_mode` on every event, so contract tests can assert it with
`FIXTURE_MODE=true`.

---

## Querying the Event Ledger

```sql
-- Full lifecycle for a trace
SELECT * FROM v_trace_timeline WHERE trace_id = 'your-uuid';

-- All errors in the last hour
SELECT trace_id, event_name, err, created_at
FROM sw_event_log
WHERE status = 'error' AND created_at >= now() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- Errors in the last N minutes (RPC)
SELECT * FROM sw_event_log_errors_since(15);

-- Count events per trace
SELECT trace_id, count(*) AS events
FROM sw_event_log
GROUP BY trace_id
ORDER BY count(*) DESC;
```

---

## Credentials

All credentials are managed in n8n Cloud. See each agent's `PLAYBOOK.md` for
the full list of required API keys.

Shared across agents:
- Airtable Personal Access Token
- Anthropic Claude API Key (Agents 2, 3)

Tracing system specific:
- Supabase service-role key (n8n environment variable)
- Slack Bot Token (for SW_ALERT_CRON)
- SMTP credentials (for SW_ALERT_CRON)

---

## Security Notes

- `sw_event_log` and `sw_event_artifacts` have Row Level Security enabled.
- Only the service-role key can INSERT (via the `sw-log` Edge Function).
- Only users with JWT claim `role=admin` can SELECT.
- The tables are append-only (UPDATE/DELETE rules prevent modification).
- Never commit `.env` or `test-config.env` — both are in `.gitignore`.
- The service-role key is significantly more powerful than the anon key;
  treat it as a secret and rotate it if exposed.
