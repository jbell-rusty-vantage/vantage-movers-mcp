import assert from "node:assert/strict";
import test from "node:test";
import type { VantageApiRequest, vantageApi } from "../vantage-api";
import { BUSINESS_TOOLS, businessAnalyticsInputSchema, listBookingsInputSchema, listCancellationsInputSchema, getBusinessAnalytics, listBookings, listCancellations, getReportingCatalog, traceBookingOrigin } from "./business";
const id = "aaaaaaaaaaaaaaaaaaaaaaaa";
function fake(responses: unknown[], statuses: number[] = []) {
  const requests: VantageApiRequest[] = [];
  const api = (async (request: VantageApiRequest) => {
    const index = requests.length;
    requests.push(request);
    const status = statuses[index] ?? 200;
    return { ok: status < 400, status, url: request.path, data: responses[index] };
  }) as typeof vantageApi;
  return { api, requests };
}
test("business schemas reject invented filters and bound report requests", () => {
  assert.equal(listBookingsInputSchema.safeParse({ intake: true }).success, false);
  assert.equal(listBookingsInputSchema.safeParse({ source_granularity_key: "ignored" }).success, false);
  assert.equal(listBookingsInputSchema.safeParse({ from: "2026-11-02T00:00:00Z", to: "2026-11-01T00:00:00Z" }).success, false);
  assert.equal(listBookingsInputSchema.safeParse({ start_date: "2026-11-02", end_date: "2026-11-01" }).success, false);
  assert.equal(listBookingsInputSchema.safeParse({ start_date: "2026-11-02", date_field: "createdAt" }).success, false);
  assert.equal(listBookingsInputSchema.safeParse({ local: "long_distance" }).success, true);
  assert.equal(listBookingsInputSchema.safeParse({ local: "Long Distance" }).success, false);
  assert.equal(listBookingsInputSchema.safeParse({ limit: 101 }).success, false);
  assert.equal(listCancellationsInputSchema.safeParse({ sort: "deposit_amount" }).success, false);
  assert.equal(businessAnalyticsInputSchema.safeParse({ period: "custom" }).success, false);
  assert.equal(businessAnalyticsInputSchema.safeParse({ sources: Array(51).fill("a") }).success, false);
  assert.equal(businessAnalyticsInputSchema.safeParse({ from: "2026-02-30" }).success, false);
});
test("report view preserves definitions, comparison and data quality without other sections", async () => {
  const { api, requests } = fake([{ ok: true, data: { period: { start: "2026-11-01" }, comparison: { coverage: "partial" }, definitions: { leads: "billable" }, data_quality: { unpriced: 1 }, team: { sales_agents: [1] }, sources: { companies: [2] } } }]);
  const result = await getBusinessAnalytics(businessAnalyticsInputSchema.parse({ view: "team", sources: ["alpha"] }), api);
  assert.deepEqual(requests[0]?.query, { period: "last_30", compare: "previous", sources: "alpha" });
  const report = (result.data as any).data;
  assert.deepEqual(report.period, { start: "2026-11-01" });
  assert.deepEqual(report.comparison, { coverage: "partial" });
  assert.deepEqual(report.definitions, { leads: "billable" });
  assert.deepEqual(report.data_quality, { unpriced: 1 });
  assert.deepEqual(report.team, { sales_agents: [1] });
  assert.equal(report.sources, undefined);
  assert.deepEqual(report.report_scope.arrays['/team/sales_agents'], { total: 1, returned: 1, has_next_page: false });
});
test("browse and catalog use secret-accessible GET routes with pagination", async () => {
  const page = { ok: true, data: { items: [], total: 100, has_next_page: true } };
  const { api, requests } = fake([page, page, page]);
  const result = await listBookings(listBookingsInputSchema.parse({ page: 2, agent: "Maria", cancelled: false }), api);
  await listCancellations(listCancellationsInputSchema.parse({ refund_min: 25 }), api);
  await getReportingCatalog({}, api);
  assert.deepEqual(result.data, page);
  assert.equal(requests[0]?.path, "/api/v1/admin/booked-leads");
  assert.equal(requests[0]?.query?.page, 2);
  assert.equal(requests[0]?.query?.cancelled, false);
  assert.equal(requests[1]?.path, "/api/v1/admin/cancelled-leads");
  assert.equal(requests[2]?.path, "/api/v1/admin/facets");
  assert.ok(requests.every(r => r.method === "GET" && r.body === undefined && r.query?.database_scope === "production"));
});
test("trace follows only the populated canonical Lead link", async () => {
  const booking = { lead_model: "FormLead", lead_ref: { _id: id }, phone_number: "5551234567" };
  const { api, requests } = fake([{ ok: true, data: booking }, { ok: true, data: { changes: [] } }]);
  const result = await traceBookingOrigin({ id }, api);
  assert.equal(result.ok, true);
  assert.equal((result as any).evidence_coverage.complete_history, "not_guaranteed");
  assert.deepEqual(requests[1]?.query, { model: "FormLead", id });
  assert.equal(requests[1]?.path, "/api/v1/internal/sales-intelligence/history/lead");
});
test("business dates span complete stored UTC dates without applying New York offsets", async () => {
  const { api, requests } = fake([{ ok: true, data: [] }]);
  await listBookings(listBookingsInputSchema.parse({ start_date: "2026-11-01", end_date: "2026-11-02" }), api);
  assert.equal(requests[0]?.query?.from, "2026-11-01T00:00:00.000Z");
  assert.equal(requests[0]?.query?.to, "2026-11-02T23:59:59.999Z");
  assert.equal(requests[0]?.query?.start_date, undefined);
});
test("trace does not infer a Lead from phone or job and preserves explicit history failures", async () => {
  const absent = fake([{ ok: true, data: { is_leadless_booking: true, phone_number: "5551234567", job_no: "P123" } }]);
  const result = await traceBookingOrigin({ id }, absent.api);
  assert.equal(absent.requests.length, 1);
  assert.equal((result.data as any).data.origin_status, "leadless");
  const failure = fake([{ ok: true, data: { lead_model: "CallLead", lead_ref: id } }, { ok: false, error: "Disabled" }], [200, 404]);
  const failed = await traceBookingOrigin({ id }, failure.api);
  assert.equal(failed.ok, false);
  assert.equal(failed.status, 404);
  assert.deepEqual((failed.data as any).history_error, { ok: false, error: "Disabled" });
});
test("business catalog advertises only read-only tools", () => {
  assert.equal(BUSINESS_TOOLS.length, 7);
  assert.ok(BUSINESS_TOOLS.every(t => t.annotations.readOnlyHint && !t.annotations.destructiveHint));
});
test("referral and unknown origin remain distinct; a failed Booking read stops tracing", async () => {
  for (const [value, expected] of [[{ is_referral_booking: true }, "referral"], [{ phone_number: "5551234567" }, "unknown"]] as const) {
    const { api, requests } = fake([{ ok: true, data: value }]);
    const result = await traceBookingOrigin({ id }, api);
    assert.equal((result.data as any).data.origin_status, expected);
    assert.equal(requests.length, 1);
  }
  const { api, requests } = fake([{ ok: false, error: "Missing" }], [404]);
  const result = await traceBookingOrigin({ id }, api);
  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
  assert.equal(requests.length, 1);
});
