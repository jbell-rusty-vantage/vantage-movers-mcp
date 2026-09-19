import { IntelligenceError, type IntelligenceCredentials } from "./auth";
import type { EnvMap } from "../auth";

const SAFE_CODES = new Set(["FEATURE_DISABLED", "INVALID_INPUT", "RUN_SCOPE_DENIED", "SUBMISSION_CONFLICT", "EVIDENCE_SCOPE_INVALID", "ORIGINAL_EVIDENCE_UNAVAILABLE", "BUDGET_EXHAUSTED", "LEASE_LOST", "RATE_LIMITED", "REVISION_CONFLICT", "EVIDENCE_LIMIT_REACHED", "PROVIDER_READ_UNAVAILABLE"]);
export type IntelligenceApi = (credentials: IntelligenceCredentials, action: "context" | "read" | "submit" | "submission", body?: unknown) => Promise<unknown>;
export function createIntelligenceApi(options: { env?: EnvMap; fetchImpl?: typeof fetch } = {}): IntelligenceApi {
  return async (credentials, action, body) => {
    try {
      const env = options.env ?? process.env;
      const configured = env.SALES_INTELLIGENCE_API_BASE_URL;
      if (!configured) throw new IntelligenceError("INTELLIGENCE_UNAVAILABLE", 503);
      const base = new URL(configured);
      if (base.username || base.password || base.search || base.hash || base.pathname !== "/" || (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)))) throw new IntelligenceError("INTELLIGENCE_UNAVAILABLE", 503);
      const response = await (options.fetchImpl ?? fetch)(new URL(`/api/v1/internal/sales-intelligence/runs/${credentials.claims.run_id}/${action}`, base), {
        method: action === "read" || action === "submit" ? "POST" : "GET",
        headers: { accept: "application/json", "content-type": "application/json", "x-api-secret": credentials.apiSecret, "x-vantage-intelligence-run-token": credentials.token },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(20_000), redirect: "error", cache: "no-store",
      });
      const reader = response.body?.getReader();
      if (!reader) throw new IntelligenceError("INTELLIGENCE_UNAVAILABLE", 503);
      const chunks: Uint8Array[] = []; let bytes = 0;
      try {
        for (;;) {
          const part = await reader.read(); if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > 2_000_000) { await reader.cancel(); throw new IntelligenceError("INTELLIGENCE_UNAVAILABLE", 503); }
          chunks.push(part.value);
        }
      } finally { reader.releaseLock(); }
      const text = Buffer.concat(chunks).toString("utf8");
      const data = JSON.parse(text);
      if (!response.ok || data?.ok === false) throw new IntelligenceError(SAFE_CODES.has(data?.code) ? data.code : "INTELLIGENCE_UNAVAILABLE", response.status >= 400 ? response.status : 503);
      return data?.ok === true ? data.data : data;
    } catch (error) {
      if (error instanceof IntelligenceError) throw error;
      // Includes uncertain delivery: no automatic POST retry and no provider body or credential echo.
      throw new IntelligenceError(action === "submit" ? "SUBMISSION_DELIVERY_UNKNOWN" : "INTELLIGENCE_UNAVAILABLE", 503);
    }
  };
}
