import assert from "node:assert/strict";
import test from "node:test";
import type { VantageApiRequest } from "../vantage-api";
import {
  findContactNumber,
  findContactNumberInputSchema,
  findLeadCandidates,
  findLeadCandidatesInputSchema,
  getLeadHistory,
  getLeadHistoryInputSchema,
  HISTORY_PREFIX,
  HISTORY_TOOLS,
} from "./history";

const id = "aaaaaaaaaaaaaaaaaaaaaaaa";

function fakeApi() {
  const requests: VantageApiRequest[] = [];
  const api = (async (request: VantageApiRequest) => {
    requests.push(request);
    return { ok: true, status: 200, url: request.path, data: { ok: true, data: { echo: request.path } } };
  }) as typeof import("../vantage-api").vantageApi;
  return { api, requests };
}

test("history schemas require exactly one subject", () => {
  assert.equal(findContactNumberInputSchema.safeParse({}).success, false);
  assert.equal(findContactNumberInputSchema.safeParse({ phone: "5551234567", contact_number_id: id }).success, false);
  assert.equal(findContactNumberInputSchema.safeParse({ phone: "5551234567" }).success, true);
  assert.equal(findLeadCandidatesInputSchema.safeParse({ stated_name: "Maria" }).success, false);
  assert.equal(findLeadCandidatesInputSchema.safeParse({ phone: "5551234567", contact_number_id: id }).success, false);
});

test("history schemas are strict and bounded", () => {
  assert.equal(findContactNumberInputSchema.safeParse({ contact_number_id: "not-an-id" }).success, false);
  assert.equal(findLeadCandidatesInputSchema.safeParse({ contact_number_id: id, reference_mentions: Array(11).fill("P 1") }).success, false);
  assert.equal(getLeadHistoryInputSchema.safeParse({ model: "Customer", id }).success, false);
  assert.equal(getLeadHistoryInputSchema.safeParse({ model: "FormLead", id, extra: true }).success, false);
  assert.equal(getLeadHistoryInputSchema.safeParse({ model: "CallLead", id }).success, true);
});

test("history tools call the retained history routes with the right path and query", async () => {
  const { api, requests } = fakeApi();
  await findContactNumber({ phone: "+15551234567" }, api);
  await findLeadCandidates({ contact_number_id: id, stated_name: "Maria", reference_mentions: ["your form", "P 123"] }, api);
  await findLeadCandidates({ phone: "5551234567" }, api);
  await getLeadHistory({ model: "CallLead", id }, api);

  assert.ok(requests.every((request) => request.method === "GET" && request.body === undefined));
  assert.ok(requests.every((request) => request.path.startsWith(HISTORY_PREFIX)));
  assert.deepEqual(requests[0], { method: "GET", path: `${HISTORY_PREFIX}/contact-number`, query: { phone: "+15551234567", id: undefined } });
  assert.equal(requests[1]?.path, `${HISTORY_PREFIX}/lead-candidates?reference=your%20form&reference=P%20123`);
  assert.deepEqual(requests[1]?.query, { phone: undefined, contact_number_id: id, stated_name: "Maria" });
  assert.equal(requests[2]?.path, `${HISTORY_PREFIX}/lead-candidates`);
  assert.deepEqual(requests[3], { method: "GET", path: `${HISTORY_PREFIX}/lead`, query: { model: "CallLead", id } });
});

test("history tool results are the formatted API result", async () => {
  const { api } = fakeApi();
  const result = await getLeadHistory({ model: "FormLead", id }, api);
  assert.deepEqual(result.data, { ok: true, data: { echo: `${HISTORY_PREFIX}/lead` } });
  assert.equal(result.evidence_coverage.complete_history, "not_guaranteed");
  assert.equal(result.evidence_coverage.limits.granot_observations, 20);
});

test("history tool catalog holds only the retained read-only tools", () => {
  assert.deepEqual(HISTORY_TOOLS.map((tool) => tool.name), ["find_contact_number", "find_lead_candidates", "get_lead_history"]);
  for (const tool of HISTORY_TOOLS) {
    assert.ok(tool.description.length > 80, tool.name);
    assert.ok(!/delete|create|update|mutate/i.test(tool.title), tool.name);
    // Retired capabilities must not be advertised: no analyses, conversations, assessments, Outreach or story.
    assert.ok(!/analys|conversations\b|assessment|outreach|running summary|\bstory\b/i.test(tool.description), tool.name);
  }
});
