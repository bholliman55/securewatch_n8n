# SecureWatch n8n Agents

This repository contains the SecureWatch multi-agent automation stack for security monitoring, compliance, training, and breach response in n8n Cloud.

## Agents

All agents are organized under `agents/`:
- Agent 1: Security Scanner
- Agent 2: Vulnerability Assessment
- Agent 3: Compliance
- Agent 4: Training & Phishing
- Agent 5: Breach Response

See `agents/README.md` for the full index and per-agent playbooks.

## Quick Start

1. Pick an agent folder in `agents/agentX`.
2. Read `PLAYBOOK.md`.
3. Import the workflows into n8n Cloud.
4. Configure credentials.
5. Use pinned data for fast testing.

## Credentials

Common credentials across agents:
- Airtable Personal Access Token
- Anthropic API key (Claude)
- SendGrid API key

Agent 1 also requires API keys for security scanning services (see `agents/agent1/PLAYBOOK.md`).

## Airtable Setup

### Required Tables

#### 1. Scan Targets
Fields:
- `scan_target_id` (Single line text) - Unique identifier
- `client_id` (Single line text) - Client identifier
- `target_type` (Single select: domain, ip, url)
- `target_identifier` (Single line text) - Target to scan
- `scan_enabled` (Checkbox) - Enable/disable scanning
- `asset_criticality` (Single select: Low, Medium, High, Critical)
- `environment` (Single line text)

#### 2. Scan Results
Fields:
- `scan_result_id` (Single line text)
- `client_id` (Single line text)
- `scan_target_id` (Link to Scan Targets)
- `scan_date` (Date)
- `scan_type` (Single line text)
- `risk_score` (Number)
- `critical_findings` (Number)
- `high_findings` (Number)
- `medium_findings` (Number)
- `low_findings` (Number)
- `open_ports` (Number)
- `services_detected` (Number)
- `scanner_tool` (Single line text)
- `status` (Single line text)
- `raw_data` (Long text) - Optional: JSON data

#### 3. Scan Findings Detail
Fields:
- `finding_id` (Single line text)
- `scan_result_id` (Link to Scan Results)
- `client_id` (Single line text)
- `finding_type` (Single select: Vulnerability, SSL/TLS Issue, Open Port, Reputation, Misconfiguration)
- `severity` (Single select: CRITICAL, HIGH, MEDIUM, LOW)
- `title` (Single line text)
- `description` (Long text)
- `affected_asset` (Single line text)
- `port_protocol` (Single line text)
- `cve_id` (Single line text)
- `remediation_steps` (Long text)
- `status` (Single select: Open, In Progress, Resolved)
- `due_date` (Date)
- `notes` (Long text)

## Installation

### Step 1: Import Workflow into n8n

1. Open your n8n instance
2. Click **Workflows** in the sidebar
3. Click **Import from File** or use the **+** button
4. Select the `workflow-agent1-scanner.json` file
5. The workflow will be imported with all nodes

### Step 2: Configure Credentials

1. For each node requiring credentials, click on the node
2. Click **Credential to connect** or the credential dropdown
3. Select **Create New Credential** or choose existing credential
4. Fill in the required credential information
5. Test the connection if available
6. Save the credential

**Important**: Configure credentials for these nodes:
- **Webhook Trigger**: HTTP Header Auth
- **Get Scan Targets from Airtable**: Airtable Token API (Base and Table selection)
- **Shodan Host Lookup**: Generic Credential Type (apiKey)
- **SecurityTrails DNS Lookup**: HTTP Header Auth (APIKEY)
- **URLScan.io Submit Scan**: HTTP Header Auth (API-Key)
- **VirusTotal Domain Report**: HTTP Header Auth (x-apikey)
- **Store Report**: AWS (S3 access)
- **Send Slack Alert**: Slack API
- **Send Email Alert**: SMTP

### Step 3: Configure Airtable Nodes

1. **Get Scan Targets from Airtable**:
   - Select your Base
   - Select "Scan Targets" table
   - Verify the filter formula

2. **Store Results in Airtable**:
   - Select your Base
   - Select "Scan Results" table
   - Map field names to match your Airtable schema

3. **Store Detailed Findings**:
   - Select your Base
   - Select "Scan Findings Detail" table
   - Map field names to match your Airtable schema

### Step 4: Configure S3 Storage (Node 17)

1. Open **Store Report** node
2. Update the URL with your S3 bucket name and region:
   ```
   https://YOUR-BUCKET-NAME.s3.YOUR-REGION.amazonaws.com/{{ $json.file_name }}
   ```
3. Configure AWS credentials with S3 write permissions
4. Ensure your S3 bucket allows PUT operations

### Step 5: Configure Alert Channels

1. **Send Slack Alert** node:
   - Select your Slack credential
   - Configure the channel or user to receive alerts
   - Customize the message template if needed

2. **Send Email Alert** node:
   - Configure SMTP credentials
   - Update the `fromEmail` and `toEmail` addresses
   - Customize the email template if needed

### Step 6: Activate Workflow

1. Click the **Active** toggle in the top-right corner
2. The workflow is now ready to receive webhook requests

## Usage

### Starting a Scan via Webhook

Send a POST request to your webhook URL:

```bash
curl -X POST https://your-n8n-instance.app.n8n.cloud/webhook/security-scanner-start \
  -H "X-API-Key: your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "CL001",
    "scan_type": "full",
    "priority": "normal"
  }'
```

### Request Body

```json
{
  "client_id": "CL001",
  "scan_type": "full",
  "priority": "normal"
}
```

### Response

The webhook returns a JSON response:

```json
{
  "scan_result_id": "SR1234567890",
  "risk_score": 75,
  "report_url": "https://your-bucket.s3.us-east-1.amazonaws.com/security_report_example.com_2024-01-10.html",
  "timestamp": "2024-01-10T12:00:00.000Z",
  "status": "completed"
}
```

## Workflow Structure

### Node Flow

```
1. Webhook Trigger
   ↓
2. Get Scan Targets from Airtable
   ↓
3. Permission Validator (Code)
   ↓
   ╔═══════════════════════════╗
   ║  PARALLEL API CALLS       ║
   ╚═══════════════════════════╝
   ├→ 4. Shodan Host Lookup → 5. Parse Shodan Results
   ├→ 6a. SSL Labs Initiate Scan → 6b. Wait (60s) → 6c. Get SSL Results
   ├→ 7. SecurityTrails DNS Lookup
   ├→ 8a. URLScan.io Submit Scan → 8b. Wait (30s) → 8c. Get Results
   └→ 9. VirusTotal Domain Report
        ↓
10. Merge All Results
    ↓
11. Aggregate Scan Results (Code)
    ↓
12. Prepare Scan Results (Code)
    ↓
13. Store Results in Airtable
    ↓
14. Check If Alerts Needed (IF)
    ├→ TRUE: 15a. Send Slack Alert → 18. Final Response
    │       15b. Send Email Alert → 18. Final Response
    └→ FALSE: 13a. Split Findings → 13b. Loop Over Findings → 13c. Store Detailed Findings
                 ↓
              16. Generate HTML Report
                 ↓
              17. Store Report (S3 Upload)
                 ↓
              18. Final Response
```

## Testing

### Test 1: Validate Workflow Structure

1. Open the workflow in n8n
2. Verify all nodes are connected
3. Check for any error indicators (red nodes)
4. Verify all credentials are configured

### Test 2: Test Webhook Trigger

1. Copy the webhook URL from the Webhook Trigger node
2. Use a tool like Postman or curl to send a test request
3. Verify the webhook accepts the request
4. Check the execution log for any errors

### Test 3: Test with Sample Data

1. Add a test record to your Airtable "Scan Targets" table:
   - `client_id`: "TEST001"
   - `target_identifier`: "example.com"
   - `target_type`: "domain"
   - `scan_enabled`: ✓ (checked)
   
2. Send a webhook request with `client_id: "TEST001"`
3. Monitor the workflow execution
4. Verify results appear in Airtable
5. Check for generated HTML report in S3

### Test 4: Test Alert System

1. Modify a scan target to trigger a high risk score
2. Ensure the risk score calculation results in > 70
3. Verify Slack and email alerts are sent
4. Check alert content and formatting

## Troubleshooting

### Issue: "API Rate Limit Exceeded"

**Solution**: 
- Add Wait nodes between API calls
- Implement rate limiting in Code nodes
- Use Airtable to track API usage
- Consider upgrading API plans

### Issue: "SSL Labs Returns IN_PROGRESS Forever"

**Solution**:
- Increase wait time to 120 seconds in Node 6b
- Add max retry limit (3-5 attempts)
- Add timeout and skip if not ready

### Issue: "Webhook Returns Empty Response"

**Solution**:
- Verify Response Mode is set to "Last Node" in Webhook Trigger
- Ensure Final Response node is properly connected
- Check that all workflow paths lead to Final Response

### Issue: "Airtable Link Fields Not Working"

**Solution**:
- Use Airtable record IDs (recXXXXX format)
- Get record ID from previous Airtable query
- Pass as array: `["recABC123"]`
- Verify field types match (Link vs Single line text)

### Issue: "HTML Report Not Displaying Correctly"

**Solution**:
- Test HTML in browser first
- Check for JavaScript template literal syntax errors
- Escape special characters in data
- Verify S3 bucket CORS settings for public access

### Issue: "S3 Upload Fails"

**Solution**:
- Verify AWS credentials have S3 write permissions
- Check bucket name and region in URL
- Ensure bucket exists and is accessible
- Verify bucket policy allows PUT operations
- Check IAM user permissions

## Customization

### Adjust Risk Score Threshold

Edit **Check If Alerts Needed** node (Node 14):
- Change condition from `> 70` to your desired threshold

### Modify Alert Templates

1. **Slack Alert** (Node 15a): Edit the message text field
2. **Email Alert** (Node 15b): Edit the HTML message template

### Change Wait Times

- **SSL Labs Wait** (Node 6b): Adjust from 60 seconds
- **URLScan.io Wait** (Node 8b): Adjust from 30 seconds

### Customize HTML Report

Edit **Generate HTML Report** node (Node 16):
- Modify the HTML template
- Adjust styling in the `<style>` section
- Add or remove report sections

## Security Considerations

1. **Never hardcode API keys** - Always use n8n credentials
2. **Validate all client_id inputs** - Prevent unauthorized access
3. **Log all scan activities** - Maintain audit trail in Airtable
4. **Encrypt sensitive data** - Use HTTPS for all API calls
5. **Limit webhook access** - Use strong API keys
6. **Rate limit webhook** - Prevent abuse
7. **Review permissions** - Minimum necessary access for each API
8. **Secure S3 bucket** - Configure proper bucket policies
9. **Rotate API keys** - Regularly update credentials
10. **Monitor usage** - Track API calls and costs

## Support

For issues or questions:
1. Check the n8n execution logs
2. Review node error messages
3. Verify all credentials are correctly configured
4. Test individual nodes in isolation
5. Consult the n8n documentation: https://docs.n8n.io/

## License

This workflow is provided as-is for security scanning purposes. Ensure compliance with all API terms of service and data protection regulations.
