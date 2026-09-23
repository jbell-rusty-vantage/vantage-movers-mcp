import assert from "node:assert/strict";
import test from "node:test";
import type { VantageApiRequest } from "../vantage-api";
import {
  findContactNumber,
  findContactNumberInputSchema,
  findLeadCandidates,
  findLeadCandidatesInputSchema,
  getAnalysis,
  getLeadHistory,
  getMoveAssessment,
  getMoveAssessmentInputSchema,
  getPriorAnalyses,
  getPriorAnalysesInputSchema,
  getSubjectStory,
  getSubjectStoryInputSchema,
  HISTORY_PREFIX,
  HISTORY_TOOLS,
  listAnalyses,
  listAnalysesInputSchema,
} from "./history";

const id = "aaaaaaaaaaaaaaaaaaaaaaaa";
const other = "bbbbbbbbbbbbbbbbbbbbbbbb";

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
  assert.equal(getSubjectStoryInputSchema.safeParse({ phone: "5551234567", lead: { model: "FormLead", id } }).success, false);
  assert.equal(getSubjectStoryInputSchema.safeParse({ lead: { model: "CallLead", id }, as_of: "2026-09-23T00:00:00.000Z" }).success, true);
  assert.equal(getSubjectStoryInputSchema.safeParse({ lead: { model: "Customer", id } }).success, false);
  assert.equal(findLeadCandidatesInputSchema.safeParse({ stated_name: "Maria" }).success, false);
  assert.equal(getMoveAssessmentInputSchema.safeParse({ outreach_record_id: id, subject_key: `number:${id}` }).success, false);
  assert.equal(getMoveAssessmentInputSchema.safeParse({ subject_key: `lead:FormLead:${id}` }).success, true);
  assert.equal(getMoveAssessmentInputSchema.safeParse({ subject_key: `customer:${id}` }).success, false);
});

test("history schemas are strict and bounded", () => {
  assert.equal(listAnalysesInputSchema.safeParse({ contact_number_id: id, limit: 500 }).success, false);
  assert.equal(listAnalysesInputSchema.safeParse({ contact_number_id: id, extra: true }).success, false);
  assert.equal(listAnalysesInputSchema.safeParse({ contact_number_id: "not-an-id" }).success, false);
  assert.equal(getPriorAnalysesInputSchema.safeParse({ contact_number_id: id, subject_key: `number:${id}`, as_of: "yesterday" }).success, false);
  assert.equal(getPriorAnalysesInputSchema.safeParse({ contact_number_id: id, subject_key: `number:${id}`, exclude_conversation_id: other }).success, true);
});

test("history tools call the history routes with the right path and query", async () => {
  const { api, requests } = fakeApi();
  await findContactNumber({ phone: "+15551234567" }, api);
  await getSubjectStory({ lead: { model: "FormLead", id }, as_of: "2026-09-23T00:00:00.000Z", model_events: 20 }, api);
  await findLeadCandidates({ contact_number_id: id, stated_name: "Maria", reference_mentions: ["your form", "P 123"] }, api);
  await listAnalyses({ contact_number_id: id, limit: 5, cursor: "abc" }, api);
  await getAnalysis({ run_id: other }, api);
  await getMoveAssessment({ outreach_record_id: id, include_model_output: true }, api);
  await getMoveAssessment({ subject_key: `number:${id}` }, api);
  await getLeadHistory({ model: "CallLead", id }, api);
  await getPriorAnalyses({ contact_number_id: id, subject_key: `number:${id}`, exclude_conversation_id: other }, api);

  assert.ok(requests.every((request) => request.method === "GET" && request.body === undefined));
  assert.ok(requests.every((request) => request.path.startsWith(HISTORY_PREFIX)));
  assert.deepEqual(requests[0], { method: "GET", path: `${HISTORY_PREFIX}/contact-number`, query: { phone: "+15551234567", id: undefined } });
  assert.equal(requests[1]?.path, `${HISTORY_PREFIX}/story`);
  assert.deepEqual(requests[1]?.query, {
    phone: undefined, contact_number_id: undefined, lead_model: "FormLead", lead_id: id,
    as_of: "2026-09-23T00:00:00.000Z", limit_events: undefined, model_events: 20,
  });
  assert.equal(requests[2]?.path, `${HISTORY_PREFIX}/lead-candidates?reference=your%20form&reference=P%20123`);
  assert.deepEqual(requests[2]?.query, { phone: undefined, contact_number_id: id, stated_name: "Maria" });
  assert.deepEqual(requests[3]?.query, { contact_number_id: id, limit: 5, cursor: "abc" });
  assert.equal(requests[4]?.path, `${HISTORY_PREFIX}/analyses/${other}`);
  assert.deepEqual(requests[5]?.query, { outreach_record_id: id, subject_key: undefined, include_model_output: true });
  assert.deepEqual(requests[6]?.query, { outreach_record_id: undefined, subject_key: `number:${id}`, include_model_output: undefined });
  assert.deepEqual(requests[7], { method: "GET", path: `${HISTORY_PREFIX}/lead`, query: { model: "CallLead", id } });
  assert.deepEqual(requests[8]?.query, {
    contact_number_id: id, subject_key: `number:${id}`, outreach_record_id: undefined, exclude_conversation_id: other, as_of: undefined,
  });
});

test("history tool results are the formatted API result", async () => {
  const { api } = fakeApi();
  const result = await getAnalysis({ run_id: id }, api);
  assert.deepEqual(result, { ok: true, status: 200, data: { ok: true, data: { echo: `${HISTORY_PREFIX}/analyses/${id}` } } });
});

test("history tool catalog is complete and read-only", () => {
  assert.deepEqual(HISTORY_TOOLS.map((tool) => tool.name), [
    "find_contact_number", "get_subject_story", "find_lead_candidates", "list_analyses", "get_analysis",
    "get_conversation", "get_move_assessment", "get_lead_history", "get_prior_analyses",
  ]);
  for (const tool of HISTORY_TOOLS) {
    assert.ok(tool.description.length > 80, tool.name);
    assert.ok(!/delete|create|update|mutate/i.test(tool.title), tool.name);
  }
});
