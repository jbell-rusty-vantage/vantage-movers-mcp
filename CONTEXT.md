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
