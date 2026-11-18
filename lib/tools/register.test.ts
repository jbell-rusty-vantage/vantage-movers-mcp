import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../../app/api/mcp/route";
import { POST as managerPOST } from "../../app/api/manager-mcp/route";
import { BUSINESS_TOOLS } from "./business";

const SECRET = "synthetic-broad-key";

function rpcRequest(method: string, secret = SECRET, params: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-03-26",
      "x-api-secret": secret,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}

async function rpc(response: Response): Promise<Record<string, any>> {
  assert.equal(response.status, 200, await response.clone().text());
  const text = await response.text();
  return JSON.parse(text.startsWith("event:") ? text.split("\n").find((line) => line.startsWith("data: "))!.slice(6) : text);
}

async function withSecret<T>(run: () => Promise<T>): Promise<T> {
  const prior = process.env.VANTAGE_API_SECRET;
  process.env.VANTAGE_API_SECRET = SECRET;
  try {
    return await run();
  } finally {
    if (prior === undefined) delete process.env.VANTAGE_API_SECRET;
    else process.env.VANTAGE_API_SECRET = prior;
  }
}

test("general endpoint lists the retained tools and no retired intelligence capability", () =>
  withSecret(async () => {
    const names = (await rpc(await POST(rpcRequest("tools/list")))).result.tools.map((tool: { name: string }) => tool.name).sort();
    assert.deepEqual(names, [
      "create_lead", "delete_lead", "find_contact_number", "find_lead_candidates", "get_lead", "get_lead_history",
      "list_leads", "mongo_aggregate", "mongo_collection_indexes", "mongo_collection_schema", "mongo_count",
      "mongo_db_stats", "mongo_find", "mongo_list_collections", "mongo_list_databases", "search_leads",
      "update_lead", "vantage_health",
      ...BUSINESS_TOOLS.map(tool => tool.name),
    ].sort());
  }));

test("general endpoint offers tools and manager prompts, with reporting instructions", () =>
  withSecret(async () => {
    const init = await rpc(await POST(rpcRequest("initialize", SECRET, {
      protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" },
    })));
    // No analysis prompt or envelope schema resource remains.
    assert.deepEqual(Object.keys(init.result.capabilities).sort(), ["prompts", "tools"]);
    assert.match(init.result.instructions, /Vantage Movers LLC/);
    assert.match(init.result.instructions, /find_contact_number/);
    assert.equal((await rpc(await POST(rpcRequest("prompts/list")))).result.prompts.length, 6);
    assert.equal((await rpc(await POST(rpcRequest("resources/list")))).error?.code, -32601);
  }));

test("manager endpoint exposes business reads and prompts without mutations or Mongo", () =>
  withSecret(async () => {
    const names = (await rpc(await managerPOST(rpcRequest("tools/list")))).result.tools.map((t: { name: string }) => t.name);
    assert.ok(names.includes("trace_booking_origin"));
    assert.ok(names.includes("get_business_analytics"));
    assert.ok(names.includes("get_lead_history"));
    assert.ok(!names.some((name: string) => /^(create_|update_|delete_|mongo_)/.test(name)));
    const prompts = await rpc(await managerPOST(rpcRequest("prompts/list")));
    assert.equal(prompts.result.prompts.length, 6);
    const prompt = await rpc(await managerPOST(rpcRequest("prompts/get", SECRET, { name: "source_to_booking_performance", arguments: { period: "last week" } })));
    assert.match(prompt.result.messages[0].content.text, /cohort/);
    assert.equal((await managerPOST(rpcRequest("tools/list", "wrong"))).status, 401);
    const denied = await rpc(await managerPOST(rpcRequest("tools/call", SECRET, { name: "delete_lead", arguments: { kind: "form", id: "aaaaaaaaaaaaaaaaaaaaaaaa", confirm: true } })));
    assert.ok(denied.error || denied.result?.isError);
  }));

test("manager API failures are MCP errors without treating a disabled feature as empty history", () =>
  withSecret(async () => {
    const previous = globalThis.fetch;
    globalThis.fetch = async () => Response.json({ ok: false, error: "Not found" }, { status: 404 });
    try {
      const response = await rpc(await managerPOST(rpcRequest("tools/call", SECRET, { name: "get_lead_history", arguments: { model: "FormLead", id: "aaaaaaaaaaaaaaaaaaaaaaaa" } })));
      assert.equal(response.result.isError, true);
      const payload = JSON.parse(response.result.content[0].text);
      assert.equal(payload.status, 404);
      assert.equal(payload.evidence_coverage.complete_history, "not_guaranteed");
      const health = await rpc(await managerPOST(rpcRequest("tools/call", SECRET, { name: "vantage_health", arguments: {} })));
      assert.equal(health.result.isError, true);
    } finally { globalThis.fetch = previous; }
  }));

test("general endpoint rejects a mismatched secret", () =>
  withSecret(async () => {
    assert.equal((await POST(rpcRequest("tools/list", "wrong"))).status, 401);
  }));
