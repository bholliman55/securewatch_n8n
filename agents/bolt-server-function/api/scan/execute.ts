import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const N8N_WEBHOOKS: Record<string, string> = {
  vulnerability:      process.env.N8N_WEBHOOK_AGENT_2 ?? '',
  compliance:         process.env.N8N_WEBHOOK_AGENT_3 ?? '',
  penetration_test:   process.env.N8N_WEBHOOK_AGENT_1 ?? '',
  web_application:    process.env.N8N_WEBHOOK_AGENT_1 ?? '',
  network:            process.env.N8N_WEBHOOK_AGENT_1 ?? '',
};

const AGENT_LABELS: Record<string, string> = {
  vulnerability:    'agent-2',
  compliance:       'agent-3',
  penetration_test: 'agent-1',
  web_application:  'agent-1',
  network:          'agent-1',
};

// Scan type → n8n-native scan_type value
const N8N_SCAN_TYPE: Record<string, string> = {
  vulnerability:    'full',
  compliance:       'compliance',
  penetration_test: 'full',
  web_application:  'web_application',
  network:          'full',
};

interface ScanRequest {
  scanId: string;
  scanType: 'vulnerability' | 'compliance' | 'penetration_test' | 'web_application' | 'network';
  target: string;
  clientId?: string;
  framework?: string; // required for compliance scans
}

export async function POST(request: Request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let scanId: string | undefined;

  try {
    const body: ScanRequest = await request.json();
    scanId = body.scanId;
    const { scanType, target, clientId = 'CL001', framework } = body;

    // Validate required fields
    if (!scanId || !scanType || !target) {
      return Response.json(
        { success: false, error: 'Missing required fields: scanId, scanType, target' },
        { status: 400, headers: corsHeaders }
      );
    }

    const webhookUrl = N8N_WEBHOOKS[scanType];
    if (!webhookUrl) {
      return Response.json(
        { success: false, error: `Unsupported scan type: ${scanType}` },
        { status: 400, headers: corsHeaders }
      );
    }

    // Mark scan as running
    await supabase
      .from('scans')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', scanId);

    // Build n8n payload — agent 3 (compliance) needs framework + policy_files
    const n8nPayload =
      scanType === 'compliance'
        ? {
            client_id: clientId,
            framework: framework ?? 'HIPAA',
            policy_files: [],           // UI should populate this for real compliance scans
            scanId,
            timestamp: new Date().toISOString(),
          }
        : {
            client_id: clientId,
            scan_type: N8N_SCAN_TYPE[scanType],
            target,
            scanId,
            priority: 'normal',
            timestamp: new Date().toISOString(),
          };

    // Call the n8n webhook
    const webhookRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.N8N_WEBHOOK_API_KEY!,
      },
      body: JSON.stringify(n8nPayload),
    });

    let webhookData: unknown;
    try {
      webhookData = await webhookRes.json();
    } catch {
      webhookData = { raw: await webhookRes.text() };
    }

    if (!webhookRes.ok) {
      throw new Error(
        `n8n webhook returned ${webhookRes.status}: ${JSON.stringify(webhookData)}`
      );
    }

    // Mark scan as completed with webhook result
    await supabase
      .from('scans')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        result: webhookData,
      })
      .eq('id', scanId);

    return Response.json(
      {
        success: true,
        scanId,
        agent: AGENT_LABELS[scanType],
        status: 'completed',
        webhookResponse: webhookData,
      },
      { status: 200, headers: corsHeaders }
    );

  } catch (error) {
    console.error('Scan execution error:', error);

    // Always update scan status on failure so UI doesn't hang
    if (scanId) {
      await supabase
        .from('scans')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: error instanceof Error ? error.message : 'Unknown error',
        })
        .eq('id', scanId);
    }

    return Response.json(
      {
        success: false,
        scanId,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
