import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../../app/api/manager-mcp/route";

// Synthetic business facts, not production snapshots. Every upstream request is
// intercepted. Unexpected requests fail rather than reaching a real service.
const KEY = "synthetic-golden-key";
const FORM = "aaaaaaaaaaaaaaaaaaaaaaaa";
const CALL = "bbbbbbbbbbbbbbbbbbbbbbbb";
const BOOKING = "cccccccccccccccccccccccc";
const CANCEL = "dddddddddddddddddddddddd";
const EARLIER_BOOKING = "eeeeeeeeeeeeeeeeeeeeeeee";
const PHONE = "+12025550124";
const PREFIX = "/api/v1/internal/sales-intelligence/history";
const metric = (value: number | null, kind = "count") => ({ value, comparison_value: null, delta: null, delta_pct: null, kind, better: "none", tone: "neutral", small_base: true });
const row = (key: string, label: string, metrics: Record<string, unknown>) => ({ key, label, rank: 1, rank_change: null, is_new: true, metrics });
const report = {
  generated_at: "2026-11-09T15:00:00.000Z",
  period: { preset: "custom", start: "2026-11-01", end: "2026-11-08", end_exclusive: "2026-11-09", days: 8, includes_today: false, bucket: "day", label: "Nov 1–8, 2026" },
  comparison: { mode: "previous", start: "2026-10-24", end: "2026-10-31", end_exclusive: "2026-11-01", days: 8, coverage: "partial" },
  sources_filter: ["fixture_source"], source_options: [{ key: "fixture_source", label: "Fixture Source", feeds: [{ key: "fixture_form", label: "Fixture Forms" }] }],
  scorecards: { leads: metric(10), bookings: metric(3), booking_rate: metric(0.3, "rate"), binder: metric(3000, "money"), lead_spend: metric(1000, "money"), duplicates: metric(2), bad_calls: metric(1) },
  series: { bucket: "day", current: [], comparison: [] }, movers: [],
  data_quality: { unpriced_leads: 1, unmapped_leads: 1, receiver_attribution: 0.9, unattributed_bookings: 1 },
  sources: { companies: [row("fixture_source", "Fixture Source", { leads: metric(10), booked: metric(2), booking_rate: metric(0.2, "rate"), spend: metric(1000, "money") })], cohort_maturing: true, local_vs_long_distance: [], pickup_states: [], lanes: [] },
  team: { sales_agents: [row("alice", "Fixture Alice", { bookings: metric(2), binder: metric(1800, "money") }), row("bob", "Fixture Bob", { bookings: metric(2), binder: metric(1200, "money") })], receiver_agents: [row("casey", "Fixture Casey", { leads: metric(10), booked: metric(2), booking_rate: metric(0.2, "rate") })] },
  bookings: { merchants: [row("fixture_merchant", "Fixture Merchant", { bookings: metric(3), binder: metric(3000, "money") })], mix: [], time_to_book: { median_days: 2, comparison_median_days: null, measured: 2, buckets: [] }, cancellations: { count: metric(1), refunds: metric(250, "money"), rate: metric(1 / 3, "rate"), reasons: [{ key: "customer", label: "Customer changed plans", count: 1, comparison_count: 0 }], by_source: [], by_rep: [], timing: { booked_in_period: 0, booked_earlier: 1 } } },
  definitions: { booking_rate: "Bookings in the period divided by leads in the period (activity).", conversion: "Of the leads arriving in the period, the share booked as of now (cohort).", split_credit: "Split bookings count once for each agent, with allocated binder and deposit shares.", lead_spend: "Live feed-day pricing; duplicates and Bad Calls cost zero." },
};
const form = { _id: FORM, name: "Fixture Customer", phone_number: PHONE, job_no: "FIX-100", source_company: "fixture_source", source_granularity_key: "fixture_form", ingestion_origin: "wordpress_form", receiver_agent: "casey", booked: BOOKING };
const call = { _id: CALL, name: "Fixture Customer", phone_number: PHONE, source_company: "fixture_source", source_granularity_key: "fixture_call", ingestion_origin: "ringcentral", form_fill: true, call_qualification: { qualified: true, qualification_version: "fixture" } };
const booking = { _id: BOOKING, job_no: "FIX-100", lead_model: "FormLead", lead_ref: form, source: "Fixture Source", book_date: "2026-11-08T00:00:00.000Z", merchant: "Fixture Merchant", total_binder_amount: 1000, deposit_amount: 400, agent_allocations: [{ agent_name_snapshot: "Fixture Alice", binder_amount: 600 }, { agent_name_snapshot: "Fixture Bob", binder_amount: 400 }] };
const cancellation = { _id: CANCEL, booked_lead: EARLIER_BOOKING, job_no: "FIX-090", book_date: "2026-10-15T00:00:00.000Z", cancel_date: "2026-11-08T00:00:00.000Z", refund_amount: 250, source: "Fixture Source", reason: "Customer changed plans" };
const history = { lead: { model: "FormLead", id: FORM, ingestion_origin: "wordpress_form", source_company: "fixture_source", receiver_agent_id: "casey", flags: { booked: true, cancelled: false } }, contact_numbers: [{ contact_number_id: CALL, e164: PHONE, link: "lead", link_source: "owner" }], changes: [], granot_observations: [{ id: "fixture-older-observation", job_no: "FIX-100", captured_at: "2026-10-01T12:00:00.000Z", priority: "Quoted" }], bookings: [{ id: BOOKING, job_no: "FIX-100" }], cancellations: [], messages: [] };

type Expected = { path: string; method?: string; data?: unknown; status?: number; inspect?: (url: URL, init: RequestInit) => void };
async function decode(response: Response) {
  assert.equal(response.status, 200);
  const body = await response.text();
  return JSON.parse(body.startsWith("event:") ? body.split("\n").find(line => line.startsWith("data: "))!.slice(6) : body);
}
async function fixture(expected: Expected[], run: (h: { rpc: (method: string, params?: Record<string, unknown>) => Promise<any>; tool: (name: string, args?: Record<string, unknown>) => Promise<{ wire: any; body: any }> }) => Promise<void>) {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.VANTAGE_API_SECRET;
  const previousBase = process.env.VANTAGE_API_BASE_URL;
  process.env.VANTAGE_API_SECRET = KEY;
  process.env.VANTAGE_API_BASE_URL = "https://synthetic.invalid";
  const pending = [...expected];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const next = pending.shift();
    assert.ok(next, `Unexpected upstream request: ${url.pathname}`);
    assert.equal(url.host, "synthetic.invalid");
    assert.equal(url.pathname, next.path);
    assert.equal(init.method, next.method ?? "GET");
    assert.equal(new Headers(init.headers).get("x-api-secret"), KEY);
    next.inspect?.(url, init);
    return Response.json(next.data, { status: next.status ?? 200 });
  };
  const rpc = async (method: string, params: Record<string, unknown> = {}) => decode(await POST(new Request("http://localhost/api/manager-mcp", {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-03-26", "x-api-secret": KEY },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  })));
  try {
    await run({ rpc, tool: async (name, args = {}) => {
      const result = await rpc("tools/call", { name, arguments: args });
      assert.ok(result.result, JSON.stringify(result.error));
      return { wire: result.result, body: JSON.parse(result.result.content[0].text) };
    } });
    assert.equal(pending.length, 0, "Fixture did not exercise every expected upstream request");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.VANTAGE_API_SECRET; else process.env.VANTAGE_API_SECRET = previousKey;
    if (previousBase === undefined) delete process.env.VANTAGE_API_BASE_URL; else process.env.VANTAGE_API_BASE_URL = previousBase;
  }
}
const success = (data: unknown) => ({ ok: true, data });
const reportRequest = { period: "custom", from: "2026-11-01", to: "2026-11-08", sources: ["fixture_source"] };

test("G01–G04: company activity, source cohorts, split rep credit and merchant/cancellation reports remain distinct", async t => {
  for (const view of ["overview", "sources", "team", "bookings"]) await t.test(view, () => fixture([{ path: "/api/v1/admin/insights/analytics", data: success(report), inspect: url => {
    assert.equal(url.searchParams.get("from"), "2026-11-01");
    assert.equal(url.searchParams.get("to"), "2026-11-08");
    assert.equal(url.searchParams.get("sources"), "fixture_source");
  } }], async ({ tool }) => {
    const { wire, body } = await tool("get_business_analytics", { ...reportRequest, view });
    assert.equal(wire.isError, false);
    const actual = body.data.data;
    assert.equal(actual.comparison.coverage, "partial");
    assert.equal(actual.data_quality.unpriced_leads, 1);
    assert.equal(actual.period.end_exclusive, "2026-11-09");
    assert.deepEqual(actual.definitions, report.definitions);
    if (view === "overview") { assert.equal(actual.scorecards.bookings.value, 3); assert.equal(actual.scorecards.booking_rate.value, 0.3); assert.equal(actual.sources, undefined); }
    if (view === "sources") { assert.equal(actual.sources.companies[0].metrics.booked.value, 2); assert.equal(actual.sources.companies[0].metrics.booking_rate.value, 0.2); assert.equal(actual.sources.cohort_maturing, true); assert.equal(actual.scorecards.bookings.value, 3); }
    if (view === "team") { assert.equal(actual.team.sales_agents.reduce((sum: number, rep: any) => sum + rep.metrics.bookings.value, 0), 4); assert.equal(actual.team.receiver_agents[0].key, "casey"); assert.equal(actual.team.receiver_agents[0].metrics.booked.value, 2); }
    if (view === "bookings") { assert.equal(actual.bookings.merchants[0].metrics.bookings.value, 3); assert.equal(actual.bookings.cancellations.refunds.value, 250); assert.equal(actual.bookings.cancellations.timing.booked_earlier, 1); }
  }));
});

test("G05: catalog preserves inactive Agents and merchants without treating them as missing", () => fixture([{ path: "/api/v1/admin/facets", data: success({ catalog: { source_companies: [{ id: FORM, company_slug: "fixture_source", owner_label: "Fixture Source", active: true }], source_granularities: [], agents: [{ id: CALL, name: "Fixture Former Rep", active: false }], merchants: [{ id: BOOKING, name: "Fixture Merchant", active: true }] } }) }], async ({ tool }) => {
  const { body } = await tool("get_reporting_catalog");
  assert.equal(body.data.data.catalog.agents[0].active, false);
  assert.equal(body.data.data.catalog.merchants[0].name, "Fixture Merchant");
}));

test("G06–G08: inspect Form/Call Leads and perform identity search without a write", () => fixture([
  { path: `/api/v1/form-leads/${FORM}`, data: success(form) },
  { path: `/api/v1/admin/call-leads/${CALL}`, data: success(call) },
  { path: "/api/v1/form-leads/search", method: "POST", data: success({ candidates: [{ lead: form, score: 100 }] }), inspect: (_url, init) => assert.deepEqual(JSON.parse(String(init.body)), { phone_number: PHONE, include_duplicates: true }) },
], async ({ tool }) => {
  assert.equal((await tool("get_lead", { kind: "form", id: FORM })).body.data.data.ingestion_origin, "wordpress_form");
  const inspected = (await tool("get_lead", { kind: "call", id: CALL })).body.data.data;
  assert.equal(inspected.form_fill, true);
  assert.equal(inspected.call_qualification.qualified, true);
  assert.equal(inspected.source_granularity_key, "fixture_call");
  assert.equal((await tool("search_leads", { kind: "form", phone_number: PHONE, include_duplicates: true })).body.data.data.candidates[0].lead._id, FORM);
}));

test("G09: Lead browse passes explicit source and pagination without calling Mongo", () => fixture([{ path: "/api/v1/call-leads", data: success({ results: [call], count: 1 }), inspect: url => {
  assert.equal(url.searchParams.get("source_company"), "fixture_source"); assert.equal(url.searchParams.get("skip"), "20"); assert.equal(url.searchParams.get("limit"), "10");
} }], async ({ tool }) => { const actual = (await tool("list_leads", { kind: "call", source_company: "fixture_source", skip: 20, limit: 10 })).body.data.data; assert.equal(actual.results[0]._id, CALL); assert.equal(actual.count, 1); }));

test("G10–G11: Booking page/date filters and exact detail retain pagination, merchant and allocation facts", () => fixture([
  { path: "/api/v1/admin/booked-leads", data: success({ items: [booking], page: 2, limit: 1, total: 3, has_next_page: true }), inspect: url => {
    for (const [key, value] of Object.entries({ from: "2026-11-01T00:00:00.000Z", to: "2026-11-08T23:59:59.999Z", page: "2", limit: "1", merchant: "Fixture Merchant", agent: "Fixture Alice", source: "Fixture Source", database_scope: "production" })) assert.equal(url.searchParams.get(key), value);
  } }, { path: `/api/v1/admin/booked-leads/${BOOKING}`, data: success(booking) },
], async ({ tool }) => {
  const page = (await tool("list_bookings", { start_date: "2026-11-01", end_date: "2026-11-08", merchant: "Fixture Merchant", agent: "Fixture Alice", source: "Fixture Source", page: 2, limit: 1 })).body.data.data;
  assert.equal(page.total, 3); assert.equal(page.has_next_page, true); assert.equal(page.items.length, 1);
  const detail = (await tool("get_booking", { id: BOOKING })).body.data.data;
  assert.equal(detail.lead_ref.receiver_agent, "casey"); assert.equal(detail.agent_allocations[0].agent_name_snapshot, "Fixture Alice"); assert.equal(detail.total_binder_amount, 1000);
}));

test("G12–G13: Cancellation inspection preserves official refund and filters separately from Booking activity", () => fixture([
  { path: "/api/v1/admin/cancelled-leads", data: success({ items: [cancellation], page: 1, limit: 25, total: 1, has_next_page: false }), inspect: url => {
    assert.equal(url.searchParams.get("date_field"), "cancel_date"); assert.equal(url.searchParams.get("refund_min"), "200"); assert.equal(url.searchParams.get("to"), "2026-11-08T23:59:59.999Z");
  } }, { path: `/api/v1/admin/cancelled-leads/${CANCEL}`, data: success(cancellation) },
], async ({ tool }) => {
  const page = (await tool("list_cancellations", { date_field: "cancel_date", start_date: "2026-11-08", end_date: "2026-11-08", refund_min: 200 })).body.data.data;
  assert.equal(page.items[0].refund_amount, 250);
  assert.equal((await tool("get_cancellation", { id: CANCEL })).body.data.data.booked_lead, EARLIER_BOOKING);
}));

test("G14: origin trace follows only the saved Form link despite a same-phone Call", () => fixture([
  { path: `/api/v1/admin/booked-leads/${BOOKING}`, data: success(booking) },
  { path: `${PREFIX}/lead`, data: success(history), inspect: url => { assert.equal(url.searchParams.get("model"), "FormLead"); assert.equal(url.searchParams.get("id"), FORM); } },
], async ({ tool }) => {
  const { wire, body } = await tool("trace_booking_origin", { id: BOOKING });
  assert.equal(wire.isError, false); assert.equal(body.data.data.origin_status, "linked_lead");
  assert.equal(body.data.data.lead_history.lead.ingestion_origin, "wordpress_form");
  assert.equal(body.data.data.lead_history.granot_observations[0].captured_at, "2026-10-01T12:00:00.000Z");
  assert.equal(body.data.data.lead_history.contact_numbers[0].contact_number_id, CALL);
  assert.equal(body.evidence_coverage.complete_history, "not_guaranteed");
}));

test("G15–G17: Referral, Leadless and unknown origins never create a phone-based attribution", async t => {
  for (const [flags, expected] of [[{ is_referral_booking: true }, "referral"], [{ is_leadless_booking: true }, "leadless"], [{}, "unknown"]] as const) await t.test(expected, () => fixture([{ path: `/api/v1/admin/booked-leads/${BOOKING}`, data: success({ ...flags, phone_number: PHONE, job_no: "FIX-100" }) }], async ({ tool }) => {
    const actual = (await tool("trace_booking_origin", { id: BOOKING })).body.data.data;
    assert.equal(actual.origin_status, expected); assert.equal(actual.lead_history, null);
  }));
});

test("G18–G19: settled number summary and candidate exclusions survive a call inspection", () => fixture([
  { path: `${PREFIX}/contact-number`, data: success({ contact_number: { id: CALL, e164: PHONE, calls: { inbound: 3, outbound: 1, missed: 1 }, waiting_since: "2026-11-09T14:00:00.000Z", last_call: { direction: "Inbound", result: "Missed", at: "2026-11-09T14:00:00.000Z", duration_seconds: 45 } }, lead: { id: FORM, model: "FormLead" }, other_leads: [{ id: CALL, model: "CallLead" }], lead_link: { source: "owner", excluded: [{ model: "CallLead", id: CALL }] } }) },
  { path: `${PREFIX}/lead-candidates`, data: success({ subject: { contact_number_id: CALL, e164: PHONE, as_of: "2026-11-09T15:00:00.000Z" }, candidates: [{ lead_ref: { id: FORM, model: "FormLead" }, basis: ["phone:normalized_phone_number"], link: "lead" }, { lead_ref: { id: CALL, model: "CallLead" }, basis: ["phone:normalized_phone_number"], link: "excluded" }] }), inspect: url => assert.deepEqual(url.searchParams.getAll("reference"), ["FIX-100", "form reference"]) },
], async ({ tool }) => {
  const number = (await tool("find_contact_number", { phone: PHONE })).body.data.data;
  assert.equal(number.contact_number.waiting_since, "2026-11-09T14:00:00.000Z"); assert.equal(number.contact_number.calls.missed, 1); assert.equal(number.lead_link.excluded[0].id, CALL);
  const candidates = (await tool("find_lead_candidates", { phone: PHONE, reference_mentions: ["FIX-100", "form reference"] })).body.data.data.candidates;
  assert.equal(candidates.length, 2); assert.equal(candidates[1].link, "excluded");
}));

test("G20–G22: archive failure, unavailable history and missing official Booking are errors, not empty evidence", async t => {
  for (const [name, toolName, args, response] of [
    ["archive integrity failure", "get_lead_history", { model: "FormLead", id: FORM }, { path: `${PREFIX}/lead`, status: 500, data: { ok: false, error: "Archive verification unavailable" } }],
    ["disabled history", "get_lead_history", { model: "CallLead", id: CALL }, { path: `${PREFIX}/lead`, status: 404, data: { ok: false, error: "Not found" } }],
    ["missing Booking", "get_booking", { id: BOOKING }, { path: `/api/v1/admin/booked-leads/${BOOKING}`, status: 404, data: { ok: false, error: "Not found" } }],
  ] as const) await t.test(name, () => fixture([response], async ({ tool }) => { const { wire, body } = await tool(toolName, args); assert.equal(wire.isError, true); assert.equal(body.ok, false); assert.equal(body.status, response.status); }));
});

test("G23: linked origin trace fails closed on archive error while retaining official Booking context", () => fixture([
  { path: `/api/v1/admin/booked-leads/${BOOKING}`, data: success(booking) },
  { path: `${PREFIX}/lead`, status: 500, data: { ok: false, error: "Archive verification unavailable" } },
], async ({ tool }) => { const { wire, body } = await tool("trace_booking_origin", { id: BOOKING }); assert.equal(wire.isError, true); assert.equal(body.data.booking._id, BOOKING); assert.equal(body.data.history_error.ok, false); }));

test("G24: oversized page keeps totals, parseable whole records and explicit transport omissions", () => {
  const items = Array.from({ length: 50 }, (_, index) => ({ _id: index.toString().padStart(24, "0"), merchant: "Fixture Merchant", notes: "synthetic record ".repeat(250) }));
  return fixture([{ path: "/api/v1/admin/booked-leads", data: success({ items, page: 1, limit: 50, total: 100, has_next_page: true }) }], async ({ tool }) => {
    const { wire, body } = await tool("list_bookings", { limit: 50 });
    assert.equal(wire.isError, false); assert.equal(body.output_coverage.complete, false);
    const page = body.result.data.data;
    assert.equal(page.total, 100); assert.equal(page.has_next_page, true);
    assert.equal(page.items.length + body.output_coverage.omitted_array_items["/data/data/items"], 50);
    assert.ok(page.items.every((item: any) => item.notes === items[0]!.notes));
  });
});

test("G25–G27: invalid dates, ignored filters and mutation attempts never reach the backend", () => fixture([], async ({ rpc }) => {
  for (const [name, args] of [["list_bookings", { start_date: "2026-11-09", end_date: "2026-11-01" }], ["list_bookings", { source_granularity_key: "not_a_supported_booking_filter" }], ["delete_lead", { kind: "form", id: FORM, confirm: true }], ["create_lead", { kind: "call", job_no: "FIX-100" }], ["mongo_find", { collection: "booked_leads" }]] as const) {
    const result = await rpc("tools/call", { name, arguments: args }); assert.ok(result.error || result.result?.isError, name);
  }
}));

test("G28: manager discovery and prompts disclose access and evidence boundaries", () => fixture([], async ({ rpc }) => {
  const init = await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "golden-fixtures", version: "1" } });
  assert.match(init.result.instructions, /signed-dashboard-only intake queues/);
  const tools = (await rpc("tools/list")).result.tools.map((tool: any) => tool.name);
  assert.ok(!tools.some((name: string) => /^(create_|delete_|update_|mongo_)/.test(name)));
  for (const name of ["source_to_booking_performance", "rep_performance", "ringcentral_followup", "intake_review"]) {
    const prompt = await rpc("prompts/get", { name, arguments: { period: "November 1–8, 2026" } });
    const text = prompt.result.messages[0].content.text;
    assert.match(text, /America\/New_York/); assert.match(text, /cohort/); assert.match(text, /unknown/);
  }
}));

test("G29: all source ranking pages reconstruct exact company keys and retain their feed children", () => {
  const companies = Array.from({ length: 7 }, (_, index) => ({ ...row(`source-${index}`, `Source ${index}`, { leads: metric(index + 1) }), children: Array.from({ length: 5 }, (_, feed) => row(`source-${index}-feed-${feed}`, `Feed ${feed}`, { leads: metric(1) })) }));
  const pagedReport = { ...report, sources: { ...report.sources, companies } };
  return fixture(Array.from({ length: 3 }, () => ({ path: "/api/v1/admin/insights/analytics", data: success(pagedReport) })), async ({ tool }) => {
    const keys: string[] = [];
    for (const page of [1, 2, 3]) {
      const { wire, body } = await tool("get_business_analytics", { ...reportRequest, view: "sources", page, page_size: 3 });
      assert.equal(wire.isError, false); assert.equal(body.output_coverage, undefined);
      const actual = body.data.data;
      const scope = actual.report_scope.arrays["/sources/companies"];
      assert.equal(scope.total, 7); assert.equal(scope.returned, page === 3 ? 1 : 3); assert.equal(scope.has_next_page, page < 3);
      assert.equal(actual.scorecards.bookings.value, 3);
      for (const company of actual.sources.companies) {
        keys.push(company.key);
        assert.deepEqual(company.children.map((child: any) => child.key), Array.from({ length: 5 }, (_, feed) => `${company.key}-feed-${feed}`));
      }
    }
    assert.deepEqual(keys, companies.map(company => company.key)); assert.equal(new Set(keys).size, 7);
  });
});

test("G30: team pages independently reconstruct all sales and receiver rows without treating page totals as company totals", () => {
  const sales = Array.from({ length: 7 }, (_, index) => row(`sales-${index}`, `Sales ${index}`, { bookings: metric(1) }));
  const receivers = Array.from({ length: 4 }, (_, index) => row(`receiver-${index}`, `Receiver ${index}`, { leads: metric(2) }));
  const pagedReport = { ...report, team: { sales_agents: sales, receiver_agents: receivers } };
  return fixture(Array.from({ length: 3 }, () => ({ path: "/api/v1/admin/insights/analytics", data: success(pagedReport) })), async ({ tool }) => {
    const allSales: string[] = [], allReceivers: string[] = [];
    for (const page of [1, 2, 3]) {
      const actual = (await tool("get_business_analytics", { ...reportRequest, view: "team", page, page_size: 3 })).body.data.data;
      allSales.push(...actual.team.sales_agents.map((rep: any) => rep.key)); allReceivers.push(...actual.team.receiver_agents.map((rep: any) => rep.key));
      assert.equal(actual.report_scope.arrays["/team/sales_agents"].total, 7);
      assert.equal(actual.report_scope.arrays["/team/receiver_agents"].total, 4);
      assert.equal(actual.report_scope.arrays["/team/sales_agents"].has_next_page, page < 3);
      assert.equal(actual.report_scope.arrays["/team/receiver_agents"].has_next_page, page < 2);
      assert.equal(actual.scorecards.bookings.value, 3);
    }
    assert.deepEqual(allSales, sales.map(rep => rep.key)); assert.deepEqual(allReceivers, receivers.map(rep => rep.key));
    assert.equal(new Set(allSales).size, sales.length); assert.equal(new Set(allReceivers).size, receivers.length);
  });
});

test("G31: source breakdown selection is explicit and sparkline series are omitted by default but complete on opt-in", () => {
  const series = Array.from({ length: 4 }, (_, index) => ({ day: `2026-11-0${index + 1}`, value: index + 1 }));
  const companies = [{ ...row("one-source", "One Source", { leads: metric(4) }), series }];
  const lanes = [row("NY-FL", "NY → FL", { leads: metric(4) })];
  const slicedReport = { ...report, sources: { ...report.sources, companies, lanes } };
  return fixture(Array.from({ length: 3 }, () => ({ path: "/api/v1/admin/insights/analytics", data: success(slicedReport) })), async ({ tool }) => {
    const defaultView = (await tool("get_business_analytics", { ...reportRequest, view: "sources", page_size: 1 })).body.data.data;
    assert.equal(defaultView.sources.companies[0].series, undefined); assert.equal(defaultView.report_scope.series_included, false);
    const selected = (await tool("get_business_analytics", { ...reportRequest, view: "sources", source_breakdown: "lanes" })).body.data.data;
    assert.deepEqual(Object.keys(selected.sources).sort(), ["cohort_maturing", "lanes"]); assert.equal(selected.sources.lanes[0].key, "NY-FL");
    const optIn = (await tool("get_business_analytics", { ...reportRequest, view: "sources", page_size: 1, include_series: true })).body.data.data;
    assert.equal(optIn.report_scope.series_included, true);
    assert.deepEqual(optIn.sources.companies[0].series, series, "A selected row's time-series points cannot share its ranking page offset");
  });
});

test("G32: invalid ranking pages, page sizes and unknown source breakdowns fail before a backend read", () => fixture([], async ({ rpc }) => {
  for (const args of [{ page: 0 }, { page: 10001 }, { page_size: 0 }, { page_size: 26 }, { source_breakdown: "unknown" }]) {
    const actual = await rpc("tools/call", { name: "get_business_analytics", arguments: { view: "sources", ...args } });
    assert.ok(actual.error || actual.result?.isError, JSON.stringify(args));
  }
}));
