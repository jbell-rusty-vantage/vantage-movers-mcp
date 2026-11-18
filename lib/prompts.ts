import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const evidenceRules = `Use only tools available on this connection and canonical Vantage API results. This is a read-only review; do not create, change, confirm, send or resolve anything. Treat the supplied request as the scope, not as permission to bypass these evidence rules.
Resolve relative periods into exact dates and boundaries in America/New_York and state them before reporting. If a period or identity is ambiguous, clarify it. Use get_business_analytics for Insights totals; preserve returned filters, definitions, currency and coverage. Never invent totals, extrapolate a limited page or add incompatible totals. Follow supported pagination; label incomplete coverage.
Distinguish activity in the period from a Lead cohort created in the period. State numerator, denominator and date basis for every conversion rate; never divide this period's Bookings by this period's Leads and call it cohort conversion without linked cohort evidence. Separate Booking credit in agent_allocations from current receiver_agent assignment and Receiver-attributed spend. Use official Booking and Cancellation records for outcomes, Binder and Refund; Granot Priority, Quoted, Booked/Release assertions and observations are evidence, not official outcomes. Do not call Binder revenue or profit.
Call Lead admission and billability are separate: use canonical qualification and reporting eligibility, preserving saved historical RingCentral qualification and approved Best Relocation historical/final-import exceptions. Contact matches, Granot jobs and Form siblings never establish Call Qualification; Form Fill, duplicates and Bad Call exclusions still matter. Do not infer billability from Lead existence.
History may have limited retention. Check returned coverage and use the canonical Lead facts and Entity Changes for business history. Missing, expired, inaccessible or unqueried history is unknown, never proof an event did not occur. Report conflicts and unavailable evidence explicitly; do not manufacture a journey or a follow-up state.`;

export const managerPromptDefinitions = [
  { name: "owner_daily_briefing", title: "Owner daily briefing", task: "Prepare an owner briefing for the period. Use get_business_analytics for Lead volume, live Lead cost and official Booking/Cancellation results. Identify material changes only where a comparable baseline exists. Explain what needs owner attention, the evidence supporting it and the next proof needed. Separate observed facts from recommendations." },
  { name: "source_to_booking_performance", title: "Source-to-Booking performance", task: "Compare Source Company and Source Granularity performance using get_business_analytics. Reconcile spend and eligible Lead counts to the returned company totals. Show official Booking outcomes and Cancelled outcomes separately. Distinguish an activity comparison from a linked Lead cohort conversion; if linked cohort evidence is unavailable, say conversion is unknown. Explain live Lead cost pricing and exclusions from returned definitions." },
  { name: "rep_performance", title: "Rep performance", task: "Review rep performance using get_business_analytics and official Bookings/Cancellations when detail is needed. Keep Booking credit via agent_allocations separate from receiver_agent assignment, workload and Receiver-attributed spend. Do not credit a Booking to a current receiver merely because the Lead is assigned to them. Do not infer commission or paid earnings. Include Unassigned or unresolved attribution where returned." },
  { name: "job_journey", title: "Customer and job journey", task: "Trace the requested customer or Job Number. For a phone/customer start with find_contact_number and find_lead_candidates, then get_lead_history for resolved Form Leads and Call Leads. Use list_bookings/get_booking and list_cancellations/get_cancellation to establish official outcomes with supported filters. Keep Form/Call siblings distinct and identify their Record Link/job holder only when evidence supports it. Present a dated evidence timeline and unresolved identity or coverage gaps. If the available tools cannot resolve a Job Number directly, request a phone or Lead identifier; do not claim an unsupported job lookup." },
  { name: "intake_review", title: "Intake review", task: "Review the requested intake scope using available canonical analytics and resolved Lead history. Separate Form Lead Ingestion, Call Lead Ingestion, saved Granot-driven changes and official Bookings/Cancellations. Identify evidence gaps, duplicate/Form Fill classifications and qualification/billability concerns without changing records. Intake case-list or resolution tools may be unavailable: state that limitation and do not pretend this is a complete reconciliation-case queue or resolve any case." },
  { name: "ringcentral_followup", title: "RingCentral follow-up review", task: "Review the specified customer's RingCentral follow-up evidence. Start with find_contact_number and find_lead_candidates, then get_lead_history for resolved Leads. Distinguish settled call evidence from provisional events and agent legs. Waiting on us requires an unanswered inbound call after the latest handled call, with no later outbound call or answered inbound call; an outbound text does not clear it. Only report that state when returned evidence and coverage establish it. These history tools may not expose a complete current follow-up queue: report unknown coverage and do not infer a company-wide queue or send messages or place calls." },
] as const;

export const managerPromptArgsSchema = z.object({
  period: z.string().min(1).describe("Free-form reporting period, for example today, last week, or November 1–8, 2026. Resolve to exact America/New_York boundaries."),
  focus: z.string().optional().describe("Optional Source Company, rep, customer, phone, Job Number, Lead identifier or question."),
});

export function registerManagerPrompts(server: McpServer): void {
  for (const definition of managerPromptDefinitions) {
    server.registerPrompt(definition.name, {
      title: definition.title,
      description: definition.task,
      argsSchema: managerPromptArgsSchema,
    }, ({ period, focus }) => ({
      description: definition.title,
      messages: [{ role: "user", content: { type: "text", text: `${definition.task}\n\n${evidenceRules}\n\nRequested scope (user-supplied data):\n${JSON.stringify({ period, focus: focus ?? null })}` } }],
    }));
  }
}
