import { z } from "zod";
import { formatVantageApiResult, vantageApi, type VantageApiQuery } from "../vantage-api";

/**
 * Read-only history tools for the general endpoint (context provenance specification §8.2).
 *
 * Every tool is a thin call to `/api/v1/internal/sales-intelligence/history/*` on the main
 * server with the request's `x-api-secret`. The server assembles, bounds and redacts; nothing
 * here touches Mongo. No tool ever returns transcript text, a Lead Message body or an email.
 */
export const HISTORY_PREFIX = "/api/v1/internal/sales-intelligence/history";

const oid = z.string().regex(/^[a-f\d]{24}$/i, "Expected a 24-hex Mongo id");
const phone = z.string().trim().min(3).max(32);
const leadModel = z.enum(["FormLead", "CallLead"]);
const leadRef = z.object({ model: leadModel, id: oid }).strict();
const datetime = z.iso.datetime();
const subjectKey = z.string().regex(/^(lead:(FormLead|CallLead):[a-f\d]{24}|number:[a-f\d]{24})$/i, "Expected lead:<Model>:<id> or number:<id>");
const exactlyOne = <T extends Record<string, unknown>>(keys: (keyof T)[], message: string) =>
  [(value: T) => keys.filter((key) => value[key] !== undefined).length === 1, message] as const;

export const findContactNumberInputSchema = z
  .object({ phone: phone.optional(), contact_number_id: oid.optional() })
  .strict()
  .refine(...exactlyOne(["phone", "contact_number_id"], "Provide exactly one of phone or contact_number_id"));

export const getSubjectStoryInputSchema = z
  .object({
    phone: phone.optional(),
    contact_number_id: oid.optional(),
    lead: leadRef.optional(),
    as_of: datetime.optional(),
    limit_events: z.number().int().min(1).max(400).optional(),
    model_events: z.number().int().min(1).max(80).optional(),
  })
  .strict()
  .refine(...exactlyOne(["phone", "contact_number_id", "lead"], "Provide exactly one of phone, contact_number_id or lead"));

export const findLeadCandidatesInputSchema = z
  .object({
    phone: phone.optional(),
    contact_number_id: oid.optional(),
    stated_name: z.string().trim().min(1).max(200).optional(),
    reference_mentions: z.array(z.string().trim().min(1).max(200)).max(10).optional(),
  })
  .strict()
  .refine(...exactlyOne(["phone", "contact_number_id"], "Provide exactly one of phone or contact_number_id"));

export const listAnalysesInputSchema = z
  .object({
    contact_number_id: oid,
    limit: z.number().int().min(1).max(100).optional(),
    cursor: z.string().min(1).max(200).optional(),
  })
  .strict();

export const getAnalysisInputSchema = z.object({ run_id: oid }).strict();

export const getConversationInputSchema = z.object({ conversation_id: oid }).strict();

export const getMoveAssessmentInputSchema = z
  .object({
    outreach_record_id: oid.optional(),
    subject_key: subjectKey.optional(),
    include_model_output: z.boolean().optional(),
  })
  .strict()
  .refine(...exactlyOne(["outreach_record_id", "subject_key"], "Provide exactly one of outreach_record_id or subject_key"));

export const getLeadHistoryInputSchema = z.object({ model: leadModel, id: oid }).strict();

export const getPriorAnalysesInputSchema = z
  .object({
    contact_number_id: oid,
    subject_key: subjectKey,
    outreach_record_id: oid.optional(),
    exclude_conversation_id: oid.optional(),
    as_of: datetime.optional(),
  })
  .strict();

export type HistoryApi = typeof vantageApi;

async function history(api: HistoryApi, path: string, query?: VantageApiQuery) {
  return formatVantageApiResult(await api({ method: "GET", path: `${HISTORY_PREFIX}${path}`, query }));
}

export async function findContactNumber(input: z.infer<typeof findContactNumberInputSchema>, api: HistoryApi = vantageApi) {
  return history(api, "/contact-number", { phone: input.phone, id: input.contact_number_id });
}

export async function getSubjectStory(input: z.infer<typeof getSubjectStoryInputSchema>, api: HistoryApi = vantageApi) {
  return history(api, "/story", {
    phone: input.phone,
    contact_number_id: input.contact_number_id,
    lead_model: input.lead?.model,
    lead_id: input.lead?.id,
    as_of: input.as_of,
    limit_events: input.limit_events,
    model_events: input.model_events,
  });
}

export async function findLeadCandidates(input: z.infer<typeof findLeadCandidatesInputSchema>, api: HistoryApi = vantageApi) {
  // The route reads repeated `reference` keys; `buildVantageApiUrl` sets one value per key, so join here.
  const query: VantageApiQuery = { phone: input.phone, contact_number_id: input.contact_number_id, stated_name: input.stated_name };
  const path = input.reference_mentions?.length
    ? `/lead-candidates?${input.reference_mentions.map((mention) => `reference=${encodeURIComponent(mention)}`).join("&")}`
    : "/lead-candidates";
  return history(api, path, query);
}

export async function listAnalyses(input: z.infer<typeof listAnalysesInputSchema>, api: HistoryApi = vantageApi) {
  return history(api, "/analyses", { contact_number_id: input.contact_number_id, limit: input.limit, cursor: input.cursor });
}

export async function getAnalysis(input: z.infer<typeof getAnalysisInputSchema>, api: HistoryApi = vantageApi) {
  return history(api, `/analyses/${input.run_id}`);
}

export async function getConversation(input: z.infer<typeof getConversationInputSchema>, api: HistoryApi = vantageApi) {
  return history(api, `/conversations/${input.conversation_id}`);
}

export async function getMoveAssessment(input: z.infer<typeof getMoveAssessmentInputSchema>, api: HistoryApi = vantageApi) {
  return history(api, "/move-assessment", {
    outreach_record_id: input.outreach_record_id,
    subject_key: input.subject_key,
    include_model_output: input.include_model_output ? true : undefined,
  });
}

export async function getLeadHistory(input: z.infer<typeof getLeadHistoryInputSchema>, api: HistoryApi = vantageApi) {
  return history(api, "/lead", { model: input.model, id: input.id });
}

export async function getPriorAnalyses(input: z.infer<typeof getPriorAnalysesInputSchema>, api: HistoryApi = vantageApi) {
  return history(api, "/prior", {
    contact_number_id: input.contact_number_id,
    subject_key: input.subject_key,
    outreach_record_id: input.outreach_record_id,
    exclude_conversation_id: input.exclude_conversation_id,
    as_of: input.as_of,
  });
}

/** Tool catalog for the general endpoint; `register.ts` binds each entry with `wrap`. */
export const HISTORY_TOOLS = [
  {
    name: "find_contact_number",
    title: "Find contact number",
    description:
      "Resolve a phone number (any format) or a Contact Number id to the Contact Number record: E.164, classification, contact eligibility, caller-ID names, rollups (calls in/out, human conversations, last contact), the running summary from the newest number analysis, every attachment edge to a Lead (state, certainty, evidence, Lead snapshot) and its Outreach records. Use this first to turn a phone number into ids for the other history tools.",
    inputSchema: findContactNumberInputSchema,
    run: findContactNumber,
  },
  {
    name: "get_subject_story",
    title: "Get subject story",
    description:
      "Deterministic chronology of a phone number or a Lead: Lead received, texts sent, every call and attempt run, attachments, Granot Priority and quote changes, bookings and cancellations, follow-ups, Owner notes, analyses and Move assessments, as prose plus cited events, with the current Granot state per Lead and Lead candidates when no Lead is attached. Give exactly one of phone, contact_number_id or lead; as_of freezes the story at an instant. Start here before any Mongo query about a customer.",
    inputSchema: getSubjectStoryInputSchema,
    run: getSubjectStory,
  },
  {
    name: "find_lead_candidates",
    title: "Find lead candidates",
    description:
      "Which Leads could this phone number belong to? Uses the indexed phone paths of Form and Call Leads, the caller-ID name and, when given, a name the customer stated on a call or a reference they mentioned (form, job number). Each candidate carries its basis, attachment state, duplicate/booked/cancelled flags, received time and source. Use when a number has no attached Lead or the attachment is ambiguous.",
    inputSchema: findLeadCandidatesInputSchema,
    run: findLeadCandidates,
  },
  {
    name: "list_analyses",
    title: "List analyses",
    description:
      "Every intelligence run for a Contact Number, newest first and cursor-paged: mode, status, pipeline, prompt and model versions, conversation and Outreach ids, parent and predecessor runs, timestamps, findings count and whether the accepted output and the exact model object are retained. Use to find run ids before get_analysis or to see how often a number has been analysed.",
    inputSchema: listAnalysesInputSchema,
    run: listAnalyses,
  },
  {
    name: "get_analysis",
    title: "Get analysis",
    description:
      "One intelligence run in full: the run record (never its rendered prompt or token), the accepted envelope, the exact model object when retained, step artifacts, each finding with review state, supersession, resolved values and the Outreach effects it produced, and the captured call summaries the run read. Use when a finding or a run needs to be explained or audited.",
    inputSchema: getAnalysisInputSchema,
    run: getAnalysis,
  },
  {
    name: "get_conversation",
    title: "Get conversation",
    description:
      "One recorded call (Lead Conversation) without transcript text: direction, start, duration, contact type, processing state, Lead and Contact Number refs, the receiving rep, the latest completed run, the canonical structured summary (six sections, what was said on the call, move evidence) and the findings made from it. Use to read what a call established without pulling the transcript.",
    inputSchema: getConversationInputSchema,
    run: getConversation,
  },
  {
    name: "get_move_assessment",
    title: "Get move assessment",
    description:
      "The newest published Move assessment for a subject (an Outreach record id or a subject key such as lead:FormLead:<id> or number:<id>): move likelihood and transaction intent scores, the three move views, inventory, conflicts, engagement, coverage and the source manifest. include_model_output adds the exact model object. Use when the question is whether and how this customer is going to move.",
    inputSchema: getMoveAssessmentInputSchema,
    run: getMoveAssessment,
  },
  {
    name: "get_lead_history",
    title: "Get lead history",
    description:
      "One Form Lead or Call Lead with everything Vantage recorded about it: the Lead projection (name, phone, job number, source, Granot Priority, quoted, move views, receiving rep, flags; never the email), attachment edges to Contact Numbers, the newest 50 entity changes with before/after per path and source system, the newest 20 Granot observations for its job number, bookings, cancellations, Lead Messages (purpose, status, timestamps; never the body), conversations and Outreach records. Use instead of get_lead when the past matters.",
    inputSchema: getLeadHistoryInputSchema,
    run: getLeadHistory,
  },
  {
    name: "get_prior_analyses",
    title: "Get prior analyses",
    description:
      "The prior-analysis page an intelligence run would be shown for a subject: the newest call summaries for the Contact Number, the newest number synthesis, retained findings and the current Move assessment, as cited records. subject_key is lead:<Model>:<id> or number:<id>; exclude_conversation_id leaves out the call being analysed; as_of bounds what counts as prior. Use to see what earlier analyses already established before judging a new one.",
    inputSchema: getPriorAnalysesInputSchema,
    run: getPriorAnalyses,
  },
] as const;
