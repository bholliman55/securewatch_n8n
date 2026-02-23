# Agent 1: Security Scanner

## Purpose
Automated external security scanning of client domains, IPs, and URLs using multiple threat intelligence APIs. Results are aggregated into a risk score, stored in Airtable, and alerts are sent for high-risk findings.

## Workflow Overview

```
Webhook Trigger (POST)
  → Get Scan Targets from Airtable (filtered by client_id)
  → Permission Validator (Code node)
  → Parallel API Scans:
      ├─ Shodan Host Lookup → Parse Results
      ├─ SSL Labs Initiate → Wait 60s → Get SSL Results
      ├─ SecurityTrails DNS Lookup
      ├─ URLScan.io Submit → Wait 30s → Get Results
      └─ VirusTotal Domain Report
  → Merge All Results
  → Aggregate Scan Results (Code node - compute risk score)
  → Prepare Scan Results (Code node)
  → Store Results in Airtable (Scan Results table)
  → Split Findings → Loop → Store Detailed Findings (Scan Findings Detail table)
  → Generate HTML Report → Store Report (S3)
  → Check If Alerts Needed (risk_score > 70)
      ├─ TRUE: Send Slack Alert + Send Email Alert
      └─ FALSE: skip
  → Final Response (webhook reply)
```

## Webhook Endpoint

- **Method**: POST
- **Path**: `/webhook/security-scanner-start`
- **Auth**: HTTP Header Auth (`X-API-Key`)

### Request Payload

```json
{
  "client_id": "CL001",
  "scan_type": "full",
  "priority": "normal"
}
```

### Response

```json
{
  "scan_result_id": "SR1234567890",
  "risk_score": 75,
  "report_url": "https://bucket.s3.us-east-1.amazonaws.com/report.html",
  "timestamp": "2024-01-10T12:00:00.000Z",
  "status": "completed"
}
```

## Required Credentials (configure in n8n)

| Credential | n8n Type | Header / Field | Free Tier |
|---|---|---|---|
| Airtable Personal Access Token | Airtable Token API | — | 1,200 records/base |
| Shodan API Key | Generic Credential | `apiKey` | 100 queries/month |
| SecurityTrails API Key | HTTP Header Auth | `APIKEY` | 50 queries/month |
| URLScan.io API Key | HTTP Header Auth | `API-Key` | 1,000 scans/month |
| VirusTotal API Key | HTTP Header Auth | `x-apikey` | 500 requests/day |
| Webhook Secret | HTTP Header Auth | `X-API-Key` | N/A (self-generated) |

### Optional

| Credential | n8n Type | Purpose |
|---|---|---|
| AWS S3 | AWS | HTML report storage |
| Slack Bot Token | Slack API (OAuth) | Alert notifications |
| SMTP | SMTP | Email alerts |

### No Key Required
- **SSL Labs API** — free public, rate limited (1 scan/host/2h, 25/day)

## Airtable Schema

### Scan Targets
| Field | Type |
|---|---|
| scan_target_id | Single line text |
| client_id | Single line text |
| target_type | Single select: domain, ip, url |
| target_identifier | Single line text |
| scan_enabled | Checkbox |
| asset_criticality | Single select: Low, Medium, High, Critical |
| environment | Single line text |

### Scan Results
| Field | Type |
|---|---|
| scan_result_id | Single line text |
| client_id | Single line text |
| scan_target_id | Link to Scan Targets |
| scan_date | Date |
| scan_type | Single line text |
| risk_score | Number |
| critical_findings | Number |
| high_findings | Number |
| medium_findings | Number |
| low_findings | Number |
| open_ports | Number |
| services_detected | Number |
| scanner_tool | Single line text |
| status | Single line text |
| raw_data | Long text (JSON) |

### Scan Findings Detail
| Field | Type |
|---|---|
| finding_id | Single line text |
| scan_result_id | Link to Scan Results |
| client_id | Single line text |
| finding_type | Single select: Vulnerability, SSL/TLS Issue, Open Port, Reputation, Misconfiguration |
| severity | Single select: CRITICAL, HIGH, MEDIUM, LOW |
| title | Single line text |
| description | Long text |
| affected_asset | Single line text |
| port_protocol | Single line text |
| cve_id | Single line text |
| remediation_steps | Long text |
| status | Single select: Open, In Progress, Resolved |
| due_date | Date |
| notes | Long text |

## Troubleshooting

- **API Rate Limit Exceeded**: Add Wait nodes, check free tier limits.
- **SSL Labs stuck IN_PROGRESS**: Increase wait to 120s, add retry limit.
- **Webhook returns empty**: Set Response Mode to "Last Node", ensure Final Response node is connected.
- **Airtable link fields fail**: Use record IDs (`recXXX` format), pass as array.
- **S3 upload fails**: Check IAM permissions (`s3:PutObject`), bucket name, region, CORS.
