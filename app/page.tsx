const exampleConfig = `{
  "mcpServers": {
    "vantage-movers": {
      "url": "https://vantage-movers-mcp.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer <VANTAGE_API_SECRET>"
      }
    }
  }
}`;

export default function HomePage() {
  return (
    <main>
      <p className="kicker">Vantage Movers</p>
      <h1>Remote MCP server</h1>
      <p>
        Agents connect here to call the Granot / Vantage backend and to query
        MongoDB Atlas. Lead writes stay on the official API so Sheet Sync and
        CRM posting remain intact. Mongo tools are read-only.
      </p>

      <h2>Required MCP configuration</h2>
      <p>
        Send <code>VANTAGE_API_SECRET</code> on every request. The server copies
        that value into the <code>x-api-secret</code> header when it calls{" "}
        <code>vantage-movers-main-server</code>. Use either{" "}
        <code>Authorization: Bearer &lt;secret&gt;</code> or{" "}
        <code>x-api-secret</code>.
      </p>
      <pre>
        <code>{exampleConfig}</code>
      </pre>

      <h2>First tools</h2>
      <p>
        Lead search and CRUD for Form Leads and Call Leads, plus a dedicated
        MongoDB surface: list databases and collections, infer schema, find,
        aggregate, and count. Syncs and Owner Registry writes come next.
      </p>
    </main>
  );
}
