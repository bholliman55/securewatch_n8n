# Complete Credentials & Variables Required for All Workflows

This document lists **ALL** credentials, API keys, tokens, and configuration variables needed to make all three workflows functional.

---

## 🔑 CREDENTIALS BY WORKFLOW

### **AGENT 1: Security Scanner Workflow**

#### Required Credentials:

1. **Airtable Personal Access Token** ⭐ REQUIRED
   - **Where to get**: https://airtable.com/create/tokens
   - **n8n Credential Type**: `Airtable Token API`
   - **Required Scopes**: `data.records:read`, `data.records:write`
   - **Used in**: All Airtable nodes (Get Scan Targets, Store Results, Store Findings)
   - **Free Tier**: 1,200 records/base
   - **Note**: You'll also need to select Base and Table in each Airtable node

2. **Shodan API Key** ⭐ REQUIRED
   - **Where to get**: https://account.shodan.io/register
   - **n8n Credential Type**: `Generic Credential Type`
   - **Field Name**: `apiKey`
   - **Free Tier**: 100 queries/month, 1 request/sec
   - **Used in**: Shodan Host Lookup node
   - **URL Format**: `https://api.shodan.io/shodan/host/{{ IP }}?key={{ $credentials.shodanApiKey }}`

3. **SecurityTrails API Key** ⭐ REQUIRED
   - **Where to get**: https://securitytrails.com/ (sign up for free account)
   - **n8n Credential Type**: `HTTP Header Auth`
   - **Header Name**: `APIKEY`
   - **Free Tier**: 50 queries/month
   - **Used in**: SecurityTrails DNS Lookup node
   - **Dashboard**: https://securitytrails.com/app/account/api

4. **URLScan.io API Key** ⭐ REQUIRED
   - **Where to get**: https://urlscan.io/user/signup
   - **n8n Credential Type**: `HTTP Header Auth`
   - **Header Name**: `API-Key`
   - **Free Tier**: 50 scans/day, 1,000/month
   - **Used in**: URLScan.io Submit Scan and Get Results nodes
   - **Profile**: https://urlscan.io/user/profile

5. **VirusTotal API Key** ⭐ REQUIRED
   - **Where to get**: https://www.virustotal.com/gui/join-us (sign up for free)
   - **n8n Credential Type**: `HTTP Header Auth`
   - **Header Name**: `x-apikey`
   - **Free Tier**: 4 requests/min, 500/day
   - **Used in**: VirusTotal Domain Report node
   - **API Key Page**: https://www.virustotal.com/gui/user/[username]/apikey

6. **Webhook API Key** (for authentication) ⭐ REQUIRED
   - **Where to get**: Generate your own secure random string (32+ characters)
   - **n8n Credential Type**: `HTTP Header Auth`
   - **Header Name**: `X-API-Key`
   - **Used in**: Webhook Trigger node
   - **Example**: Use a password generator or: `openssl rand -hex 32`

#### Optional Credentials:

7. **AWS S3 Credentials** (for report storage)
   - **Where to get**: AWS Console > IAM > Users > Create Access Key
   - **n8n Credential Type**: `AWS`
   - **Required**: Access Key ID, Secret Access Key, Region
   - **Required Permissions**: `s3:PutObject` on your bucket
   - **Used in**: Store Report (S3 Upload) node
   - **Alternative**: Can skip and store reports in Airtable instead

8. **Slack Bot Token** (for alerts)
   - **Where to get**: https://api.slack.com/apps (create app and install to workspace)
   - **n8n Credential Type**: `Slack API` (OAuth)
   - **Required Scopes**: `chat:write`, `channels:read`
   - **Used in**: Send Slack Alert node
   - **Steps**: Create App > OAuth & Permissions > Install to Workspace

9. **SMTP Credentials** (for email alerts)
   - **Where to get**: Your email provider or company SMTP server
   - **n8n Credential Type**: `SMTP`
   - **Required**: Host, Port, User, Password
   - **Gmail Example**: Use App Password (https://myaccount.google.com/apppasswords)
   - **Used in**: Send Email Alert node
   - **Common Settings**:
     - Gmail: `smtp.gmail.com:587` (TLS)
     - SendGrid: `smtp.sendgrid.net:587`
     - AWS SES: `email-smtp.[region].amazonaws.com:587`

#### No API Key Required:

- **SSL Labs API**: Free public API, no key needed
  - Rate Limits: 1 assessment/host every 2 hours, max 25/24 hours

---

### **AGENT 2: Vulnerability Assessment Workflow**

#### Required Credentials:

1. **Airtable Personal Access Token** ⭐ REQUIRED
   - **Same as Agent 1** (can reuse)
   - **Used in**: Get Assets, Check Existing Vulnerabilities, Create/Update Vulnerability Records
   - **Tables Needed**: Assets, Vulnerabilities

2. **Snyk API Token** ⭐ REQUIRED
   - **Where to get**: https://app.snyk.io/account
   - **Sign Up**: https://app.snyk.io/signup
   - **n8n Credential Type**: `HTTP Header Auth`
   - **Header Name**: `Authorization`
   - **Header Value Format**: `token YOUR_TOKEN`
   - **Free Tier**: 200 tests/month
   - **Used in**: Snyk Web Scan, Snyk Container Scan nodes

3. **Anthropic Claude API Key** ⭐ REQUIRED
   - **Where to get**: https://console.anthropic.com/settings/keys
   - **Sign Up**: https://console.anthropic.com/
   - **n8n Credential Type**: `HTTP Header Auth`
   - **Header Name**: `x-api-key`
   - **Pricing**: Pay-per-use (check https://www.anthropic.com/pricing)
   - **Used in**: Generate Remediation with Claude API node
   - **Note**: This is used for AI-powered remediation generation

#### Optional Credentials:

4. **NVD (National Vulnerability Database) API Key** (recommended)
   - **Where to get**: https://nvd.nist.gov/developers/request-an-api-key
   - **n8n Credential Type**: `HTTP Header Auth`
   - **Header Name**: `apiKey`
   - **Without Key**: 5 requests/30 seconds (free)
   - **With Key**: 50 requests/30 seconds
   - **Used in**: NVD CVE Database Lookup node
   - **Note**: Can work without key but slower

5. **GitHub Personal Access Token** (optional but recommended)
   - **Where to get**: https://github.com/settings/tokens
   - **n8n Credential Type**: `HTTP Header Auth`
   - **Header Name**: `Authorization`
   - **Header Value Format**: `Bearer YOUR_TOKEN`
   - **Required Scopes**: `repo` (for issues), `public_repo`
   - **Used in**: GitHub Advisory Database, Create GitHub Issues nodes
   - **Note**: Works without token for public queries but with lower rate limits

#### No API Key Required:

- **OSV.dev API**: Free public API, no key needed
  - API Docs: https://google.github.io/osv.dev/

- **EPSS API**: Free public API, no key needed
  - API Docs: https://www.first.org/epss/api

- **GitHub Security Advisory Database**: Free public GraphQL API
  - Works without token (lower rate limits)
  - API Docs: https://docs.github.com/en/graphql/reference/queries#securityadvisory

---

### **AGENT 3: Compliance & Policy Management Workflow**

#### Required Credentials:

1. **Airtable Personal Access Token** ⭐ REQUIRED
   - **Same as Agent 1 & 2** (can reuse)
   - **Used in**: Multiple Airtable nodes throughout workflow
   - **Tables Needed**: 
     - Policy Documents
     - Compliance Requirements (MUST be pre-populated!)
     - Client Compliance Status
     - Generated Policies
     - Azure Policies

2. **PDF.co API Key** ⭐ REQUIRED
   - **Where to get**: https://pdf.co/ (sign up for free account)
   - **n8n Credential Type**: `HTTP Header Auth`
   - **Header Name**: `x-api-key`
   - **Free Tier**: 300 API calls/month
   - **Used in**: Extract Text from PDF node
   - **Alternative Options**:
     - iLovePDF API: https://developer.ilovepdf.com/ (200 calls/month free)
     - Adobe PDF Extract API: https://developer.adobe.com/document-services/apis/pdf-extract/ (500 docs/month free)

3. **Anthropic Claude API Key** ⭐ REQUIRED (used extensively)
   - **Same as Agent 2** (can reuse)
   - **Used in**: 6 different nodes:
     - Analyze Policy with Claude
     - Generate Missing Policy with Claude
     - Map Policies to Technical Controls
     - Generate Azure Policy JSON
     - Generate Terraform Code
     - Generate Compliance Report
   - **Note**: This workflow uses Claude API heavily - monitor usage!

#### Optional Credentials:

4. **Azure Credentials** (only if deploying policies automatically)
   - **Where to get**: Azure Portal > Azure Active Directory > App registrations
   - **n8n Credential Type**: `Azure` or `HTTP Header Auth`
   - **Required**: Service Principal or OAuth token
   - **Used in**: Deploy to Azure node (optional manual approval step)
   - **Note**: Only needed if you want automatic deployment

5. **Slack Bot Token** (for compliance alerts)
   - **Same as Agent 1** (can reuse)
   - **Used in**: Send Compliance Alert node

6. **SMTP Credentials** (for email alerts)
   - **Same as Agent 1** (can reuse)
   - **Used in**: Email alert node (if added)

#### No API Key Required:

- **Mammoth.js**: Built into n8n, no external API needed
  - Used for DOCX text extraction

---

## 📋 COMPLETE CREDENTIALS CHECKLIST

### ⭐ Critical (Required for Basic Functionality)

- [ ] **Airtable Personal Access Token**
  - Get from: https://airtable.com/create/tokens
  - Used in: All 3 workflows
  - **CRITICAL**: Must configure Base and Table selections in each Airtable node

- [ ] **Anthropic Claude API Key**
  - Get from: https://console.anthropic.com/settings/keys
  - Used in: Agent 2, Agent 3
  - **CRITICAL**: Agent 3 uses this extensively (6+ API calls per workflow run)

### Agent 1 Specific:

- [ ] **Shodan API Key** (Agent 1)
- [ ] **SecurityTrails API Key** (Agent 1)
- [ ] **URLScan.io API Key** (Agent 1)
- [ ] **VirusTotal API Key** (Agent 1)
- [ ] **Webhook API Key** (Agent 1 - for webhook authentication)

### Agent 2 Specific:

- [ ] **Snyk API Token** (Agent 2)

### Agent 3 Specific:

- [ ] **PDF.co API Key** (Agent 3)

### Optional (Recommended):

- [ ] **NVD API Key** (Agent 2 - improves rate limits)
- [ ] **GitHub Personal Access Token** (Agent 2 - improves rate limits)
- [ ] **AWS S3 Credentials** (Agent 1 - for report storage)
- [ ] **Slack Bot Token** (Agent 1, Agent 3 - for alerts)
- [ ] **SMTP Credentials** (Agent 1, Agent 3 - for email alerts)
- [ ] **Azure Credentials** (Agent 3 - only if deploying policies)

---

## 🔧 N8N CREDENTIAL CONFIGURATION GUIDE

### How to Configure Credentials in n8n:

1. **Open n8n** → Go to **Credentials** in the sidebar
2. **Click "Add Credential"**
3. **Select the credential type** from the list below
4. **Fill in the required fields**
5. **Test the connection** (if available)
6. **Save** the credential
7. **Assign to nodes** by clicking on each node and selecting the credential

### Credential Types Needed:

#### 1. **Airtable Token API**
- **Type**: `Airtable Token API`
- **Fields**: 
  - Personal Access Token: `[your token]`
- **After creating**: You'll select Base and Table in each Airtable node

#### 2. **HTTP Header Auth** (used for many APIs)
- **Type**: `HTTP Header Auth`
- **Fields**:
  - Name: `[header name]` (e.g., `x-api-key`, `API-Key`, `APIKEY`)
  - Value: `[your API key]`
- **Used for**: SecurityTrails, URLScan.io, VirusTotal, Snyk, Anthropic, PDF.co, NVD, GitHub

#### 3. **Generic Credential Type** (for Shodan)
- **Type**: `Generic Credential Type`
- **Fields**:
  - Add field: `apiKey` = `[your Shodan key]`

#### 4. **AWS** (for S3)
- **Type**: `AWS`
- **Fields**:
  - Access Key ID: `[your key]`
  - Secret Access Key: `[your secret]`
  - Region: `[your region]`

#### 5. **Slack API** (OAuth)
- **Type**: `Slack API`
- **Method**: OAuth (connect to workspace)
- **Scopes**: `chat:write`, `channels:read`

#### 6. **SMTP** (for email)
- **Type**: `SMTP`
- **Fields**:
  - Host: `smtp.gmail.com` (or your SMTP server)
  - Port: `587` (or `465` for SSL)
  - User: `[your email]`
  - Password: `[your password or app password]`
  - Secure: Enable TLS/SSL

---

## 📊 AIRTABLE CONFIGURATION

### Agent 1 Tables:

1. **Scan Targets**
   - Fields: `scan_target_id`, `client_id`, `target_type`, `target_identifier`, `scan_enabled`, `asset_criticality`, `environment`

2. **Scan Results**
   - Fields: `scan_result_id`, `client_id`, `scan_target_id`, `scan_date`, `scan_type`, `risk_score`, `critical_findings`, `high_findings`, `medium_findings`, `low_findings`, `open_ports`, `services_detected`, `scanner_tool`, `status`, `raw_data` (optional)

3. **Scan Findings Detail**
   - Fields: `finding_id`, `scan_result_id`, `client_id`, `finding_type`, `severity`, `title`, `description`, `affected_asset`, `port_protocol`, `cve_id`, `remediation_steps`, `status`, `due_date`, `notes`

### Agent 2 Tables:

1. **Assets**
   - Fields: `asset_id`, `client_id`, `asset_type`, `asset_name`, `asset_identifier`, `operating_system`, `criticality`, `tags`, `scan_enabled`

2. **Vulnerabilities**
   - Fields: `vulnerability_id`, `client_id`, `asset_id`, `cve_id`, `title`, `description`, `severity`, `cvss_score`, `epss_score`, `priority_score`, `priority_level`, `discovered_date`, `due_date`, `status`, `assigned_to`, `remediation_steps`, `package_name`, `package_version`, `fixed_in`, `sla_days`

### Agent 3 Tables:

1. **Policy Documents**
   - Fields: `policy_id`, `client_id`, `filename`, `upload_date`, `content`, `word_count`, `framework`, `extraction_method`, `status`, `policy_type`, `policy_title`, `policy_summary`, `key_requirements`, `technical_controls_needed`, `completeness_score`, `analyzed_date`

2. **Compliance Requirements** ⚠️ **MUST BE PRE-POPULATED**
   - Fields: `requirement_id`, `framework`, `requirement_code`, `requirement_title`, `requirement_description`, `category`, `control_type`, `required`
   - **Critical**: This table must have data before running workflow!
   - **Populate with**: HIPAA (~45), GDPR (~30), SOC2 (~60), ISO27001 (~114), PCI-DSS (~12) requirements

3. **Client Compliance Status**
   - Fields: `client_id`, `requirement_id`, `framework`, `requirement_code`, `requirement_title`, `status`, `policy_id`, `last_assessed`, `next_assessment`

4. **Generated Policies**
   - Fields: `generated_policy_id`, `client_id`, `requirement_id`, `framework`, `policy_name`, `policy_content`, `requirement_code`, `requirement_title`, `category`, `generated_date`, `generated_by`, `status`, `approved`, `word_count`

5. **Azure Policies**
   - Fields: `azure_policy_id`, `client_id`, `policy_document_id`, `policy_name`, `policy_description`, `azure_policy_json`, `terraform_code`, `deployment_status`, `validation_status`, `validation_errors`, `validation_warnings`, `created_date`, `deployed_date`, `framework`

---

## 🚨 CRITICAL SETUP REQUIREMENTS

### Before Running Workflows:

1. **Airtable Setup**:
   - [ ] Create all required tables (see above)
   - [ ] Set up field types correctly
   - [ ] **Agent 3**: Pre-populate Compliance Requirements table with framework data
   - [ ] Test Airtable connection in n8n

2. **API Keys**:
   - [ ] Sign up for all required API accounts
   - [ ] Verify API keys work (use test scripts)
   - [ ] Check free tier limits
   - [ ] Set up rate limiting if needed

3. **n8n Configuration**:
   - [ ] Import all three workflows
   - [ ] Configure all credentials in n8n
   - [ ] Assign credentials to nodes
   - [ ] Configure Airtable Base/Table selections
   - [ ] Test webhook endpoints

4. **Agent 3 Specific**:
   - [ ] **CRITICAL**: Populate Compliance Requirements table
   - [ ] Verify PDF.co API key works
   - [ ] Test Claude API (will be used heavily)

---

## 💰 COST ESTIMATES (Free Tiers)

### Agent 1:
- Shodan: 100 queries/month (free)
- SecurityTrails: 50 queries/month (free)
- URLScan.io: 1,000 scans/month (free)
- VirusTotal: 500 requests/day (free)
- SSL Labs: Unlimited (free, with rate limits)
- **Total**: Free for light usage

### Agent 2:
- Snyk: 200 tests/month (free)
- Anthropic Claude: Pay-per-use (~$0.003 per 1K tokens)
- NVD: Unlimited (free, slower without key)
- OSV.dev: Unlimited (free)
- EPSS: Unlimited (free)
- GitHub: Unlimited public queries (free)
- **Total**: Mostly free, Claude API costs vary

### Agent 3:
- PDF.co: 300 calls/month (free)
- Anthropic Claude: Pay-per-use (used heavily - 6+ calls per workflow)
  - Policy Analysis: ~$0.01-0.05 per policy
  - Policy Generation: ~$0.05-0.15 per policy
  - Technical Controls: ~$0.01-0.03 per policy
  - Azure Policy: ~$0.01-0.03 per policy
  - Terraform: ~$0.01-0.03 per policy
  - Report: ~$0.02-0.05 per report
- **Total**: Free tier covers PDF extraction, Claude costs depend on usage

---

## 🔐 SECURITY BEST PRACTICES

1. **Never commit credentials to Git**
   - Add `api-credentials.env` to `.gitignore`
   - Use environment variables in production

2. **Rotate keys regularly**
   - Set reminders to rotate API keys every 90 days
   - Revoke old keys when creating new ones

3. **Use least privilege**
   - Only grant necessary permissions
   - Use separate keys for dev/prod if possible

4. **Monitor usage**
   - Set up alerts for unusual API usage
   - Track costs for paid APIs (Claude)

5. **Store securely**
   - Use n8n's credential management (encrypted)
   - Don't hardcode keys in workflows
   - Use secret management tools for production

---

## 📝 QUICK REFERENCE: All Credentials at a Glance

| Credential | Workflow | Required | Free Tier | Where to Get |
|------------|----------|----------|-----------|--------------|
| Airtable Token | All 3 | ✅ Yes | 1,200 records/base | https://airtable.com/create/tokens |
| Shodan API Key | Agent 1 | ✅ Yes | 100 queries/month | https://account.shodan.io/ |
| SecurityTrails API Key | Agent 1 | ✅ Yes | 50 queries/month | https://securitytrails.com/ |
| URLScan.io API Key | Agent 1 | ✅ Yes | 1,000 scans/month | https://urlscan.io/user/signup |
| VirusTotal API Key | Agent 1 | ✅ Yes | 500 requests/day | https://www.virustotal.com/ |
| Webhook API Key | Agent 1 | ✅ Yes | N/A | Generate yourself |
| Snyk API Token | Agent 2 | ✅ Yes | 200 tests/month | https://app.snyk.io/account |
| Anthropic Claude API Key | Agent 2, 3 | ✅ Yes | Pay-per-use | https://console.anthropic.com/ |
| PDF.co API Key | Agent 3 | ✅ Yes | 300 calls/month | https://pdf.co/ |
| NVD API Key | Agent 2 | ⚠️ Optional | Unlimited (faster with key) | https://nvd.nist.gov/developers/ |
| GitHub Token | Agent 2 | ⚠️ Optional | Unlimited (higher limits) | https://github.com/settings/tokens |
| AWS S3 | Agent 1 | ⚠️ Optional | Pay-per-use | AWS Console |
| Slack Bot Token | Agent 1, 3 | ⚠️ Optional | Free | https://api.slack.com/apps |
| SMTP | Agent 1, 3 | ⚠️ Optional | Free (Gmail) | Email provider |
| Azure Credentials | Agent 3 | ⚠️ Optional | Pay-per-use | Azure Portal |

---

## ✅ VERIFICATION CHECKLIST

Before running workflows, verify:

- [ ] All required API keys are obtained and working
- [ ] All credentials are configured in n8n
- [ ] All Airtable tables are created with correct fields
- [ ] Agent 3 Compliance Requirements table is populated
- [ ] Webhook URLs are copied and accessible
- [ ] Test API connections using test scripts
- [ ] Monitor API rate limits and usage
- [ ] Set up alerts for API failures

---

**Last Updated**: 2024-01-10  
**Total Credentials Required**: 9 critical + 6 optional = 15 total  
**Estimated Setup Time**: 2-3 hours (signing up for accounts, getting keys, configuring)
