import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../../app/api/mcp/route";

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
    ]);
  }));

test("general endpoint offers tools only, with general server instructions", () =>
  withSecret(async () => {
    const init = await rpc(await POST(rpcRequest("initialize", SECRET, {
      protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" },
    })));
    // No analysis prompt or envelope schema resource remains.
    assert.deepEqual(Object.keys(init.result.capabilities), ["tools"]);
    assert.match(init.result.instructions, /Vantage Movers LLC/);
    assert.match(init.result.instructions, /find_contact_number/);
    for (const method of ["prompts/list", "resources/list"]) {
      assert.equal((await rpc(await POST(rpcRequest(method)))).error?.code, -32601, method);
    }
  }));

test("general endpoint rejects a mismatched secret", () =>
  withSecret(async () => {
    assert.equal((await POST(rpcRequest("tools/list", "wrong"))).status, 401);
  }));
