# Golden manager query set

The owner needs reliable source-to-Booking attribution and performance inspection before sharing the MCP connection. This set checks the registered manager endpoint through JSON-RPC, using synthetic business facts and intercepted upstream HTTP responses. It verifies what the tools expose; it does not grade a language model's final prose or independently certify the main server's calculations.

Run `pnpm test` or `node --import tsx --test lib/tools/golden.test.ts`. Every upstream request is intercepted, expected by path/method, and sent to a synthetic host; no live domain writes or reads occur. Credentials and customers are synthetic. Runtime fixture file: `lib/tools/golden.test.ts`.

## Fixed business truth

Period: November 1–8, 2026, New York business dates, ending exclusively November 9. Comparison coverage is partial. There are 10 eligible period Leads, three period Bookings (30% activity ratio), two Bookings from the period Lead cohort (20% conversion), two Duplicate Leads and one Bad Call. Live Lead cost is $1,000; one Lead is unpriced and one has unmapped origin. Source cohort is still maturing.

Alice and Bob each participate in two Bookings: four rep participations, **three distinct company Bookings**. Allocated Binder totals are $1,800 and $1,200. Casey currently receives the Leads and has two cohort Bookings; Casey is not inferred to be a credited salesperson. Fixture Merchant has three Bookings and $3,000 Binder. One official Cancellation has $250 Refund and concerns a Booking from before the period.

One official Booking links exactly to a WordPress-created Form Lead. A RingCentral-qualified, Form Fill Call Lead shares the phone; it does not replace that origin. Other cases are explicitly Referral, Leadless or unknown. A retained older Granot observation reaches MCP through canonical history; this tests preservation, not physical archive restoration.

## Queries and expected evidence

| ID | Manager's question | Tool / expected result |
| --- | --- | --- |
| G01 | How did the company perform November 1–8? | Analytics overview: 3 Bookings, 10 Leads, activity rate 0.30; partial comparison and quality flags survive. |
| G02 | Which source converted its Leads? | Sources view: cohort 2/10 = 0.20, not activity 3/10; maturing cohort and live-pricing definition remain visible. |
| G03 | Who sold the Bookings, and who has the Leads? | Team view retains Alice/Bob sales credit and Casey receiver attribution separately. Rep participations remain 4, not fabricated company total 4. |
| G04 | Which merchant handled Bookings, and what was cancelled? | Bookings view: Fixture Merchant 3, Binder $3,000; official Cancellation 1, Refund $250, booked-earlier timing 1. |
| G05 | Can I inspect inactive Agents and merchants? | Reporting catalog includes inactive Agent with active=false and named merchant. Absence is not fabricated. |
| G06 | Inspect this Form Lead. | get_lead form retains WordPress ingestion origin and exact feed. |
| G07 | Inspect this Call Lead's qualification and Form Fill. | get_lead call retains saved qualification, Form Fill and call feed; no creation occurs. |
| G08 | Find the Form Lead for this phone, including duplicates. | Identity search uses the canonical search POST only; the body is a read search, not a create command. |
| G09 | Show the next Call Leads from this source. | list_leads passes source, skip and limit to canonical browse; no raw Mongo. |
| G10 | Show page 2 of this merchant/Agent/source's Bookings for full business days. | list_bookings preserves filters and total=3, one returned row, has_next_page=true. Business dates span complete stored UTC calendar days. |
| G11 | Inspect the official Booking and its split. | get_booking retains Alice/Bob allocations, Casey's different receiver identity and $1,000 Binder. |
| G12 | Which official Cancellations refunded at least $200 on November 8? | Cancellation-date browse preserves complete date bounds, $250 Refund and pagination. |
| G13 | Inspect this Cancellation's Booking reference. | Exact cancellation detail retains the canonical Booking id. |
| G14 | Trace this Booking's original Lead. | Booking → saved Form model/id → canonical history. Same-phone Call is not queried or adopted; WordPress origin, older observation and bounded-history warning survive. |
| G15 | Where did this Referral Booking come from? | origin_status=referral, no inferred Lead and no history lookup. |
| G16 | Where did this Leadless Booking come from? | origin_status=leadless, no inferred Lead and no history lookup. |
| G17 | What if a Booking has only a matching phone/job? | origin_status=unknown, no phone/job origin guess. |
| G18 | Is this number Waiting on us? | Canonical waiting_since, settled last call, call rollup and Owner exclusions survive; MCP does not recompute the status. |
| G19 | Which Leads could this number belong to? | Candidates remain distinct; excluded Call candidate stays excluded. Repeated job/form reference parameters survive URL encoding. |
| G20 | What happens if the archive read fails? | HTTP 500 becomes MCP isError=true, not empty observations or successful hot-only history. |
| G21 | What if history is unavailable/disabled? | HTTP 404 is an error, not proof of no Lead activity. |
| G22 | What if an official Booking is missing? | Exact 404 remains an MCP error. |
| G23 | What if Booking is found but its origin history fails? | Trace fails explicitly, preserving official Booking context and history error. |
| G24 | What if a Booking page is too large for the tool response? | Valid JSON, whole records, original total and has_next_page, explicit omitted count. Returned rows are not represented as the entire result. |
| G25 | What if dates are reversed? | Schema rejects before any backend request. |
| G26 | What if I request an unsupported Booking feed filter? | Schema rejects rather than silently returning broader results. |
| G27 | Can this manager connection mutate records or run raw Mongo? | Delete, Call create and raw Mongo requests are unavailable; no backend request. |
| G28 | Does discovery explain what this connection cannot prove? | Instructions disclose signed intake/Outreach access; prompts retain New York dates, cohort distinctions and unknown-evidence rules. |
| G29 | Can I inspect every source, including its feeds, across ranking pages? | Three pages reconstruct all seven distinct companies in order without repeats; all five feed children stay attached to each. Per-array total/returned/has_next_page is explicit and whole-filter scorecards remain unchanged. |
| G30 | Can I inspect every sales rep and receiver Agent across pages? | Independent sales/receiver arrays reconstruct seven/four exact keys, including an exhausted receiver array on page 3; company Booking totals remain 3 on every page. |
| G31 | Can I request a specific source breakdown or the full sparkline for selected rows? | Default companies view omits series; lanes selection excludes unrelated company rows; opt-in series retain all dated points for the selected ranking row. |
| G32 | What if ranking pagination or source breakdown inputs are invalid? | Zero/out-of-range page sizes/pages and unknown breakdown names are rejected before any upstream request. |

## Acceptance and limits

Execution on November 9, 2026: all 32 golden questions passed across 28 grouped fixture tests/subtests; the complete repository suite passed 76 tests and typecheck passed. Questions G29–G32 explicitly exercise ranking pagination, source breakdown selection and opt-in series. The golden questions are grouped into related test scenarios, so question count and test count differ.

Success requires all fixture assertions plus the existing tests and typecheck to pass. Deployment smoke checks must separately exercise the real production MCP URL and authentication. A passing fixture set proves transport/schema/selection/error behavior against fixed inputs; it does not prove that an installed client will choose every correct tool, that every cold archive is restorable, or that every production record has complete provenance.

Intake-case queue, detailed Outreach cadence performance and Owner Job Timeline remain outside the API-secret connection's signed-dashboard authority. Manager tool discovery must not imply those reads work. The manager endpoint's read-only tool set also does not convert the existing shared administrative credential into a separate manager role.
