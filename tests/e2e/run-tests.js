#!/usr/bin/env node

/**
 * SecureWatch n8n Agents — End-to-End Test Runner
 *
 * Pushes test payloads to n8n webhook endpoints and validates responses.
 * All credentials live in n8n; this only needs the webhook URLs and auth key.
 *
 * Usage:
 *   node run-tests.js              # run all agent tests
 *   node run-tests.js --agent 1    # run agent 1 only
 *   node run-tests.js --agent 2    # run agent 2 only
 *   node run-tests.js --agent 3    # run agent 3 only
 */

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function loadConfig() {
  const configPath = path.join(__dirname, "test-config.env");
  if (!fs.existsSync(configPath)) {
    console.error(
      "ERROR: tests/e2e/test-config.env not found.\n" +
        "Copy test-config.env.example to test-config.env and fill in your values."
    );
    process.exit(1);
  }
  const lines = fs.readFileSync(configPath, "utf-8").split("\n");
  const cfg = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    cfg[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
  return cfg;
}

// ---------------------------------------------------------------------------
// HTTP helper (Node built-in, no deps)
// ---------------------------------------------------------------------------

function httpPost(url, body, headers, timeoutMs) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const lib = parsedUrl.protocol === "https:" ? require("https") : require("http");

    const payload = JSON.stringify(body);
    const opts = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        ...headers,
      },
      timeout: timeoutMs,
    };

    const req = lib.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    });

    req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Test definitions
// ---------------------------------------------------------------------------

const AGENTS_DIR = path.resolve(__dirname, "../../agents");

function loadPayload(agentDir) {
  const p = path.join(AGENTS_DIR, agentDir, "test-payload.json");
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function buildUrl(cfg, webhookPath) {
  const base = cfg.N8N_BASE_URL.replace(/\/$/, "");
  return base + webhookPath;
}

/**
 * Each test returns { pass: boolean, agent: string, details: string, response: any }
 */
const tests = {
  1: {
    name: "Agent 1 — Security Scanner",
    async run(cfg) {
      const url = buildUrl(cfg, cfg.AGENT1_WEBHOOK_PATH);
      const payload = loadPayload("agent-1-security-scanner");
      const timeout = parseInt(cfg.TEST_TIMEOUT_MS) || 120000;
      const headers = { "X-API-Key": cfg.WEBHOOK_API_KEY };

      console.log(`  POST ${url}`);
      console.log(`  Payload: ${JSON.stringify(payload)}`);

      const res = await httpPost(url, payload, headers, timeout);

      const checks = [];
      checks.push({
        name: "HTTP status is 200",
        pass: res.status === 200,
        detail: `got ${res.status}`,
      });

      if (typeof res.body === "object" && res.body !== null) {
        checks.push({
          name: "Response has status field",
          pass: "status" in res.body,
          detail: JSON.stringify(res.body).slice(0, 300),
        });
        checks.push({
          name: "Response has scan_result_id or equivalent",
          pass:
            "scan_result_id" in res.body ||
            "scanResultId" in res.body ||
            "result_id" in res.body,
          detail: Object.keys(res.body).join(", "),
        });
        if (res.body.risk_score !== undefined) {
          checks.push({
            name: "risk_score is a number",
            pass: typeof res.body.risk_score === "number",
            detail: `risk_score=${res.body.risk_score}`,
          });
        }
      } else {
        checks.push({
          name: "Response is JSON object",
          pass: false,
          detail: `got ${typeof res.body}: ${String(res.body).slice(0, 200)}`,
        });
      }

      return { agent: "Agent 1", checks, response: res };
    },
  },

  2: {
    name: "Agent 2 — Vulnerability Assessment",
    async run(cfg) {
      const url = buildUrl(cfg, cfg.AGENT2_WEBHOOK_PATH);
      const payload = loadPayload("agent-2-vulnerability-assessment");
      const timeout = parseInt(cfg.TEST_TIMEOUT_MS) || 120000;
      const headers = { "X-API-Key": cfg.WEBHOOK_API_KEY };

      console.log(`  POST ${url}`);
      console.log(`  Payload: ${JSON.stringify(payload)}`);

      const res = await httpPost(url, payload, headers, timeout);

      const checks = [];
      checks.push({
        name: "HTTP status is 200",
        pass: res.status === 200,
        detail: `got ${res.status}`,
      });

      if (typeof res.body === "object" && res.body !== null) {
        checks.push({
          name: "Response has status field",
          pass: "status" in res.body,
          detail: JSON.stringify(res.body).slice(0, 300),
        });
        checks.push({
          name: "Response has vulnerability count fields",
          pass:
            "vulnerabilities_found" in res.body ||
            "total" in res.body ||
            "assets_scanned" in res.body,
          detail: Object.keys(res.body).join(", "),
        });
        if (res.body.vulnerabilities_found !== undefined) {
          checks.push({
            name: "vulnerabilities_found is a number",
            pass: typeof res.body.vulnerabilities_found === "number",
            detail: `vulnerabilities_found=${res.body.vulnerabilities_found}`,
          });
        }
      } else {
        checks.push({
          name: "Response is JSON object",
          pass: false,
          detail: `got ${typeof res.body}: ${String(res.body).slice(0, 200)}`,
        });
      }

      return { agent: "Agent 2", checks, response: res };
    },
  },

  3: {
    name: "Agent 3 — Compliance & Policy Management",
    async run(cfg) {
      const url = buildUrl(cfg, cfg.AGENT3_WEBHOOK_PATH);
      const payload = loadPayload("agent-3-compliance");
      const timeout = parseInt(cfg.TEST_TIMEOUT_MS) || 120000;
      const headers = { "X-API-Key": cfg.WEBHOOK_API_KEY };

      console.log(`  POST ${url}`);
      console.log(`  Payload: ${JSON.stringify(payload)}`);

      const res = await httpPost(url, payload, headers, timeout);

      const checks = [];
      checks.push({
        name: "HTTP status is 200",
        pass: res.status === 200,
        detail: `got ${res.status}`,
      });

      if (typeof res.body === "object" && res.body !== null) {
        checks.push({
          name: "Response has status field",
          pass: "status" in res.body,
          detail: JSON.stringify(res.body).slice(0, 300),
        });
        checks.push({
          name: "Response has compliance fields",
          pass:
            "compliance_score" in res.body ||
            "gaps_found" in res.body ||
            "policies_analyzed" in res.body,
          detail: Object.keys(res.body).join(", "),
        });
      } else {
        checks.push({
          name: "Response is JSON object",
          pass: false,
          detail: `got ${typeof res.body}: ${String(res.body).slice(0, 200)}`,
        });
      }

      return { agent: "Agent 3", checks, response: res };
    },
  },
};

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function runTest(num, cfg) {
  const test = tests[num];
  if (!test) {
    console.error(`No test defined for agent ${num}`);
    return { agent: `Agent ${num}`, pass: false, checks: [] };
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Running: ${test.name}`);
  console.log("=".repeat(60));

  try {
    const result = await test.run(cfg);
    let allPass = true;

    for (const check of result.checks) {
      const icon = check.pass ? "PASS" : "FAIL";
      console.log(`  [${icon}] ${check.name} — ${check.detail}`);
      if (!check.pass) allPass = false;
    }

    console.log(
      `\n  Result: ${allPass ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"}`
    );

    if (!allPass) {
      console.log(
        `  Full response (status ${result.response.status}):`,
        JSON.stringify(result.response.body, null, 2).slice(0, 1000)
      );
    }

    return { agent: result.agent, pass: allPass, checks: result.checks };
  } catch (err) {
    console.log(`  [FAIL] ${err.message}`);
    return {
      agent: `Agent ${num}`,
      pass: false,
      checks: [{ name: "Request succeeded", pass: false, detail: err.message }],
    };
  }
}

async function main() {
  const cfg = loadConfig();

  // Parse --agent flag
  const args = process.argv.slice(2);
  const agentIdx = args.indexOf("--agent");
  let agentsToRun = [1, 2, 3];
  if (agentIdx !== -1 && args[agentIdx + 1]) {
    agentsToRun = [parseInt(args[agentIdx + 1])];
  }

  console.log("SecureWatch n8n Agents — E2E Test Runner");
  console.log(`Base URL: ${cfg.N8N_BASE_URL}`);
  console.log(`Agents to test: ${agentsToRun.join(", ")}`);

  const results = [];
  for (const num of agentsToRun) {
    results.push(await runTest(num, cfg));
  }

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log("SUMMARY");
  console.log("=".repeat(60));

  let exitCode = 0;
  for (const r of results) {
    const icon = r.pass ? "PASS" : "FAIL";
    console.log(`  [${icon}] ${r.agent}`);
    if (!r.pass) exitCode = 1;
  }

  console.log(`\nTotal: ${results.length} | Passed: ${results.filter((r) => r.pass).length} | Failed: ${results.filter((r) => !r.pass).length}`);
  process.exit(exitCode);
}

main();
