/** Read-only live contract checks. Prints scenario/status only, never records or credentials. */
import { POST } from "../app/api/manager-mcp/route";

const target = process.argv[2] ?? "local";
if (target !== "local" && target !== "https://vantage-movers-mcp.vercel.app/api/manager-mcp") {
  throw new Error("Only local handler or the known production manager URL is supported");
}
const secret = process.env.VANTAGE_API_SECRET;
if (!secret) throw new Error("Configure the existing API credential privately before running");
let sequence = 0;
let passed = 0;
let failed = 0;
let trimmed = 0;

function check(value: unknown, code = "assertion"): asserts value {
  if (!value) throw new Error(`expectation:${code}`);
}
async function rpc(method: string, params: Record<string, unknown> = {}, credential = secret) {
  const request = new Request(target === "local" ? "http://localhost/api/manager-mcp" : target, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "x-api-secret": credential!, "mcp-protocol-version": "2025-03-26" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++sequence, method, params }),
    signal: AbortSignal.timeout(45_000),
  });
  const response = target === "local" ? await POST(request) : await fetch(request);
  if (response.status !== 200) return { httpStatus: response.status };
  const text = await response.text();
  const json = JSON.parse(text.startsWith("event:") ? text.split("\n").find(line => line.startsWith("data: "))!.slice(6) : text);
  return { httpStatus: response.status, ...json };
}
async function tool(name: string, args: Record<string, unknown> = {}, expectError = false) {
  const response = await rpc("tools/call", { name, arguments: args });
  check(response.httpStatus === 200 && !response.error && response.result);
  const payload = JSON.parse(response.result.content[0].text);
  check(Boolean(response.result.isError) === expectError, `tool-${name}-error-state-status-${Number(payload.status ?? 0)}`);
  if (name === "get_business_analytics") check(!payload.output_coverage, "analytics-must-fit-without-transport-trimming");
  if (payload.output_coverage?.reason === "response_budget") { trimmed++; return payload.result; }
  return payload;
}
async function scenario(name: string, run: () => Promise<void>) {
  try { await run(); passed++; console.log(JSON.stringify({ scenario: name, status: "pass" })); }
  catch (error) { failed++; console.log(JSON.stringify({ scenario: name, status: "fail", code: error instanceof Error && /^expectation:[a-z0-9_-]+$/.test(error.message) ? error.message : "details-withheld" })); }
}
async function main() {
let form: any, call: any, booking: any, cancellation: any, catalog: any;
const id = (item: any) => String(item?._id ?? item?.id ?? item?.contact_number_id ?? "");

await scenario("initialize-and-read-only-tool-discovery", async () => {
  const init = await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "vantage-golden-live", version: "1" } });
  check(init.result?.serverInfo.name === "vantage-movers-manager");
  const list = await rpc("tools/list");
  const names: string[] = list.result.tools.map((t: any) => t.name);
  check(names.includes("trace_booking_origin") && !names.some(name => /^(create_|update_|delete_|mongo_)/.test(name)));
});
await scenario("six-review-prompts-available", async () => {
  const list = await rpc("prompts/list");
  check(list.result?.prompts.length === 6);
  const prompt = await rpc("prompts/get", { name: "source_to_booking_performance", arguments: { period: "last month" } });
  check(prompt.result?.messages[0].content.text.includes("cohort"));
});
await scenario("source-agent-and-merchant-catalog", async () => {
  const response = await tool("get_reporting_catalog");
  catalog = response.data.data.catalog;
  check(catalog.source_companies.length > 0 && catalog.source_granularities.length > 0 && catalog.agents.length > 0 && catalog.merchants.length > 0);
});
for (const view of ["overview", "sources", "team", "bookings"]) {
  await scenario(`canonical-${view}-report`, async () => {
    const response = await tool("get_business_analytics", { view, period: "last_month", compare: "previous" });
    const report = response.data.data;
    check(report.period && report.comparison && report.definitions && report.data_quality);
    check(view === "overview" ? report.scorecards : report[view]);
    if (view === "team") check(Array.isArray(report.team.sales_agents) && Array.isArray(report.team.receiver_agents));
    if (view === "sources") check(Array.isArray(report.sources.companies));
    if (view === "bookings") check(report.bookings.cancellations && Array.isArray(report.bookings.merchants));
  });
}
for (const kind of ["form", "call"]) {
  await scenario(`inspect-${kind}-lead-and-history`, async () => {
    const page = await tool("list_leads", { kind, limit: 1 });
    const lead = page.data.data.results[0];
    check(lead && id(lead), "lead-list-has-record");
    const detail = await tool("get_lead", { kind, id: id(lead) });
    check(detail.ok && detail.data.ok, "lead-detail-success");
    const history = await tool("get_lead_history", { model: kind === "form" ? "FormLead" : "CallLead", id: id(lead) });
    check(history.data.data.lead && history.evidence_coverage.complete_history === "not_guaranteed", "history-has-lead-and-coverage");
    check(history.evidence_coverage.source === "materialized_business_facts" && history.evidence_coverage.includes_granot_observations === false, "materialized-history-contract");
    check(Array.isArray(history.data.data.changes) && !("granot_observations" in history.data.data), "history-uses-business-facts");
    if (kind === "form") form = history.data.data; else call = history.data.data;
  });
}
await scenario("all-source-and-rep-ranking-pages-preserve-every-row", async () => {
  for (const view of ["sources", "team"]) {
    const seen = new Map<string, Set<string>>();
    let more = true;
    for (let page = 1; more && page <= 100; page++) {
      const response = await tool("get_business_analytics", { view, period: "last_month", compare: "none", page });
      const report = response.data.data;
      more = false;
      for (const [path, raw] of Object.entries(report.report_scope.arrays)) {
        const scope = raw as { total: number; returned: number; has_next_page: boolean };
        const rows = path.split("/").filter(Boolean).reduce((value: any, key: string) => value[key], report);
        const keys = seen.get(path) ?? new Set<string>();
        for (const row of rows) { check(!keys.has(row.key), "ranking-page-has-no-duplicate-rows"); keys.add(row.key); }
        seen.set(path, keys);
        if (!scope.has_next_page) check(keys.size === scope.total, "ranking-pagination-restores-all-rows");
        more ||= scope.has_next_page;
      }
    }
    check(!more, "ranking-pagination-completes-within-bound");
  }
});
await scenario("official-booking-pagination-and-detail", async () => {
  const first = await tool("list_bookings", { limit: 2, page: 1 });
  const page = first.data.data;
  check(Array.isArray(page.items) && page.total >= page.items.length && page.page === 1);
  booking = page.items.find((item: any) => item.lead_ref) ?? page.items[0];
  check(booking);
  const detail = await tool("get_booking", { id: id(booking) });
  check(detail.data.data && id(detail.data.data) === id(booking));
  if (page.has_next_page) {
    const next = await tool("list_bookings", { limit: 2, page: 2 });
    check(next.data.data.page === 2 && id(next.data.data.items[0]) !== id(page.items[0]));
  }
});
await scenario("exact-booking-origin-with-history-coverage", async () => {
  check(booking);
  const result = await tool("trace_booking_origin", { id: id(booking) });
  const trace = result.data.data;
  check(["linked_lead", "leadless", "referral", "unknown"].includes(trace.origin_status));
  if (trace.origin_status === "linked_lead") check(trace.lead_history.lead && result.evidence_coverage.complete_history === "not_guaranteed");
  else check(trace.lead_history === null);
});
await scenario("official-cancellation-and-refund-detail", async () => {
  const response = await tool("list_cancellations", { limit: 1, page: 1 });
  cancellation = response.data.data.items[0];
  check(cancellation);
  const detail = await tool("get_cancellation", { id: id(cancellation) });
  check(id(detail.data.data) === id(cancellation) && "refund_amount" in detail.data.data);
});
await scenario("merchant-and-sales-agent-booking-filters", async () => {
  check(catalog);
  for (const filter of [{ merchant: catalog.merchants[0].name }, { agent: catalog.agents[0].name }]) {
    const response = await tool("list_bookings", { ...filter, limit: 1 });
    check(response.data.data.total >= 0 && Array.isArray(response.data.data.items));
  }
});
await scenario("ringcentral-number-rollup-and-lead-candidates", async () => {
  const number = [...(call?.contact_numbers ?? []), ...(form?.contact_numbers ?? [])][0];
  check(number, "history-contact-number-available");
  const numberId = id(number);
  check(/^[a-f\d]{24}$/i.test(numberId));
  const response = await tool("find_contact_number", { contact_number_id: numberId });
  check(response.ok && response.data.ok);
  const candidates = await tool("find_lead_candidates", { contact_number_id: numberId });
  check(candidates.ok && candidates.data.ok);
});
await scenario("missing-official-record-is-an-error", async () => {
  const missing = await tool("get_booking", { id: "000000000000000000000000" }, true);
  check(missing.ok === false && missing.status === 404);
});
await scenario("invalid-dates-and-unknown-tool-fail-closed", async () => {
  const invalid = await rpc("tools/call", { name: "list_bookings", arguments: { start_date: "2026-02-30" } });
  check(invalid.error || invalid.result?.isError);
  const mutation = await rpc("tools/call", { name: "delete_lead", arguments: {} });
  check(mutation.error || mutation.result?.isError);
});
await scenario("wrong-credential-is-rejected", async () => {
  check((await rpc("tools/list", {}, "synthetic-invalid-credential")).httpStatus === 401);
});
console.log(JSON.stringify({ target: target === "local" ? "local-handler-live-backend" : "production-manager", passed, failed, transport_trimmed_responses: trimmed, domain_writes: 0 }));
process.exitCode = failed ? 1 : 0;
}
main().catch(() => { console.error("Live verifier failed; record details withheld"); process.exitCode = 1; });
