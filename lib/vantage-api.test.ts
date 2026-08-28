import assert from "node:assert/strict";
import test from "node:test";
import { runWithRequestContext } from "./request-context";
import {
  PRODUCTION_API_BASE_URL,
  buildVantageApiHeaders,
  buildVantageApiUrl,
  getVantageApiBaseUrl,
  vantageApi,
} from "./vantage-api";

test("getVantageApiBaseUrl defaults to production", () => {
  assert.equal(getVantageApiBaseUrl({}), PRODUCTION_API_BASE_URL);
});

test("getVantageApiBaseUrl strips a trailing slash", () => {
  assert.equal(
    getVantageApiBaseUrl({
      VANTAGE_API_BASE_URL: "https://preview.example.test/",
    }),
    "https://preview.example.test",
  );
});

test("buildVantageApiUrl adds query params and skips empty values", () => {
  assert.equal(
    buildVantageApiUrl("https://example.test", "/api/v1/form-leads", {
      q: "ada",
      skip: 0,
      booked: undefined,
    }),
    "https://example.test/api/v1/form-leads?q=ada&skip=0",
  );
});

test("buildVantageApiHeaders puts the secret on x-api-secret", () => {
  assert.deepEqual(buildVantageApiHeaders("super-secret"), {
    accept: "application/json",
    "x-api-secret": "super-secret",
  });
});

test("vantageApi forwards the request-context secret", async () => {
  const calls: Array<{ url: string; headers: Headers }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : String(input);
    calls.push({ url, headers: new Headers(init?.headers) });
    return new Response(JSON.stringify({ ok: true, data: { id: "1" } }), {
      status: 200,
    });
  };

  const result = await runWithRequestContext({ apiSecret: "from-mcp" }, () =>
    vantageApi(
      {
        method: "POST",
        path: "/api/v1/form-leads/search",
        body: { phone_number: "5551234567" },
      },
      {
        baseUrl: "https://vantage-movers-main-server.vercel.app",
        fetchImpl,
      },
    ),
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.headers.get("x-api-secret"), "from-mcp");
  assert.match(calls[0]?.url ?? "", /\/api\/v1\/form-leads\/search$/);
});
