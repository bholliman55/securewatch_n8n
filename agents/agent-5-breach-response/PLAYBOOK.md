# Agent 5: Breach Response

## Purpose
Automated incident response and breach management. Triages security incidents, coordinates response actions, generates breach notification templates, tracks remediation progress, and produces post-incident reports.

## Status: Planned

This agent is defined but not yet implemented. The following is the planned specification.

## Planned Workflow

```
Webhook Trigger (POST - incident report)
  → Triage Incident with Claude (classify severity, type, scope)
  → Get Affected Assets from Airtable
  → Cross-reference with Vulnerability data (Agent 2)
  → Generate Incident Response Plan with Claude
  → Create Containment Actions
  → Notify Response Team (Slack + Email)
  → Track Remediation Steps in Airtable
  → Generate Breach Notification Templates (if PII affected)
  → Generate Post-Incident Report
  → Store All Records in Airtable
  → Webhook Response
```

## Planned Credentials

| Credential | Purpose |
|---|---|
| Airtable Personal Access Token | Incident and response data |
| Anthropic Claude API Key | Analysis and content generation |
| Slack Bot Token | Team notifications |
| SMTP | Email notifications |
| PagerDuty API (optional) | On-call alerting |

## Planned Airtable Tables

- **Incidents** — incident records, severity, status, timeline
- **Response Actions** — containment and remediation steps
- **Notifications** — breach notification tracking
- **Post-Incident Reports** — lessons learned, recommendations

## Next Steps

1. Define Airtable schema in detail
2. Build n8n workflow
3. Create test payloads
4. Write e2e tests
