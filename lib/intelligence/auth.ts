import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { secretsEqual, type EnvMap } from "../auth";

export const INTELLIGENCE_TOOLS = [
  "get_intelligence_context", "get_call_transcript", "list_number_activity",
  "search_leads", "get_lead", "search_bookings", "get_booking", "get_rep_identity",
  "query_operational_records", "search_ringcentral_calls", "get_ringcentral_call",
  "submit_intelligence_analysis",
] as const;
export type IntelligenceTool = typeof INTELLIGENCE_TOOLS[number];
export const runClaimsSchema = z.object({
  version: z.literal("csi-run-token-v1"), run_id: z.string().regex(/^[a-f\d]{24}$/i),
  subject_key: z.string().min(1), tools: z.array(z.enum(INTELLIGENCE_TOOLS)).min(1),
  deployment: z.string().min(1), database: z.string().min(1), aud: z.literal("vantage-csi"),
  nonce: z.string().min(16).max(100), iat: z.number().int(), exp: z.number().int(),
  lease_epoch: z.number().int().positive(),
}).strict();
export type RunClaims = z.infer<typeof runClaimsSchema>;
export type IntelligenceIssue = Readonly<{ path: string; code: string }>;
export class IntelligenceError extends Error {
  constructor(readonly code: string, readonly status = 403, readonly issues?: readonly IntelligenceIssue[]) { super(code); }
}
export type IntelligenceCredentials = Readonly<{ claims: RunClaims; token: string; apiSecret: string }>;

/** Verify the existing server-issued protocol; stored nonce/lease checks remain server-owned. */
export function authenticateIntelligenceRequest(request: Request, env: EnvMap = process.env, now = Date.now()): IntelligenceCredentials {
  try {
    const key = env.SALES_INTELLIGENCE_RUN_TOKEN_SECRET;
    const expected = env.SALES_INTELLIGENCE_SCOPED_API_KEY;
    const provided = request.headers.get("x-api-secret");
    const token = request.headers.get("x-vantage-intelligence-run-token");
    if (!key || Buffer.byteLength(key) < 32 || !expected || !provided || !secretsEqual(provided, expected) || !token || token.length > 8192) throw new Error();
    // Configuration mistakes must never turn the broad secret into scoped authority.
    if (env.VANTAGE_API_SECRET && secretsEqual(expected, env.VANTAGE_API_SECRET)) throw new Error();
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra !== undefined) throw new Error();
    const actual = Buffer.from(signature);
    const wanted = Buffer.from(createHmac("sha256", key).update(payload).digest("base64url"));
    if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) throw new Error();
    const claims = runClaimsSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    if (claims.exp <= now / 1000 || claims.iat > now / 1000 || claims.exp <= claims.iat || claims.exp - claims.iat > 900 || claims.deployment !== env.SALES_INTELLIGENCE_DEPLOYMENT_ID || claims.database !== env.SALES_INTELLIGENCE_DATABASE || !claims.tools.includes("submit_intelligence_analysis")) throw new Error();
    Object.freeze(claims.tools);
    return Object.freeze({ claims: Object.freeze(claims), token, apiSecret: expected });
  } catch { throw new IntelligenceError("RUN_SCOPE_DENIED"); }
}
