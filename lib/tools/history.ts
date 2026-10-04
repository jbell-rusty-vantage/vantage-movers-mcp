import { z } from "zod";
import { formatVantageApiResult, vantageApi, type VantageApiQuery } from "../vantage-api";

/**
 * Read-only history tools for the general endpoint.
 *
 * Every tool is a thin call to `/api/v1/internal/sales-intelligence/history/*` on the main
 * server with the request's `x-api-secret`. The server assembles, bounds and redacts; nothing
 * here touches Mongo. The tools return canonical records and provider metadata only: no call
 * analyses, conversations, Move assessments, Outreach records, transcript text, Lead Message
 * bodies or emails.
 */
export const HISTORY_PREFIX = "/api/v1/internal/sales-intelligence/history";

const oid = z.string().regex(/^[a-f\d]{24}$/i, "Expected a 24-hex Mongo id");
const phone = z.string().trim().min(3).max(32);
const leadModel = z.enum(["FormLead", "CallLead"]);
const exactlyOne = <T extends Record<string, unknown>>(keys: (keyof T)[], message: string) =>
  [(value: T) => keys.filter((key) => value[key] !== undefined).length === 1, message] as const;

export const findContactNumberInputSchema = z
  .object({ phone: phone.optional(), contact_number_id: oid.optional() })
  .strict()
  .refine(...exactlyOne(["phone", "contact_number_id"], "Provide exactly one of phone or contact_number_id"));

export const findLeadCandidatesInputSchema = z
  .object({
    phone: phone.optional(),
    contact_number_id: oid.optional(),
    stated_name: z.string().trim().min(1).max(200).optional(),
    reference_mentions: z.array(z.string().trim().min(1).max(200)).max(10).optional(),
  })
  .strict()
  .refine(...exactlyOne(["phone", "contact_number_id"], "Provide exactly one of phone or contact_number_id"));

export const getLeadHistoryInputSchema = z.object({ model: leadModel, id: oid }).strict();

export type HistoryApi = typeof vantageApi;

async function history(api: HistoryApi, path: string, query?: VantageApiQuery) {
  return formatVantageApiResult(await api({ method: "GET", path: `${HISTORY_PREFIX}${path}`, query }));
}

export async function findContactNumber(input: z.infer<typeof findContactNumberInputSchema>, api: HistoryApi = vantageApi) {
  return history(api, "/contact-number", { phone: input.phone, id: input.contact_number_id });
}

export async function findLeadCandidates(input: z.infer<typeof findLeadCandidatesInputSchema>, api: HistoryApi = vantageApi) {
  // The route reads repeated `reference` keys; `buildVantageApiUrl` sets one value per key, so join here.
  const query: VantageApiQuery = { phone: input.phone, contact_number_id: input.contact_number_id, stated_name: input.stated_name };
  const path = input.reference_mentions?.length
    ? `/lead-candidates?${input.reference_mentions.map((mention) => `reference=${encodeURIComponent(mention)}`).join("&")}`
    : "/lead-candidates";
  return history(api, path, query);
}

export async function getLeadHistory(input: z.infer<typeof getLeadHistoryInputSchema>, api: HistoryApi = vantageApi) {
  return history(api, "/lead", { model: input.model, id: input.id });
}

/** Tool catalog for the general endpoint; `register.ts` binds each entry with `wrap`. */
export const HISTORY_TOOLS = [
  {
    name: "find_contact_number",
    title: "Find contact number",
    description:
      "Resolve a phone number (any format) or a Contact Number id to the Contact Number record: E.164, classification, contact eligibility, caller-ID names, first and last activity, call rollups from provider metadata (calls in and out, calls a person answered, last inbound and outbound call, attached and candidate Lead counts) and every attachment edge to a Lead (state, certainty, evidence, Lead snapshot, review decision). Use this first to turn a phone number into ids for find_lead_candidates and get_lead_history.",
    inputSchema: findContactNumberInputSchema,
    run: findContactNumber,
  },
  {
    name: "find_lead_candidates",
    title: "Find lead candidates",
    description:
      "Which Leads could this phone number belong to? Uses the indexed phone paths of Form and Call Leads, the caller-ID name and, when given, a name the customer stated or a reference they mentioned (form, job number). Each candidate carries its basis, attachment state, duplicate/booked/cancelled flags, received time and source. Use when a number has no attached Lead or the attachment is ambiguous.",
    inputSchema: findLeadCandidatesInputSchema,
    run: findLeadCandidates,
  },
  {
    name: "get_lead_history",
    title: "Get lead history",
    description:
      "One Form Lead or Call Lead with what Vantage recorded about it: the Lead projection (name, phone, job number, source, Granot Priority, quoted, move views, receiving rep, flags; never the email), attachment edges to Contact Numbers, the newest 50 entity changes with before/after per path and source system, the newest 20 Granot observations for its job number, bookings, cancellations and Lead Messages (purpose, status, timestamps; never the body). Use instead of get_lead when the past matters.",
    inputSchema: getLeadHistoryInputSchema,
    run: getLeadHistory,
  },
] as const;
