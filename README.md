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

## Project Structure

```
agents/
  agent-1-security-scanner/
    PLAYBOOK.md          # Full spec: workflow, credentials, Airtable schema
    workflow.json         # n8n-importable workflow
    test-payload.json     # Sample webhook payload
  agent-2-vulnerability-assessment/
    PLAYBOOK.md
    workflow.json
    test-payload.json
  agent-3-compliance/
    PLAYBOOK.md
    workflow.json
    test-payload.json
  agent-4-training-phishing/
    PLAYBOOK.md           # Planned spec
  agent-5-breach-response/
    PLAYBOOK.md           # Planned spec
tests/
  e2e/
    run-tests.js          # End-to-end test runner
    test-config.env.example  # Webhook URL configuration
```

## Quick Start

1. Pick an agent directory under `agents/`.
2. Read the `PLAYBOOK.md` for credentials, Airtable schema, and workflow details.
3. Import `workflow.json` into n8n Cloud.
4. Configure credentials in n8n (all keys stored in n8n, not in this repo).
5. Run the e2e tests to validate.

## Running Tests

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

## Credentials

All credentials are managed in n8n Cloud. See each agent's `PLAYBOOK.md` for the full list of required API keys and how to configure them.

Shared across agents:
- Airtable Personal Access Token
- Anthropic Claude API Key (Agents 2, 3)

## Airtable Setup

Each agent's `PLAYBOOK.md` contains the complete table schema. Create tables before activating workflows.
