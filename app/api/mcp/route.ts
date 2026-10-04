import { createMcpHandler } from "mcp-handler";
import {
  authenticateApiSecret,
  extractApiSecretFromRequest,
  isProductionRuntime,
} from "@/lib/auth";
import { runWithRequestContext } from "@/lib/request-context";
import { registerVantageTools } from "@/lib/tools/register";
import { VANTAGE_SERVER_INSTRUCTIONS } from "@/lib/company";

export const runtime = "nodejs";
export const maxDuration = 60;

const mcpHandler = createMcpHandler(
  (server) => {
    registerVantageTools(server);
  },
  {
    serverInfo: {
      name: "vantage-movers-mcp",
      version: "0.1.0",
    },
    instructions: VANTAGE_SERVER_INSTRUCTIONS,
  },
);

function unauthorizedResponse(status: number, error: string) {
  return Response.json({ ok: false, error }, { status });
}

async function handleMcp(request: Request) {
  const decision = authenticateApiSecret({
    provided: extractApiSecretFromRequest(request),
    expectedSecret: process.env.VANTAGE_API_SECRET,
    requireServerSecret: isProductionRuntime(),
  });

  if (!decision.ok) {
    return unauthorizedResponse(decision.status, decision.error);
  }

  return runWithRequestContext({ apiSecret: decision.secret }, () =>
    mcpHandler(request),
  );
}

export async function GET(request: Request) {
  return handleMcp(request);
}

export async function POST(request: Request) {
  return handleMcp(request);
}
