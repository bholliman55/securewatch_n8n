# Agent 3: Compliance & Policy Management

## Purpose
Automated compliance assessment and policy generation. Ingests client policy documents (PDF/DOCX), analyzes them against regulatory frameworks (HIPAA, GDPR, SOC2, ISO27001, PCI-DSS), identifies gaps, generates missing policies, and produces Azure Policy JSON + Terraform code for technical enforcement.

## Workflow Overview

```
Webhook Trigger (POST with file upload)
  → Extract Text:
      ├─ PDF → PDF.co Extract Text
      └─ DOCX → Mammoth.js (built-in)
  → Analyze Policy with Claude (identify framework, controls, gaps)
  → Store in Airtable (Policy Documents table)
  → Get Compliance Requirements from Airtable (filter by framework)
  → Map Policy to Requirements (Claude)
  → Update Client Compliance Status in Airtable
  → Identify Missing/Non-Compliant Requirements
  → For each gap:
      → Generate Missing Policy with Claude
      → Store Generated Policy in Airtable
  → Map Policies to Technical Controls (Claude)
  → Generate Azure Policy JSON (Claude)
  → Generate Terraform Code (Claude)
  → Validate Azure Policy JSON (Code node)
  → Store Azure Policies in Airtable
  → Generate Compliance Report (Claude)
  → Webhook Response
```

## Webhook Endpoint

- **Method**: POST
- **Path**: `/webhook/compliance-check`
- **Auth**: HTTP Header Auth (`X-API-Key`)

### Request Payload

```json
{
  "client_id": "CL001",
  "framework": "HIPAA",
  "policy_files": [
    {
      "filename": "security_policy.pdf",
      "mimetype": "application/pdf",
      "data": "<base64-encoded-content>"
    }
  ]
}
```

### Response

```json
{
  "assessment_id": "CA1234567890",
  "client_id": "CL001",
  "framework": "HIPAA",
  "policies_analyzed": 1,
  "compliance_score": 72,
  "gaps_found": 8,
  "policies_generated": 8,
  "azure_policies_created": 5,
  "timestamp": "2024-01-10T12:00:00.000Z",
  "status": "completed"
}
```

## Required Credentials (configure in n8n)

| Credential | n8n Type | Header / Field | Free Tier |
|---|---|---|---|
| Airtable Personal Access Token | Airtable Token API | — | 1,200 records/base |
| PDF.co API Key | HTTP Header Auth | `x-api-key` | 300 calls/month |
| Anthropic Claude API Key | HTTP Header Auth | `x-api-key` | Pay-per-use |

### Optional

| Credential | n8n Type | Purpose |
|---|---|---|
| Azure Service Principal | Azure / HTTP Header Auth | Auto-deploy policies |
| Slack Bot Token | Slack API (OAuth) | Compliance alerts |
| SMTP | SMTP | Email alerts |

### No Key Required
- **Mammoth.js** — built into n8n for DOCX extraction

## Airtable Schema

### Policy Documents
| Field | Type |
|---|---|
| policy_id | Single line text |
| client_id | Single line text |
| filename | Single line text |
| upload_date | Date |
| content | Long text |
| word_count | Number |
| framework | Single select |
| extraction_method | Single line text |
| status | Single select |
| policy_type | Single line text |
| policy_title | Single line text |
| policy_summary | Long text |
| key_requirements | Long text |
| technical_controls_needed | Long text |
| completeness_score | Number |
| analyzed_date | Date |

### Compliance Requirements (PRE-POPULATE BEFORE USE)
| Field | Type |
|---|---|
| requirement_id | Single line text |
| framework | Single select: HIPAA, GDPR, SOC2, ISO27001, PCI-DSS |
| requirement_code | Single line text |
| requirement_title | Single line text |
| requirement_description | Long text |
| category | Single line text |
| control_type | Single line text |
| required | Checkbox |

**Approximate counts**: HIPAA ~45, GDPR ~30, SOC2 ~60, ISO27001 ~114, PCI-DSS ~12

### Client Compliance Status
| Field | Type |
|---|---|
| client_id | Single line text |
| requirement_id | Link to Compliance Requirements |
| framework | Single select |
| requirement_code | Single line text |
| requirement_title | Single line text |
| status | Single select: Compliant, Non-Compliant, Partial, Not Assessed |
| policy_id | Link to Policy Documents |
| last_assessed | Date |
| next_assessment | Date |

### Generated Policies
| Field | Type |
|---|---|
| generated_policy_id | Single line text |
| client_id | Single line text |
| requirement_id | Link to Compliance Requirements |
| framework | Single select |
| policy_name | Single line text |
| policy_content | Long text |
| requirement_code | Single line text |
| requirement_title | Single line text |
| category | Single line text |
| generated_date | Date |
| generated_by | Single line text |
| status | Single select: Draft, Approved, Published |
| approved | Checkbox |
| word_count | Number |

### Azure Policies
| Field | Type |
|---|---|
| azure_policy_id | Single line text |
| client_id | Single line text |
| policy_document_id | Link to Policy Documents |
| policy_name | Single line text |
| policy_description | Long text |
| azure_policy_json | Long text |
| terraform_code | Long text |
| deployment_status | Single select |
| validation_status | Single select |
| validation_errors | Long text |
| validation_warnings | Long text |
| created_date | Date |
| deployed_date | Date |
| framework | Single select |

## Cost Notes

Claude API is used heavily in this workflow (6+ calls per run):
- Policy Analysis: ~$0.01-0.05/policy
- Policy Generation: ~$0.05-0.15/policy
- Technical Controls: ~$0.01-0.03/policy
- Azure Policy JSON: ~$0.01-0.03/policy
- Terraform Code: ~$0.01-0.03/policy
- Compliance Report: ~$0.02-0.05/report

## Prerequisites

1. **Compliance Requirements table MUST be pre-populated** with framework data before running.
2. PDF.co account must be active.
3. Claude API key must have sufficient credits.

## Troubleshooting

- **PDF extraction fails**: Check PDF.co API key, file may be scanned image (needs OCR).
- **DOCX extraction empty**: Mammoth only extracts text, not images/tables.
- **Compliance Requirements empty**: Pre-populate the table first — workflow depends on it.
- **Claude rate limited**: Add delays between the 6+ Claude calls per run.
- **Azure Policy JSON invalid**: The validation Code node checks structure; review `validation_errors` field.
