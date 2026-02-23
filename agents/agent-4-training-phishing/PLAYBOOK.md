# Agent 4: Training & Phishing Simulation

## Purpose
Automated security awareness training and phishing simulation campaigns. Generates training content, creates realistic phishing templates, tracks employee responses, and produces training effectiveness reports.

## Status: Planned

This agent is defined but not yet implemented. The following is the planned specification.

## Planned Workflow

```
Webhook Trigger (POST)
  → Get Employee List from Airtable
  → Generate Training Content with Claude
  → Create Phishing Templates with Claude
  → Schedule Campaign
  → Send Phishing Emails (SendGrid)
  → Track Opens / Clicks (webhook callbacks)
  → Score Employee Responses
  → Generate Training Report
  → Store Results in Airtable
  → Send Summary to Admins
  → Webhook Response
```

## Planned Credentials

| Credential | Purpose |
|---|---|
| Airtable Personal Access Token | Employee and campaign data |
| Anthropic Claude API Key | Content generation |
| SendGrid API Key | Email delivery |
| SMTP (fallback) | Email delivery |

## Planned Airtable Tables

- **Employees** — employee roster, department, training status
- **Campaigns** — campaign definitions, schedules, templates
- **Campaign Results** — per-employee open/click/report tracking
- **Training Modules** — generated training content

## Next Steps

1. Define Airtable schema in detail
2. Build n8n workflow
3. Create test payloads
4. Write e2e tests
