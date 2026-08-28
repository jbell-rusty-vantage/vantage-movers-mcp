import assert from "node:assert/strict";
import test from "node:test";
import {
  createLeadInputSchema,
  deleteLeadInputSchema,
  searchLeadsInputSchema,
} from "./leads";

test("searchLeadsInputSchema requires an identity field", () => {
  const missing = searchLeadsInputSchema.safeParse({ kind: "form" });
  assert.equal(missing.success, false);

  const parsed = searchLeadsInputSchema.parse({
    kind: "call",
    phone_number: "5551234567",
  });
  assert.equal(parsed.phone_number, "5551234567");
});

test("createLeadInputSchema enforces form identity and move facts", () => {
  const missing = createLeadInputSchema.safeParse({
    kind: "form",
    phone_number: "5551234567",
  });
  assert.equal(missing.success, false);

  const parsed = createLeadInputSchema.parse({
    kind: "form",
    name: "Ada Lovelace",
    phone_number: "5551234567",
    pickup_zip: "10001",
    destination_zip: "94105",
    move_size: "Studio",
    email: "ada@example.com",
  });
  assert.equal(parsed.kind, "form");
  assert.equal(parsed.move_size, "Studio");
});

test("createLeadInputSchema accepts a job-number-only call lead", () => {
  const parsed = createLeadInputSchema.parse({
    kind: "call",
    job_no: "P5556278",
  });
  assert.equal(parsed.job_no, "P5556278");
});

test("deleteLeadInputSchema requires an explicit confirm", () => {
  const missing = deleteLeadInputSchema.safeParse({
    kind: "form",
    id: "aaaaaaaaaaaaaaaaaaaaaaaa",
  });
  assert.equal(missing.success, false);

  const parsed = deleteLeadInputSchema.parse({
    kind: "form",
    id: "aaaaaaaaaaaaaaaaaaaaaaaa",
    confirm: true,
  });
  assert.equal(parsed.confirm, true);
});
