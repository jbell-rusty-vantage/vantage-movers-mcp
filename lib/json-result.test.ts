import assert from "node:assert/strict";
import test from "node:test";
import { redactUnknown, toToolText } from "./json-result";

test("redactUnknown strips secret-looking keys", () => {
  const redacted = redactUnknown({
    ok: true,
    headers: { "x-api-secret": "must-not-leak", accept: "application/json" },
    MONGO_URI: "mongodb+srv://hidden",
  }) as Record<string, unknown>;

  const headers = redacted.headers as Record<string, unknown>;
  assert.equal(headers["x-api-secret"], "[redacted]");
  assert.equal(headers.accept, "application/json");
  assert.equal(redacted.MONGO_URI, "[redacted]");
  assert.equal(redacted.ok, true);
});

test("toToolText truncates large payloads", () => {
  const text = toToolText("x".repeat(100), 20);
  assert.match(text, /truncated 80 characters/);
});
