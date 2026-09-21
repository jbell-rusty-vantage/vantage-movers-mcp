import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { createIntelligenceHandler } from "./handler";
import { authenticateIntelligenceRequest, IntelligenceError, INTELLIGENCE_TOOLS, type RunClaims } from "./auth";
import { createIntelligenceApi, type IntelligenceApi } from "./api";
import { intelligenceContext } from "./context";
import { PROMPT_VERSION, PROMPT_VERSIONS, SCHEMA_DIGEST, SCHEMA_REVISIONS, SCHEMA_TEXT, SCHEMA_URI, toolSchemas } from "./registration";
import artifact from "./generated/intelligence-contract-v1.json";
import { isIntelligenceCredential, authenticateApiSecret } from "../auth";
import { POST as generalMcpPost } from "../../app/api/mcp/route";

const env = { SALES_INTELLIGENCE_SCOPED_API_KEY: "synthetic-dedicated-key", SALES_INTELLIGENCE_RUN_TOKEN_SECRET: "synthetic-only-signing-key-32-characters", SALES_INTELLIGENCE_DEPLOYMENT_ID: "local-csi17", SALES_INTELLIGENCE_DATABASE: "test_csi17", SALES_INTELLIGENCE_API_BASE_URL: "http://127.0.0.1:3101", VANTAGE_API_SECRET: "synthetic-broad-key" };
const run = "aaaaaaaaaaaaaaaaaaaaaaaa";
function claims(overrides: Partial<RunClaims> = {}): RunClaims {
  const now = Math.floor(Date.now() / 1000);
  return {version: "csi-run-token-v1", run_id: run, subject_key: "number:111111111111111111111111", tools: [...INTELLIGENCE_TOOLS], deployment: env.SALES_INTELLIGENCE_DEPLOYMENT_ID, database: env.SALES_INTELLIGENCE_DATABASE, aud: "vantage-csi", nonce: "synthetic-nonce-12345", iat: now, exp: now + 300, lease_epoch: 1, ...overrides};
}
function token(value = claims()) { const payload = Buffer.from(JSON.stringify(value)).toString("base64url"); return `${payload}.${createHmac("sha256", env.SALES_INTELLIGENCE_RUN_TOKEN_SECRET).update(payload).digest("base64url")}`; }
function request(method: string, params: unknown = {}, value = claims()) {
  return new Request("http://localhost/api/intelligence-mcp", {method: "POST", headers: {"content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-03-26", "x-api-secret": env.SALES_INTELLIGENCE_SCOPED_API_KEY, "x-vantage-intelligence-run-token": token(value)}, body: JSON.stringify({jsonrpc: "2.0", id: 1, method, params})});
}
function status(value = claims()) { return {run_id: value.run_id, status: "running", submission: null, prompt_context: {rendered_prompt: `${artifact.prompt_template}\nSynthetic subject ${value.subject_key}`, prompt_version: PROMPT_VERSION, schema_version: artifact.schema_version, schema_digest: SCHEMA_DIGEST, mode: "current_context"}}; }
async function rpc(response: Response): Promise<Record<string, any>> {
  assert.equal(response.status, 200, await response.clone().text());
  const text = await response.text();
  return JSON.parse(text.startsWith("event:") ? text.split("\n").find(line => line.startsWith("data: "))!.slice(6) : text);
}
const api: IntelligenceApi = async (credentials, action, body) => action === "submission" ? status(credentials.claims) : {action, run_id: credentials.claims.run_id, body, snapshot_id: "bbbbbbbbbbbbbbbbbbbbbbbb"};

test("dedicated actual MCP transport discovers exactly authorized tools, prompt and generated schema", async () => {
  const handler = createIntelligenceHandler({env, api});
  const tools = await rpc(await handler(request("tools/list")));
  assert.deepEqual(tools.result.tools.map((tool: {name:string}) => tool.name).sort(), [...INTELLIGENCE_TOOLS].sort());
  // Every served prompt version and schema revision is discoverable: a run
  // pinned to an older one must still be able to read back exactly what it was
  // given, and the current one must be among them (22 §4.2, §4.3).
  const prompts = (await rpc(await handler(request("prompts/list")))).result.prompts.map((p:{name:string}) => p.name);
  assert.deepEqual(prompts.sort(), [...PROMPT_VERSIONS].sort());
  assert.ok(prompts.includes(PROMPT_VERSION));
  const resources = (await rpc(await handler(request("resources/list")))).result.resources.map((r:{uri:string}) => r.uri);
  assert.deepEqual(resources.sort(), SCHEMA_REVISIONS.map(revision => revision.uri).sort());
  assert.ok(resources.includes(SCHEMA_URI));
  for (const revision of SCHEMA_REVISIONS) {
    const served = await rpc(await handler(request("resources/read", {uri: revision.uri})));
    assert.equal(served.result.contents[0].text, revision.text, revision.uri);
  }
  const resource = await rpc(await handler(request("resources/read", {uri: SCHEMA_URI})));
  assert.equal(resource.result.contents[0].text, SCHEMA_TEXT);
  assert.equal(SCHEMA_DIGEST, artifact.schema_digest);
  const prompt = await rpc(await handler(request("prompts/get", {name: PROMPT_VERSION, arguments: {}})));
  assert.equal(prompt.result.messages[0].content.text, status().prompt_context.rendered_prompt);
});

test("actual authorized calls forward strict args through the dedicated server boundary", async () => {
  const handler = createIntelligenceHandler({env, api});
  const result = await rpc(await handler(request("tools/call", {name: "query_operational_records", arguments: {dataset: "ringcentral_users", limit: 20}})));
  assert.deepEqual(JSON.parse(result.result.content[0].text).body, {tool: "query_operational_records", args: {dataset: "ringcentral_users", limit: 20}});
  for (const name of ["mongo_find", "mongo_aggregate", "create_lead", "send_nudge", "fetch_url"]) {
    const denied = await rpc(await handler(request("tools/call", {name, arguments: {}})));
    assert.ok(denied.error || denied.result?.isError, name);
  }
  for (const args of [{dataset: "agents", filter: {$where: "evil"}}, {dataset: "agents", run_id: "foreign"}, {dataset: "agents", actor: "owner"}, {dataset: "agents", limit: 51}, {dataset: "secrets"}]) {
    const denied = await rpc(await handler(request("tools/call", {name: "query_operational_records", arguments: args})));
    assert.ok(denied.error || denied.result?.isError);
  }
});

test("signed allowlist controls listing and direct invocation; contexts stay isolated concurrently", async () => {
  const seen: string[] = [];
  const handler = createIntelligenceHandler({env, api: async (credentials, action) => {
    if (action === "submission") return status(credentials.claims);
    await new Promise(resolve => setTimeout(resolve, credentials.claims.run_id === run ? 12 : 2));
    const current = intelligenceContext("get_intelligence_context");
    assert.equal(current.claims.run_id, credentials.claims.run_id);
    assert.equal(current.token, credentials.token);
    seen.push(current.claims.subject_key);
    return {run_id: current.claims.run_id};
  }});
  const second = claims({run_id: "bbbbbbbbbbbbbbbbbbbbbbbb", subject_key: "number:222222222222222222222222", tools: ["submit_intelligence_analysis", "get_intelligence_context"]});
  const results = await Promise.all([handler(request("tools/call", {name: "get_intelligence_context", arguments: {}})), handler(request("tools/call", {name: "get_intelligence_context", arguments: {}}, second))]);
  for (const response of results) { const parsed = await rpc(response); assert.ok(!parsed.error && !parsed.result?.isError, JSON.stringify(parsed)); }
  assert.equal(results.length, 2); assert.equal(new Set(seen).size, 2);
  const listed = await rpc(await handler(request("tools/list", {}, second)));
  assert.equal(listed.result.tools.length, 2);
  const denied = await rpc(await handler(request("tools/call", {name: "search_leads", arguments: {limit: 20}}, second)));
  assert.ok(denied.error || denied.result?.isError);
  assert.throws(() => intelligenceContext());
});

test("wrong, absent, tampered, expired and foreign credentials fail before server reads", async () => {
  let calls = 0;
  const handler = createIntelligenceHandler({env, api: async () => { calls++; return status(); }});
  const requests = [request("tools/list"), request("tools/list"), request("tools/list"), request("tools/list"), request("tools/list")];
  requests[0]!.headers.delete("x-api-secret");
  requests[1]!.headers.set("x-api-secret", env.VANTAGE_API_SECRET);
  requests[2]!.headers.delete("x-vantage-intelligence-run-token");
  requests[3]!.headers.set("x-vantage-intelligence-run-token", `${token()}tampered`);
  requests[4]!.headers.set("Authorization", "Bearer synthetic-owner"); requests[4]!.headers.delete("x-api-secret");
  for (const overrides of [{exp: 1}, {database: "foreign"}, {deployment: "foreign"}, {aud: "foreign"}, {tools: ["mongo_find"]}, {lease_epoch: 0}, {iat: Math.floor(Date.now()/1000) + 10}]) requests.push(request("tools/list", {}, claims(overrides as Partial<RunClaims>)));
  for (const req of requests) assert.equal((await handler(req)).status, 403);
  assert.equal(calls, 0);
});

test("stored run validation is required for discovery and prompt; failure never exposes backend bodies", async () => {
  const handler = createIntelligenceHandler({env, api: async () => { throw new Error("secret raw transcript body"); }});
  const response = await handler(request("tools/list"));
  assert.equal(response.status, 403); assert.equal((await response.text()).includes("secret"), false);
  const wrong = createIntelligenceHandler({env, api: async () => ({...status(), run_id: "foreign"})});
  assert.equal((await wrong(request("tools/list"))).status, 403);
});

test("intelligence credentials are explicitly rejected by general MCP guard without changing broad auth", () => {
  assert.equal(isIntelligenceCredential(request("tools/list"), env), true);
  assert.equal(isIntelligenceCredential(new Request("http://localhost/api/mcp", {headers: {"x-api-secret": env.SALES_INTELLIGENCE_SCOPED_API_KEY}}), env), true);
  assert.equal(isIntelligenceCredential(new Request("http://localhost/api/mcp", {headers: {Authorization: `Bearer ${token()}`}}), env), true);
  assert.equal(isIntelligenceCredential(new Request("http://localhost/api/mcp", {headers: {"x-api-secret": env.VANTAGE_API_SECRET}}), env), false);
  assert.equal(authenticateApiSecret({provided: {secret: env.VANTAGE_API_SECRET, source: "x-api-secret"}, expectedSecret: env.VANTAGE_API_SECRET}).ok, true);
});

test("actual general MCP endpoint denies intelligence headers and preserves intended broad discovery", async () => {
  const priorBroad = process.env.VANTAGE_API_SECRET;
  const priorScoped = process.env.SALES_INTELLIGENCE_SCOPED_API_KEY;
  process.env.VANTAGE_API_SECRET = env.VANTAGE_API_SECRET;
  process.env.SALES_INTELLIGENCE_SCOPED_API_KEY = env.SALES_INTELLIGENCE_SCOPED_API_KEY;
  try {
    assert.equal((await generalMcpPost(request("tools/call", {name: "mongo_find", arguments: {collection: "anything"}}))).status, 403);
    const broad = request("tools/list"); broad.headers.delete("x-vantage-intelligence-run-token"); broad.headers.set("x-api-secret", env.VANTAGE_API_SECRET);
    const result = await rpc(await generalMcpPost(broad));
    assert.ok(result.result.tools.some((tool: {name:string}) => tool.name === "create_lead"));
    assert.ok(result.result.tools.some((tool: {name:string}) => tool.name === "mongo_find"));
  } finally {
    if (priorBroad === undefined) delete process.env.VANTAGE_API_SECRET; else process.env.VANTAGE_API_SECRET = priorBroad;
    if (priorScoped === undefined) delete process.env.SALES_INTELLIGENCE_SCOPED_API_KEY; else process.env.SALES_INTELLIGENCE_SCOPED_API_KEY = priorScoped;
  }
});

test("API has no production default, forwards both credentials, rejects redirects and never retries uncertain submit", async () => {
  const credentials = authenticateIntelligenceRequest(request("tools/list"), env);
  let calls = 0;
  const client = createIntelligenceApi({env, fetchImpl: async (url, init) => {
    calls++; assert.equal(String(url), `http://127.0.0.1:3101/api/v1/internal/sales-intelligence/runs/${run}/submit`);
    assert.equal(init?.redirect, "error"); assert.equal(new Headers(init?.headers).get("x-api-secret"), env.SALES_INTELLIGENCE_SCOPED_API_KEY);
    assert.equal(new Headers(init?.headers).get("x-vantage-intelligence-run-token"), credentials.token);
    throw new Error("network secret detail");
  }});
  await assert.rejects(() => client(credentials, "submit", {}), /SUBMISSION_DELIVERY_UNKNOWN/);
  assert.equal(calls, 1);
  await assert.rejects(() => createIntelligenceApi({env: {}})(credentials, "submission"), /INTELLIGENCE_UNAVAILABLE/);
});

test("generated schemas reject extra operational envelope fields and prompt args remain closed", () => {
  assert.deepEqual(Object.keys(artifact.tools).sort(), [...INTELLIGENCE_TOOLS].sort());
  assert.equal(toolSchemas.get_intelligence_context.safeParse({run_id: run}).success, false);
  assert.equal(toolSchemas.submit_intelligence_analysis.safeParse({idempotency_key: "synthetic", envelope: {schema_version: "csi-envelope-v1", attention_band: 1}}).success, false);
});

test("submit INVALID_INPUT forwards sanitized issue paths and never echoes envelope text", async () => {
  const credentials = authenticateIntelligenceRequest(request("tools/list"), env);
  const client = createIntelligenceApi({env, fetchImpl: async () => Response.json({
    ok: false, code: "INVALID_INPUT", error: "I will call you Friday after 2.",
    issues: [{ path: "envelope.summary.finding_keys.0", code: "custom" }, { path: "secret quote", code: "custom" }],
  }, {status: 400})});
  await assert.rejects(() => client(credentials, "submit", {}), error => {
    assert.ok(error instanceof IntelligenceError);
    assert.equal(error.code, "INVALID_INPUT");
    assert.deepEqual(error.issues, [{ path: "envelope.summary.finding_keys.0", code: "custom" }]);
    return true;
  });
});

test("server evidence-limit and provider-read errors remain actionable without exposing response details", async () => {
  const credentials = authenticateIntelligenceRequest(request("tools/list"), env);
  for (const code of ["EVIDENCE_LIMIT_REACHED", "PROVIDER_READ_UNAVAILABLE"]) {
    const client = createIntelligenceApi({env, fetchImpl: async () => Response.json({ok: false, code, error: "private provider response"}, {status: 422})});
    await assert.rejects(() => client(credentials, "read", {}), error => error instanceof Error && error.message === code);
  }
});
