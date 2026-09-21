import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import type { EnvMap } from "../auth";
import { authenticateIntelligenceRequest, IntelligenceError } from "./auth";
import { createIntelligenceApi, type IntelligenceApi } from "./api";
import { runWithIntelligenceContext } from "./context";
import { registerIntelligenceCapabilities } from "./registration";

const statusSchema = z.object({
  run_id: z.string(), status: z.enum(["running", "submitted"]), submission: z.unknown().nullable(),
  prompt_context: z.object({ rendered_prompt: z.string().min(1).max(100_000), prompt_version: z.string(), schema_version: z.string(), schema_digest: z.string(), mode: z.string() }).strict(),
}).strict();

export function createIntelligenceHandler(options: { env?: EnvMap; api?: IntelligenceApi } = {}) {
  const api = options.api ?? createIntelligenceApi({ env: options.env });
  return async (request: Request): Promise<Response> => {
    // This endpoint has no SSE subscription transport. SDK connection probes
    // must not spend a main-server/database authority read just to return 405.
    if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST", "cache-control": "no-store" } });
    try {
      const credentials = authenticateIntelligenceRequest(request, options.env);
      // Pure server status read rechecks stored run/nonce/active lease even for discovery.
      const status = statusSchema.parse(await api(credentials, "submission"));
      if (status.run_id !== credentials.claims.run_id) throw new IntelligenceError("RUN_SCOPE_DENIED");
      return await runWithIntelligenceContext({ ...credentials, status }, () => {
        // Never share a mutable SDK registry between identities or concurrent requests.
        const handler = createMcpHandler(server => registerIntelligenceCapabilities(server, api), { serverInfo: { name: "vantage-intelligence-mcp", version: "1.0.0" }, maxSubscriptions: 0 });
        return handler(request);
      });
    } catch (error) {
      const safe = error instanceof IntelligenceError ? error : new IntelligenceError("RUN_SCOPE_DENIED");
      return Response.json({ ok: false, code: safe.code }, { status: safe.status, headers: { "cache-control": "no-store" } });
    }
  };
}
