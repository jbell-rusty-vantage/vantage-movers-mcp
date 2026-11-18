# Manager review with Vantage MCP

Connect your MCP client to `https://vantage-movers-mcp.vercel.app/api/manager-mcp` with the same `Authorization: Bearer <VANTAGE_API_SECRET>` header used by the existing connection. The manager endpoint is read-only. The existing `/api/mcp` endpoint retains its administrative tools; use the manager connection for owner reviews. Never paste the secret into a prompt.

This endpoint must be deployed before use. It offers a read-only tool set, but both endpoints accept the shared API credential. That credential also reaches administrative tools and the main API. Separate manager access requires a further authorization change.

The manager endpoint offers six MCP prompts. Choose one in a client that supports prompts, pass a free-form `period`, and optionally supply `focus` with a Source Company, rep, phone, Job Number or Lead identifier. A prompt guides a review; it does not itself run a report or guarantee that every requested detail is available. Dates must be resolved to exact America/New_York boundaries. The assistant should explain missing access, incomplete pages or limited history instead of inventing results.

| MCP prompt | Paste-ready request |
| --- | --- |
| `owner_daily_briefing` | Give me my owner briefing for today. State the exact New York dates, Lead volume and live Lead cost, official Bookings and Cancellations, and what needs my attention. Show the evidence and any coverage gaps. |
| `source_to_booking_performance` | Compare Source Companies and Source Granularities for last week. Show eligible Lead counts, spend and official Booking outcomes. Separate activity in the week from conversion of the week's Lead cohort and state every denominator. |
| `rep_performance` | Review rep performance for this month so far. Separate official Booking credit from current Lead receiver assignment and Receiver-attributed spend. Include unresolved attribution and explain what the evidence cannot tell us. |
| `job_journey` | Trace the customer at [phone] for [period], including Form Leads, Call Leads, saved Granot-driven changes, official Bookings and Cancellations. Show a dated timeline, identity conflicts and missing history. |
| `intake_review` | Review intake for [period]. Explain qualification and billability concerns, duplicates and Form Fill, and separate Granot assertions from official outcomes. Tell me whether the available tools cover the reconciliation-case queue. Do not change anything. |
| `ringcentral_followup` | Review follow-up evidence for [phone] during [period]. Explain whether settled call evidence establishes Waiting on us, what later handling is visible, and what history is unavailable. Do not call or message anyone. |

Business totals come from `get_business_analytics`, the canonical Insights API. Official outcomes can be checked with `list_bookings`, `get_booking`, `list_cancellations` and `get_cancellation`. Customer reviews start with `find_contact_number`, `find_lead_candidates` and `get_lead_history`. A direct Job Number lookup or a complete intake/follow-up queue may require capabilities this connection does not expose; the assistant must say so and can ask for a phone or Lead identifier.

An activity report counts events during the period. A Lead cohort report follows Leads created during the period to their outcomes, possibly after the period. Those are different questions. Current receiver assignment does not establish Booking credit; official Booking Agent Allocations do. Granot Priority, Quoted and Booked/Release observations never substitute for official Booking or Cancellation records, Binder or Refund.

A saved Call Lead is not automatically billable. Reviews must preserve canonical RingCentral qualification, approved historical and final-import exceptions, and reporting exclusions such as Form Fill, duplicates and Bad Calls. Missing recent history can reflect retention; use the returned coverage limits and describe unresolved history as unknown. These reviews do not authorize another Best Relocation import or any record mutation.
