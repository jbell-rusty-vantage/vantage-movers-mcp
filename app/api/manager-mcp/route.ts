import { createMcpHandler } from "mcp-handler";
import { authenticateApiSecret, extractApiSecretFromRequest, isProductionRuntime } from "@/lib/auth";
import { runWithRequestContext } from "@/lib/request-context";
import { registerVantageTools } from "@/lib/tools/register";
import { registerManagerPrompts } from "@/lib/prompts";
import { VANTAGE_MANAGER_INSTRUCTIONS } from "@/lib/company";

export const runtime = "nodejs";
export const maxDuration = 60;

const handler = createMcpHandler((server) => {
  registerVantageTools(server, { manager: true });
  registerManagerPrompts(server);
}, {
  serverInfo: { name: "vantage-movers-manager", version: "0.2.0" },
  instructions: VANTAGE_MANAGER_INSTRUCTIONS,
});

async function handle(request: Request) {
  const decision = authenticateApiSecret({
    provided: extractApiSecretFromRequest(request),
    expectedSecret: process.env.VANTAGE_API_SECRET,
    requireServerSecret: isProductionRuntime(),
  });
  if (!decision.ok) return Response.json({ ok: false, error: decision.error }, { status: decision.status });
  return runWithRequestContext({ apiSecret: decision.secret }, () => handler(request));
}

export const GET = handle;
export const POST = handle;
