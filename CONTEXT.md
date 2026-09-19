# Vantage Movers MCP

Remote Model Context Protocol server for agents that need the Granot / Vantage backend and a dedicated read-only MongoDB Atlas surface.

**System of Record for leads:** the Vantage API, not raw Mongo writes. Lead create / update / delete go through `vantage-movers-main-server` so duplicate detection, Sheet Sync, and CRM posting stay on the official path.

## Auth

Agents must send `VANTAGE_API_SECRET` in MCP client configuration:

- `Authorization: Bearer <VANTAGE_API_SECRET>`
- or `x-api-secret: <VANTAGE_API_SECRET>`

The server verifies that value against the `VANTAGE_API_SECRET` env var (required in production) and copies it onto outbound API calls as `x-api-secret`.

## Tools in this slice

- Lead search, list, get, create, update, delete for Form Leads and Call Leads
- `vantage_health`
- Read-only Mongo tools named after the official MongoDB MCP server: list databases / collections, schema, indexes, find, aggregate, count, db stats

`$out` and `$merge` are blocked. Lead mutations must not use `mongo_find` / `mongo_aggregate`.

## CSI-17 intelligence endpoint

`/api/intelligence-mcp` is separate from the general endpoint above. It exposes the server-generated twelve-tool contract, `sales_intelligence_analyze_v1` prompt and `csi://schemas/csi-envelope-v1` resource. Every request verifies the signed run credential and a dedicated key, then revalidates stored run/nonce/lease at main server. Request contexts and registries are isolated. Intelligence credentials are denied `/api/mcp` even in local permissive mode.

Main server owns relevance, immutable evidence capture, historical identity, one durable submission and downstream application. MCP contains no domain writes, Mongo access, provider client, model invocation or message capability. `query_operational_records` offers named, bounded datasets and literal text search rather than arbitrary Mongo queries. `search_ringcentral_calls` and `get_ringcentral_call` use server-owned fixed read adapters; the provider flag defaults off. See README and `docs/intelligence-mcp.md` for setup, contracts and local proof.
