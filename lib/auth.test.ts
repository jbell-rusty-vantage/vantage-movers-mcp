import assert from "node:assert/strict";
import test from "node:test";
import {
  authenticateApiSecret,
  extractApiSecret,
  extractApiSecretFromRequest,
  isProductionRuntime,
  secretsEqual,
} from "./auth";

test("extractApiSecret prefers Authorization Bearer over x-api-secret", () => {
  const extracted = extractApiSecret({
    authorization: "Bearer alpha",
    apiSecret: "bravo",
  });
  assert.deepEqual(extracted, { secret: "alpha", source: "authorization" });
});

test("extractApiSecret accepts x-api-secret when Bearer is absent", () => {
  const extracted = extractApiSecret({
    apiSecret: "  bravo  ",
  });
  assert.deepEqual(extracted, { secret: "bravo", source: "x-api-secret" });
});

test("extractApiSecretFromRequest reads either header", () => {
  const request = new Request("http://localhost/api/mcp", {
    headers: { "x-api-secret": "from-header" },
  });
  assert.deepEqual(extractApiSecretFromRequest(request), {
    secret: "from-header",
    source: "x-api-secret",
  });
});

test("secretsEqual is true only for matching values", () => {
  assert.equal(secretsEqual("same", "same"), true);
  assert.equal(secretsEqual("same", "other"), false);
});

test("authenticateApiSecret requires a client secret", () => {
  const decision = authenticateApiSecret({
    expectedSecret: "expected",
  });
  assert.equal(decision.ok, false);
  if (!decision.ok) {
    assert.equal(decision.status, 401);
  }
});

test("authenticateApiSecret rejects a mismatched secret", () => {
  const decision = authenticateApiSecret({
    provided: { secret: "wrong", source: "authorization" },
    expectedSecret: "expected",
  });
  assert.equal(decision.ok, false);
  if (!decision.ok) {
    assert.equal(decision.status, 401);
    assert.equal(decision.error, "Unauthorized");
  }
});

test("authenticateApiSecret accepts a matching client secret", () => {
  const decision = authenticateApiSecret({
    provided: { secret: "expected", source: "x-api-secret" },
    expectedSecret: "expected",
  });
  assert.deepEqual(decision, { ok: true, secret: "expected" });
});

test("authenticateApiSecret can require the server secret in production", () => {
  const decision = authenticateApiSecret({
    provided: { secret: "only-client", source: "authorization" },
    requireServerSecret: true,
  });
  assert.equal(decision.ok, false);
  if (!decision.ok) {
    assert.equal(decision.status, 500);
  }
});

test("isProductionRuntime reads VERCEL_ENV", () => {
  assert.equal(isProductionRuntime({ VERCEL_ENV: "production" }), true);
  assert.equal(isProductionRuntime({ VERCEL_ENV: "preview" }), false);
});
