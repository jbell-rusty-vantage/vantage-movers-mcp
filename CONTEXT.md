# Vantage Movers MCP

Remote owner/manager reporting and separate administrative tools. Shared vocabulary and owner policies live in ../CONTEXT.md and ../AGENTS.md.

- /api/manager-mcp exposes read-only business tools and six prompts; no raw Mongo or Lead mutations.
- /api/mcp retains those reads/prompts and administrative tools.
- Both use the shared API secret; endpoint selection is not a separate credential or role boundary.
- Main API owns reporting, Call admission/billability, live pricing, official outcomes and archive restoration. Do not reproduce those invariants in MCP aggregations.
- Business analytics/admin browse are production-only. TEST_MODE only changes raw Mongo defaults.
- Manual create_lead supports Forms only. Ordinary Calls require qualified RingCentral ingestion. Preserve closed historical/final-import Best Relocation exceptions without authorizing more ingestion.
- Canonical Lead history merges hot/cold exact-job Granot observations. Bounded results have no completeness guarantee; missing evidence is unknown. API/archive failures remain failures.
- Intake queues, Owner Job Timeline and detailed Outreach require signed dashboard actors unavailable here. Do not bypass those gates.

See README.md for tool/environment contracts and docs/MANAGER-GUIDE.md for paste-ready prompts. Mongo tools are our own driver implementation, not the official MongoDB MCP connection. Lead mutations use the Vantage API only.
