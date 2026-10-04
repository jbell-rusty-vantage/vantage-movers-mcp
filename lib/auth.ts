import { createHash, timingSafeEqual } from "node:crypto";

export const API_SECRET_HEADER = "x-api-secret";

export type ExtractedApiSecret = {
  secret: string;
  source: "authorization" | "x-api-secret" | "x-vantage-api-secret";
};

export function readBearerToken(authorizationHeader: string | null): string | undefined {
  const authorization = authorizationHeader?.trim();
  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    return undefined;
  }
  const token = authorization.slice("bearer ".length).trim();
  return token || undefined;
}

export function extractApiSecret(input: {
  authorization?: string | null;
  apiSecret?: string | null;
  vantageApiSecret?: string | null;
  bearerToken?: string | null;
}): ExtractedApiSecret | undefined {
  const bearer = input.bearerToken?.trim() || readBearerToken(input.authorization ?? null);
  if (bearer) {
    return { secret: bearer, source: "authorization" };
  }

  const apiSecret = input.apiSecret?.trim();
  if (apiSecret) {
    return { secret: apiSecret, source: "x-api-secret" };
  }

  const vantageApiSecret = input.vantageApiSecret?.trim();
  if (vantageApiSecret) {
    return { secret: vantageApiSecret, source: "x-vantage-api-secret" };
  }

  return undefined;
}

export function extractApiSecretFromRequest(
  request: Request,
  bearerToken?: string,
): ExtractedApiSecret | undefined {
  return extractApiSecret({
    authorization: request.headers.get("authorization"),
    apiSecret: request.headers.get(API_SECRET_HEADER),
    vantageApiSecret: request.headers.get("x-vantage-api-secret"),
    bearerToken,
  });
}

export function secretsEqual(provided: string, expected: string): boolean {
  const providedDigest = createHash("sha256").update(provided).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

export type AuthDecision =
  | { ok: true; secret: string }
  | { ok: false; status: 401 | 500; error: string };

export function authenticateApiSecret(input: {
  provided?: ExtractedApiSecret;
  expectedSecret?: string;
  requireServerSecret?: boolean;
}): AuthDecision {
  const expected = input.expectedSecret?.trim();
  const provided = input.provided?.secret.trim();

  if (input.requireServerSecret && !expected) {
    return {
      ok: false,
      status: 500,
      error: "VANTAGE_API_SECRET is not configured on the MCP server",
    };
  }

  if (!provided) {
    return {
      ok: false,
      status: 401,
      error:
        "Missing VANTAGE_API_SECRET. Send it as Authorization: Bearer <secret> or x-api-secret.",
    };
  }

  if (expected && !secretsEqual(provided, expected)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  return { ok: true, secret: provided };
}

export type EnvMap = Record<string, string | undefined>;

export function isProductionRuntime(env: EnvMap = process.env): boolean {
  return env.VERCEL_ENV === "production";
}
