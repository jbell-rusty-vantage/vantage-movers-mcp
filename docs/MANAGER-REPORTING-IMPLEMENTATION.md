# Manager reporting implementation — November 9, 2026

The owner can review source and rep performance and trace an official Booking to its exact saved Lead origin through the canonical API. This patch adds the MCP interface, six review prompts and a manager guide. Production deployment and separate manager authorization remain outstanding; this document does not claim either.

## Implemented

- Read-only `/api/manager-mcp`, with business reads and prompts; administrative and raw Mongo tools remain on `/api/mcp`.
- Seven business tools: canonical Insights views, reporting catalog, paginated official Booking/Cancellation browse and detail, exact-link Booking-origin trace.
- Business-day filters span entire stored Book/Cancel dates. Date mode and actual instant mode cannot be mixed.
- Lead history uses materialized business facts from the main server. The history tool and linked Booking origin traces return the same coverage and limits.
- Form-only manual creation closes the stale advertised Call creation path. Supported historical Call admissions and official outcomes remain untouched.
- Failed API envelopes become MCP errors. Output budgeting removes whole array records with omission metadata rather than cutting JSON mid-record. Oversized indivisible output fails explicitly.

## Evidence

- Full MCP test suite passed: 47 tests, including actual SDK prompt registration, endpoint tool isolation, rejected credentials, disabled-history error propagation, source/report view contracts, full business dates and origin trace identity/error handling.
- Typecheck and optimized Next.js build passed. Both MCP routes compile.
- Read-only live checks against the configured main API returned HTTP 200 with expected canonical sections for Insights analytics, facets, paginated Bookings and Cancellations.
- A linked Booking sampled from a bounded page passed the new exact-link trace against the live API; history returned Lead, Contact Numbers, changes, Granot observations, Bookings, Cancellations and message metadata with coverage warnings. No customer or credential data was printed or saved as evidence.
- These checks did not certify complete cold-archive restoration, every historical source identity, metric correctness beyond the canonical server implementation, or an end-user client installation. Existing main-server retention/archive tests own restoration qualification.
- No domain records, Registry policies, environment variables or production deployment were changed.

## Remaining before broader manager access

The existing shared credential authenticates both endpoints and the main API. Choosing the manager endpoint narrows its tool list; it does not limit the credential's broader authority. Separately scoped manager credentials require an explicit authentication design and backend route scopes.

Intake reconciliation queues, detailed Outreach cadence performance, Owner Job Timeline, allocation-cost and Money reads require signed dashboard actors. The MCP does not synthesize an Owner identity or bypass those gates through Mongo. Those reviews still use the authorized Admin dashboard. Rep sales/receiver performance is available through canonical Insights; detailed call/text goal completion is a different, unavailable read.

The history API has bounded sections without `has_more` or source completeness metadata. MCP can disclose limits but cannot infer that missing events never happened. Number/call retention and redaction are independent from Granot archival. A server contract extension would be needed for stronger historical coverage claims.

## Ownership references

- Main server: `src/routes/insights-admin.routes.ts`, `src/services/insights/`, `src/services/admin/adminBrowse.service.ts`, `src/services/admin/adminFacets.service.ts`.
- History: `src/routes/sales-intelligence-history.routes.ts`, `src/services/salesIntelligence/history/reads.ts`.
- Policy: workspace `CONTEXT.md`, `AGENTS.md`, main-server `docs/call-lead-billing.md`, `docs/knowledge/granot-lifecycle/storage-retention-operations.md`.
- Access boundary: main-server `src/services/operationsRegistry/trustedActor.ts`, intake and Outreach routes. No changes to those contracts.
