const exampleConfig = `{
  "mcpServers": {
    "vantage-movers": {
      "url": "https://vantage-movers-mcp.vercel.app/api/manager-mcp",
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
      <h1>Ask about your business</h1>
      <p>
        Connect your assistant to review Lead origins, rep performance,
        official Bookings and Cancellations. The manager connection provides
        read-only business tools and six ready-to-use review prompts.
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

      <h2>Try these requests</h2>
      <ul>
        <li>Which Source Companies brought us the best Booking results last week?</li>
        <li>How are my reps performing this month? Separate sales credit from Lead assignment.</li>
        <li>Trace this Booking back to its Lead origin and show any missing evidence.</li>
        <li>What do we know about follow-up for this customer&apos;s phone number?</li>
      </ul>
      <h2>What the assistant can review</h2>
      <p>
        Canonical source and rep reports, live Lead costs, official outcomes,
        exact Booking-to-Lead links and retained customer history. Archived
        Granot evidence is read through the main server. Missing evidence is
        reported as unknown. Intake queues and detailed Outreach cadence
        performance currently require the authorized Admin dashboard.
      </p>
      <p>
        The original <code>/api/mcp</code> connection retains administrative
        tools and custom MongoDB reads. Both connections use the same API
        credential; the manager URL offers a read-only tool set, not a
        separate access role.
      </p>
    </main>
  );
}
