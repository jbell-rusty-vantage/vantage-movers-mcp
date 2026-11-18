import assert from "node:assert/strict";
import test from "node:test";
import { redactUnknown, toToolText, toolTextResult } from "./json-result";

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

test("oversized indivisible results fail closed with valid JSON", () => {
  const text = toToolText("x".repeat(1000), 500);
  assert.equal(JSON.parse(text).error, "RESPONSE_TOO_LARGE");
});

test("budget keeps whole records and explicit omissions without mutating input", () => {
  const input = { total: 100, items: Array.from({ length: 100 }, (_, id) => ({ id, name: "x".repeat(80) })) };
  const result = JSON.parse(toToolText(input, 1000));
  assert.equal(result.output_coverage.complete, false);
  assert.equal(result.result.total, 100);
  assert.equal(result.result.items.length + result.output_coverage.omitted_array_items['/items'], 100);
  assert.equal(input.items.length, 100);
});

test("API and nested API failures become MCP errors", () => {
  assert.equal(toolTextResult({ ok: false, status: 403, data: { error: "Forbidden" } }).isError, true);
  assert.equal(toolTextResult({ ok: true, data: { ok: false, error: "Unavailable" } }).isError, true);
  assert.equal(toolTextResult({ ok: true, data: [] }).isError, false);
});

test("formatting overhead never drops records that fit as compact JSON", () => {
  const input = { items: Array.from({ length: 10 }, (_, id) => ({ id, value: id })) };
  const budget = JSON.stringify(input).length;
  const result = JSON.parse(toToolText(input, budget));
  assert.deepEqual(result, input);
});
