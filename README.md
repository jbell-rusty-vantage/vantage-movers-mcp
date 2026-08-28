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
