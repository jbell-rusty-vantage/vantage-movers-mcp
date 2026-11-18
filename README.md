# Vantage Movers MCP

Remote MCP for owner and manager reporting. Start with the [manager guide](docs/MANAGER-GUIDE.md) for six ready-to-use prompts.

## Connections

| Endpoint | Tools |
| --- | --- |
| /api/manager-mcp | Read-only business analytics, official Bookings/Cancellations, catalog, Booking-origin trace, customer/Lead history and six review prompts. No raw Mongo. |
| /api/mcp | Those reads/prompts plus existing Lead administration, health and custom Mongo reads. |

Production host: https://vantage-movers-mcp.vercel.app. New functionality requires deployment.

Configure a Streamable HTTP client with URL https://vantage-movers-mcp.vercel.app/api/manager-mcp and header Authorization: Bearer <VANTAGE_API_SECRET> (or x-api-secret). Never put secrets into prompts. Both endpoints use the existing shared API secret: the manager endpoint restricts available tools, but **is not a separate credential or role boundary**. The same credential accesses the administrative endpoint and main API. A manager-specific credential requires a separate authorization change before treating this as delegated access.

## Business tools

| Tool | Purpose |
| --- | --- |
| get_business_analytics | Canonical Insights overview, sources, team or bookings view with period, comparisons, live Lead costs, definitions and data quality. |
| get_reporting_catalog | Source Companies, Source Granularities, reps and merchants including inactive entries. Cached five minutes; failed subcatalog loads can appear empty. |
| list_bookings / get_booking | Paginated official Bookings and exact detail. |
| list_cancellations / get_cancellation | Paginated official Cancellations and exact detail. |
| trace_booking_origin | Booking → exact saved Lead model/id → canonical history. Distinguishes Referral, Leadless and unknown origin; no same-phone inference. |
| find_contact_number / find_lead_candidates | Number call rollup, current Lead link, other Leads, candidate identities and Owner exclusions. |
| get_lead_history | Canonical Lead facts, changes, exact-job Granot evidence, official outcomes and message metadata. |

Business analytics and admin browse read **production**, regardless of MCP TEST_MODE. History follows the main server configuration. Money is dollars, rates are fractions. Source/receiver conversion follows a Lead cohort; period activity is a different basis. Preserve the API's definitions, comparison coverage and quality flags. Sales credit comes from Booking Agent Allocations, not current receiver assignment. Split-agent Booking counts do not sum to company distinct Bookings. Binder is not profit.

Analytics ranking arrays use page/page_size (default two rows per array) and report_scope totals/has_next_page. Follow every page to compare all Sources or reps; whole-filter scorecards remain intact on every page. Sources selects one source_breakdown (companies with feed children, move type, pickup states or lanes). Sparklines are omitted unless include_series is requested. This keeps ordinary reviews within the response budget.

The [golden query set](docs/GOLDEN-QUERIES.md) covers manager inspection scenarios. The read-only live verifier is ops/verify-manager-mcp.ts: run with the existing credential loaded privately and argument local or the production manager URL. It prints scenario results only, never customer records or credentials.

Booking/Cancellation browse accepts start_date/end_date for full business dates on default Book/Cancel Date fields, stored as UTC calendar dates. Actual timestamp fields use explicit from/to instants. Do not mix modes or confuse these stored calendar dates with true New York midnight instants.

Intake-case queues, detailed Outreach cadence performance, Owner Job Timeline, allocation-cost and Money require signed dashboard actors that this connection does not carry. Use the authorized Admin dashboard. There are no intake confirmation, cancellation creation or message-send tools here.

## History and retention

The main server merges hot and archived exact-job Granot observations and fails the read on archive errors. Routine eligible superseded no-effect automation chains may leave live collections after conditional seven-day retention; this is not blanket deletion of all history. Prefer canonical history over raw Mongo for journeys.

History bounds: 50 Contact Numbers, 50 entity changes, 20 Granot observations, 10 Bookings, 10 Cancellations and 50 Lead Messages. There is no complete-history or has_more guarantee. Number/call activity may also be retained/redacted independently. Missing evidence is unknown, not proof of no event. History excludes email, transcript text and message bodies. A disabled feature may return 404.

API failures become MCP errors. Oversized output stays valid JSON, removing whole array records with explicit output_coverage omissions while preserving summary fields. Indivisible oversized responses fail explicitly. Never total a partial page or transport-trimmed array.

## Administrative and Mongo tools

The original endpoint retains search_leads, list_leads, get_lead, update_lead, delete_lead, create_lead and vantage_health. Manual creation supports **Form Leads only**. Ordinary Call creation requires qualified RingCentral ingestion. Preserve closed historical/final-import Best Relocation exceptions; another import is not authorized.

The mongo_* tools are our custom implementation using the MongoDB driver, **not an embedded official MongoDB MCP connection**. They list databases/collections/indexes/schema and run read-only find, aggregate, count and stats. $out and $merge are blocked. Raw reads do not implement canonical qualification, billing, live pricing or archive restoration.

## Development and release

Next.js, mcp-handler and the MCP server SDK provide Streamable HTTP. Run pnpm install, copy .env.example to .env.local privately, then pnpm test, pnpm typecheck and pnpm build. pnpm dev serves http://localhost:3100/api/manager-mcp.

Production is CLI-only, not Git-connected. Follow the [deployment skill](../.agents/skills/deploy-vantage-movers-mcp/SKILL.md); Git push does not deploy.

| Environment name | Role |
| --- | --- |
| VANTAGE_API_SECRET | Shared server/client authentication and outbound main API secret |
| VANTAGE_API_BASE_URL | Optional main API URL, defaults to production |
| MONGO_URI | Atlas connection for technical Mongo tools only |
| MONGO_DATABASE_NAME | Optional raw Mongo database override |
| TEST_MODE | Changes raw Mongo default to testvantagemovers, not production analytics/admin reads |
