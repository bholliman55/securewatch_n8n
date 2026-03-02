#!/usr/bin/env bash
# =============================================================================
# deploy_to_n8n.sh
# Push updated SecureWatch agent workflow JSON files to n8n via the REST API.
#
# Usage:
#   N8N_URL=https://your-n8n-host N8N_API_KEY=your-key ./deploy_to_n8n.sh
#
#   Or set variables in debug/.env and this script will load them.
#
# What it does:
#   1. Lists all workflows in your n8n instance.
#   2. Matches each agent workflow by name.
#   3. Updates it via PUT /api/v1/workflows/{id}.
#      If a workflow doesn't exist yet, it creates it via POST.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---------------------------------------------------------------------------
# Load .env if present (debug/.env or project root .env)
# ---------------------------------------------------------------------------
if [[ -f "$SCRIPT_DIR/debug/.env" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$SCRIPT_DIR/debug/.env"; set +a
fi
if [[ -f "$SCRIPT_DIR/.env" ]]; then
  set -a; source "$SCRIPT_DIR/.env"; set +a
fi

# ---------------------------------------------------------------------------
# Validate required env vars
# ---------------------------------------------------------------------------
N8N_URL="${N8N_URL:-}"
N8N_API_KEY="${N8N_API_KEY:-}"

if [[ -z "$N8N_URL" || -z "$N8N_API_KEY" ]]; then
  echo ""
  echo "  ERROR: N8N_URL and N8N_API_KEY must be set."
  echo ""
  echo "  Option A — pass inline:"
  echo "    N8N_URL=https://your-n8n-host N8N_API_KEY=your-key ./deploy_to_n8n.sh"
  echo ""
  echo "  Option B — add to debug/.env:"
  echo "    N8N_URL=https://your-n8n-host"
  echo "    N8N_API_KEY=your-key"
  echo ""
  echo "  Get your API key from n8n → Settings → API → Create an API key."
  echo ""
  exit 1
fi

# Strip trailing slash from URL
N8N_URL="${N8N_URL%/}"

AGENTS_DIR="$SCRIPT_DIR/agents"

# Map: workflow name (must match exactly what's in n8n) -> local directory
declare -A AGENTS=(
  ["Agent 1 - Security Scanner"]="agent-1-security-scanner"
  ["Agent 2 - Vulnerability Assessment"]="agent-2-vulnerability-assessment"
  ["Agent 3 - Compliance & Policy Management"]="agent-3-compliance"
)

# ---------------------------------------------------------------------------
# Helper: n8n API call
# ---------------------------------------------------------------------------
n8n_api() {
  local method="$1"
  local path="$2"
  local data="${3:-}"

  if [[ -n "$data" ]]; then
    curl -s -f -X "$method" \
      -H "X-N8N-API-KEY: $N8N_API_KEY" \
      -H "Content-Type: application/json" \
      --data-binary "$data" \
      "$N8N_URL/api/v1$path"
  else
    curl -s -f -X "$method" \
      -H "X-N8N-API-KEY: $N8N_API_KEY" \
      "$N8N_URL/api/v1$path"
  fi
}

# ---------------------------------------------------------------------------
# 1. Fetch existing workflows (up to 250)
# ---------------------------------------------------------------------------
echo ""
echo "Connecting to n8n at $N8N_URL ..."
EXISTING_JSON=$(n8n_api GET "/workflows?limit=250" || {
  echo ""
  echo "  ERROR: Could not reach n8n API at $N8N_URL"
  echo "  Check your N8N_URL and that n8n is running."
  exit 1
})
echo "  Connected. Fetching workflow list..."

# ---------------------------------------------------------------------------
# 2. Deploy each agent workflow
# ---------------------------------------------------------------------------
for WORKFLOW_NAME in "${!AGENTS[@]}"; do
  AGENT_DIR="${AGENTS[$WORKFLOW_NAME]}"
  WORKFLOW_FILE="$AGENTS_DIR/$AGENT_DIR/workflow.json"

  if [[ ! -f "$WORKFLOW_FILE" ]]; then
    echo "  SKIP '$WORKFLOW_NAME': file not found at $WORKFLOW_FILE"
    continue
  fi

  echo ""
  echo "  ── $WORKFLOW_NAME"

  # Find workflow ID by matching name
  WORKFLOW_ID=$(python3 - "$EXISTING_JSON" "$WORKFLOW_NAME" << 'PYEOF'
import json, sys
data = json.loads(sys.argv[1])
name = sys.argv[2]
for w in data.get("data", []):
    if w.get("name") == name:
        print(w["id"])
        break
PYEOF
  )

  if [[ -z "$WORKFLOW_ID" ]]; then
    # ── CREATE (workflow not yet in n8n)
    echo "     Not found in n8n → creating..."
    RESPONSE=$(n8n_api POST "/workflows" "@$WORKFLOW_FILE")
    NEW_ID=$(python3 -c "import json,sys; print(json.loads(sys.stdin.read()).get('id','?'))" <<< "$RESPONSE")
    echo "     ✓ Created with ID: $NEW_ID"
    echo "       Action required: open the workflow in n8n and replace"
    echo "       SW_LOG_STEP_WORKFLOW_ID with the real ID of SW_LOG_STEP."
  else
    # ── UPDATE (workflow already exists — inject the known ID and PUT)
    echo "     Found (ID: $WORKFLOW_ID) → updating..."
    PAYLOAD=$(python3 - "$WORKFLOW_FILE" "$WORKFLOW_ID" << 'PYEOF'
import json, sys
with open(sys.argv[1]) as f:
    wf = json.load(f)
wf["id"] = sys.argv[2]
print(json.dumps(wf))
PYEOF
    )
    n8n_api PUT "/workflows/$WORKFLOW_ID" "$PAYLOAD" > /dev/null
    echo "     ✓ Updated successfully"
    echo "       Reminder: replace SW_LOG_STEP_WORKFLOW_ID in every"
    echo "       'Log:' Execute Workflow node with the real workflow ID."
  fi
done

echo ""
echo "Deploy complete."
echo ""
echo "Next steps:"
echo "  1. In n8n, open each agent workflow and find the Execute Workflow nodes"
echo "     named 'Log: workflow.start', 'Log: *', etc."
echo "  2. Set the Workflow field to 'SW_LOG_STEP — Trace Event Logger'."
echo "  3. Activate each workflow."
echo ""
