# Vantage Movers MCP

Remote [Model Context Protocol](https://modelcontextprotocol.io) server so agents can use the Granot / Vantage backend and query MongoDB Atlas from one place.

Hosted on Vercel with [`mcp-handler`](https://github.com/vercel/mcp-handler) v2 and Next.js. That is the current Vercel-supported path: Streamable HTTP plus the 2026-07-28 MCP spec, no Redis, no long-lived stdio process.

## Why this library

| Option | Verdict |
| --- | --- |
| **mcp-handler v2 + Next.js** | Chosen. Official Vercel adapter, Fluid compute, Zod 4 tool schemas, works in Cursor as a URL. |
| xmcp | Fine file-based alternative. Extra framework for a small tool set. |
| Official MongoDB MCP stdio server | Excellent locally. Cannot be spawned on Vercel Functions. This server implements the same *read* tools with the official `mongodb` driver instead. |

## Required MCP configuration

`VANTAGE_API_SECRET` is required in the client config. The server puts that value on the `x-api-secret` header when it calls `https://vantage-movers-main-server.vercel.app`.

Cursor / Claude-style Streamable HTTP:

```json
{
  "mcpServers": {
    "vantage-movers": {
      "url": "https://vantage-movers-mcp.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer <VANTAGE_API_SECRET>"
      }
    }
  }
}
```

`x-api-secret` is accepted as well if a client prefers the Vantage header name:

```json
{
  "mcpServers": {
    "vantage-movers": {
      "url": "https://vantage-movers-mcp.vercel.app/api/mcp",
      "headers": {
        "x-api-secret": "<VANTAGE_API_SECRET>"
      }
    }
  }
}
```

Do not put the secret in `env` for a remote URL. HTTP MCP clients only send `headers`. `env` is for local stdio servers.

Production also stores `VANTAGE_API_SECRET` on the Vercel project so a public URL cannot open Mongo with a made-up token. The client value must match.

## MongoDB

The official MongoDB MCP server is stdio. This deployment keeps a dedicated Mongo surface in-process:

- `mongo_list_databases`
- `mongo_list_collections`
- `mongo_collection_schema`
- `mongo_collection_indexes`
- `mongo_find`
- `mongo_aggregate`
- `mongo_count`
- `mongo_db_stats`

Read-only. `$out` and `$merge` are rejected. Default database is `vantagemovers` (or `testvantagemovers` when `TEST_MODE=true`).

Use lead tools for Form / Call Lead writes. Raw Mongo mutations would skip Sheet Sync and CRM posting.

## First tool slice

| Tool | Backend |
| --- | --- |
| `search_leads` | `POST /api/v1/{form,call}-leads/search` |
| `list_leads` | `GET /api/v1/{form,call}-leads` |
| `get_lead` | `GET /api/v1/{form,call}-leads/:id` |
| `create_lead` | `POST /api/v1/{form,call}-leads` |
| `update_lead` | `PATCH /api/v1/{form,call}-leads/:id` |
| `delete_lead` | `DELETE /api/v1/{form,call}-leads/:id` |
| `vantage_health` | `GET /health`, `GET /db` |

Later slices: Granot syncs, Owner Registry items, booking cases.

## Scoped Sales Intelligence (CSI-17)

The dedicated `/api/intelligence-mcp` endpoint exposes twelve tools: `get_intelligence_context`, `get_call_transcript`, `list_number_activity`, `search_leads`, `get_lead`, `search_bookings`, `get_booking`, `get_rep_identity`, `query_operational_records`, `search_ringcentral_calls`, `get_ringcentral_call`, and `submit_intelligence_analysis`. A run's signed tool allowlist can narrow discovery and invocation further.

It publishes prompt `sales_intelligence_analyze_v1` and resource `csi://schemas/csi-envelope-v1`. Contracts are generated from main-server schemas, including tool arguments. The server is the semantic authority and validates refinements/evidence after MCP shape validation. This endpoint has no general Mongo, arbitrary HTTP, Lead mutation, Owner command or messaging tools. The general endpoint remains separate and rejects intelligence credentials.

See [intelligence contract and synthetic requests](docs/intelligence-mcp.md). CSI-13 model execution and effect application remain separate work; acceptance of a submission is not application success. No deployment or live RingCentral proof is implied.

## Local

```bash
pnpm install
cp .env.example .env.local
# fill VANTAGE_API_SECRET and MONGO_URI
pnpm test
pnpm typecheck
pnpm dev
```

MCP URL locally: `http://localhost:3100/api/mcp`

## Environment

| Name | Where | Role |
| --- | --- | --- |
| `VANTAGE_API_SECRET` | Vercel + MCP client headers | Auth to this server and to the Vantage API |
| `VANTAGE_API_BASE_URL` | Vercel, optional | Defaults to production |
| `MONGO_URI` | Vercel only | Atlas connection for Mongo tools |
| `MONGO_DATABASE_NAME` | Vercel, optional | Overrides the default database name |
| `TEST_MODE` | optional | Switches the default database to `testvantagemovers` |
