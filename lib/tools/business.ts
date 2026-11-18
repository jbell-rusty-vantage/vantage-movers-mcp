import { z } from "zod";
import { formatVantageApiResult, vantageApi, type VantageApiQuery } from "../vantage-api";
import { getLeadHistory } from "./history";

type Api = typeof vantageApi;
const oid = z.string().regex(/^[a-f\d]{24}$/i);
const text = z.string().trim().min(1).max(200);
const day = z.iso.date();
const metadata = { database_scope: "production", limitations: "Admin reporting reads production only. Intakes, Outreach performance and Job Timeline require signed dashboard actors and are not exposed here." };
export const businessAnalyticsInputSchema = z.object({
  view: z.enum(["overview", "sources", "team", "bookings"]).default("overview"),
  period: z.enum(["today", "yesterday", "this_week", "last_week", "this_month", "last_month", "last_30", "last_90", "quarter_to_date", "year_to_date", "custom"]).default("last_30"),
  compare: z.enum(["previous", "last_year", "none"]).default("previous"),
  from: day.optional(), to: day.optional(), sources: z.array(text).max(50).optional(),
  source_breakdown: z.enum(["companies", "local_vs_long_distance", "pickup_states", "lanes"]).default("companies"),
  page: z.number().int().min(1).max(10000).default(1),
  page_size: z.number().int().min(1).max(25).default(2),
  include_series: z.boolean().default(false),
}).strict().superRefine((v, ctx) => {
  if (v.period === "custom" && (!v.from || !v.to || v.from > v.to)) ctx.addIssue({ code: "custom", message: "Custom periods require ordered from and to dates" });
});
const listBase = {
  q: text.optional(), from: z.iso.datetime({ offset: true }).optional(), to: z.iso.datetime({ offset: true }).optional(),
  start_date: day.optional(), end_date: day.optional(),
  source: text.optional(), agent: text.optional(), customer_name: text.optional(), job_no: text.optional(), merchant: text.optional(),
  page: z.number().int().min(1).max(10000).default(1), limit: z.number().int().min(1).max(100).default(25), direction: z.enum(["asc", "desc"]).default("desc"),
};
function validateListDates(v: { from?: string; to?: string; start_date?: string; end_date?: string; date_field?: string }, ctx: z.RefinementCtx) {
  if (v.from && v.to && Date.parse(v.from) > Date.parse(v.to)) ctx.addIssue({ code: "custom", message: "from must be before or equal to to" });
  if (v.start_date && v.end_date && v.start_date > v.end_date) ctx.addIssue({ code: "custom", message: "start_date must be before or equal to end_date" });
  if ((v.start_date || v.end_date) && (v.from || v.to || (v.date_field && !["book_date", "cancel_date"].includes(v.date_field)))) ctx.addIssue({ code: "custom", message: "Business dates cannot be mixed with instant bounds or timestamp/createdAt fields" });
}
function listQuery(input: z.infer<typeof listBookingsInputSchema> | z.infer<typeof listCancellationsInputSchema>): VantageApiQuery {
  const { start_date, end_date, ...query } = input;
  return { ...query, ...(start_date ? { from: `${start_date}T00:00:00.000Z` } : {}), ...(end_date ? { to: `${end_date}T23:59:59.999Z` } : {}), database_scope: "production" };
}
export const listBookingsInputSchema = z.object({ ...listBase,
  date_field: z.enum(["book_date", "timestamp", "createdAt"]).optional(),
  sort: z.enum(["createdAt", "timestamp", "book_date", "job_no", "deposit_amount", "total_binder_amount"]).optional(),
  local: z.enum(["local", "long_distance"]).optional(), cancelled: z.boolean().optional(), leadless: z.boolean().optional(),
  deposit_min: z.number().finite().optional(), deposit_max: z.number().finite().optional(), binder_min: z.number().finite().optional(), binder_max: z.number().finite().optional(),
}).strict().superRefine(validateListDates);
export const listCancellationsInputSchema = z.object({ ...listBase,
  date_field: z.enum(["cancel_date", "timestamp", "createdAt", "book_date"]).optional(),
  sort: z.enum(["createdAt", "timestamp", "cancel_date", "book_date", "job_no", "refund_amount"]).optional(),
  reason: text.optional(), cancelled_by: text.optional(), refund_min: z.number().finite().optional(), refund_max: z.number().finite().optional(),
}).strict().superRefine(validateListDates);
export const businessRecordInputSchema = z.object({ id: oid }).strict();
export const reportingCatalogInputSchema = z.object({}).strict();
const record = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
async function read(api: Api, path: string, query?: VantageApiQuery) {
  return { ...formatVantageApiResult(await api({ method: "GET", path, query })), metadata };
}
export async function getBusinessAnalytics(input: z.infer<typeof businessAnalyticsInputSchema>, api: Api = vantageApi) {
  const { view, sources, source_breakdown, page, page_size, include_series, ...query } = businessAnalyticsInputSchema.parse(input);
  const result = await read(api, "/api/v1/admin/insights/analytics", { ...query, sources: sources?.join(",") });
  const envelope = record(result.data), report = record(envelope?.data);
  if (!result.ok || envelope?.ok !== true || !report) return result;
  const common = ["generated_at", "period", "comparison", "sources_filter", "source_options", "data_quality", "definitions", "scorecards"];
  const keys = [...common, ...(view === "overview" ? ["movers", ...(include_series ? ["series"] : [])] : [view])];
  const selected = Object.fromEntries(keys.filter(k => k in report).map(k => [k, report[k]]));
  const arrays: Record<string, { total: number; returned: number; has_next_page: boolean }> = {};
  function project(value: unknown, path: string): unknown {
    if (Array.isArray(value)) {
      // Feed children belong to their company and must stay attached; other
      // ranking/reason/mix arrays are explicitly paged, never silently sampled.
      const keepAll = path.endsWith("/children") || path.endsWith("/series");
      const rows = keepAll ? value : value.slice((page - 1) * page_size, page * page_size);
      if (!keepAll) arrays[path] = { total: value.length, returned: rows.length, has_next_page: page * page_size < value.length };
      return rows.map((row, index) => project(row, `${path}/${index}`));
    }
    const object = record(value);
    return object ? Object.fromEntries(Object.entries(object).filter(([key]) => include_series || key !== "series").map(([key, child]) => [key, project(child, `${path}/${key}`)])) : value;
  }
  if (view === "sources") {
    const section = record(selected.sources);
    if (section) selected.sources = { [source_breakdown]: project(section[source_breakdown], `/sources/${source_breakdown}`), cohort_maturing: section.cohort_maturing };
  } else if (view === "team" || view === "bookings") {
    selected[view] = project(selected[view], `/${view}`);
  } else if (selected.movers) selected.movers = project(selected.movers, "/movers");
  selected.report_scope = { view, ...(view === "sources" ? { source_breakdown } : {}), page, page_size, arrays, series_included: include_series,
    instruction: "Scorecards are canonical whole-filter totals. Ranking arrays are paginated; follow has_next_page. Sources returns only the selected breakdown. Never sum one page as the company total." };
  return { ...result, data: { ...envelope, data: selected } };
}
export async function listBookings(input: z.infer<typeof listBookingsInputSchema>, api: Api = vantageApi) {
  return read(api, "/api/v1/admin/booked-leads", listQuery(listBookingsInputSchema.parse(input)));
}
export async function getBooking(input: z.infer<typeof businessRecordInputSchema>, api: Api = vantageApi) {
  return read(api, `/api/v1/admin/booked-leads/${businessRecordInputSchema.parse(input).id}`, { database_scope: "production" });
}
export async function listCancellations(input: z.infer<typeof listCancellationsInputSchema>, api: Api = vantageApi) {
  return read(api, "/api/v1/admin/cancelled-leads", listQuery(listCancellationsInputSchema.parse(input)));
}
export async function getCancellation(input: z.infer<typeof businessRecordInputSchema>, api: Api = vantageApi) {
  return read(api, `/api/v1/admin/cancelled-leads/${businessRecordInputSchema.parse(input).id}`, { database_scope: "production" });
}
export async function getReportingCatalog(input: z.infer<typeof reportingCatalogInputSchema>, api: Api = vantageApi) {
  reportingCatalogInputSchema.parse(input);
  return read(api, "/api/v1/admin/facets", { database_scope: "production" });
}
export async function traceBookingOrigin(input: z.infer<typeof businessRecordInputSchema>, api: Api = vantageApi) {
  const booking = await getBooking(input, api);
  const envelope = record(booking.data), value = record(envelope?.data);
  if (!booking.ok || envelope?.ok !== true || !value) return booking;
  const linked = record(value.lead_ref);
  const id = linked?._id ?? linked?.id ?? value.lead_ref;
  const model = value.lead_model;
  if (!oid.safeParse(id).success || (model !== "FormLead" && model !== "CallLead")) {
    return { ...booking, data: { ok: true, data: { booking: value, origin_status: value.is_referral_booking === true ? "referral" : value.is_leadless_booking === true ? "leadless" : "unknown", lead_history: null, limitation: "No exact canonical linked Lead model and id. No phone or job inference performed." } } };
  }
  const history = await getLeadHistory({ model, id: id as string }, api);
  const historyEnvelope = record(history.data);
  if (!history.ok || historyEnvelope?.ok !== true) return { ...history, ok: false, data: { ok: false, error: "Linked Lead history could not be read", booking: value, history_error: history.data } };
  return { ...booking, evidence_coverage: history.evidence_coverage, data: { ok: true, data: { booking: value, origin_status: "linked_lead", lead_history: historyEnvelope.data, limitation: "History contains retained canonical evidence; missing provenance is not inferred." } } };
}
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
export const BUSINESS_TOOLS = [
  { name: "get_business_analytics", title: "Get business analytics", description: "Read canonical Insights overview, sources, team or bookings; New York dates, comparisons, live pricing, definitions and quality. Whole-filter scorecards remain intact. Ranking arrays use page/page_size (default2); follow report_scope arrays has_next_page. Sources selects source_breakdown (companies includes feed children, or move type/states/lanes). Sparkline series omitted unless include_series. Rates are fractions, money dollars.", inputSchema: businessAnalyticsInputSchema, run: getBusinessAnalytics, annotations },
  { name: "list_bookings", title: "List bookings", description: "Browse official Bookings with pagination and verified source, agent, date and amount filters. Use start_date/end_date for complete business days on book_date (default), stored as UTC calendar dates. from/to are inclusive stored timestamps; createdAt is a real instant. local values: local or long_distance. Returns total and has_next_page.", inputSchema: listBookingsInputSchema, run: listBookings, annotations },
  { name: "get_booking", title: "Get booking", description: "Read an official Booking by Mongo id, including canonical populated linked records. This is an official Booking, distinct from an intake proposal.", inputSchema: businessRecordInputSchema, run: getBooking, annotations },
  { name: "list_cancellations", title: "List cancellations", description: "Browse official Cancellations with pagination, source, agent, date, reason and refund filters. Use start_date/end_date for complete business days on cancel_date (default) or book_date, stored as UTC calendar dates. from/to are inclusive stored timestamps; createdAt is a real instant. Returns total and has_next_page.", inputSchema: listCancellationsInputSchema, run: listCancellations, annotations },
  { name: "get_cancellation", title: "Get cancellation", description: "Read one official Cancellation by Mongo id with populated Booking, customer and linked Lead where retained.", inputSchema: businessRecordInputSchema, run: getCancellation, annotations },
  { name: "get_reporting_catalog", title: "Get reporting catalog", description: "Read reporting filter options: Source Companies, source granularities, Agents and merchants including inactive entries. Registry facets may be cached five minutes; failed subcatalog loads may appear empty. No CPL schedules or connection secrets.", inputSchema: reportingCatalogInputSchema, run: getReportingCatalog, annotations },
  { name: "trace_booking_origin", title: "Trace booking origin", description: "Read a Booking then retained history for its exact canonical linked Lead model and id. Reports leadless, referral or unknown when there is no exact link. Never infers origin from a shared phone or job; a history failure is returned explicitly.", inputSchema: businessRecordInputSchema, run: traceBookingOrigin, annotations },
] as const;


