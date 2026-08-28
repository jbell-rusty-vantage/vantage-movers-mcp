import assert from "node:assert/strict";
import test from "node:test";
import {
  assertReadOnlyPipeline,
  clampAggregateLimit,
  clampFindLimit,
  getDefaultDatabaseName,
  getMongoUri,
} from "./mongo";

test("getDefaultDatabaseName follows TEST_MODE and an explicit override", () => {
  assert.equal(getDefaultDatabaseName({}), "vantagemovers");
  assert.equal(
    getDefaultDatabaseName({ TEST_MODE: "true" }),
    "testvantagemovers",
  );
  assert.equal(
    getDefaultDatabaseName({ MONGO_DATABASE_NAME: "historical" }),
    "historical",
  );
});

test("getMongoUri requires MONGO_URI", () => {
  assert.throws(() => getMongoUri({}), /MONGO_URI is not configured/);
  assert.equal(getMongoUri({ MONGO_URI: " mongodb://localhost " }), "mongodb://localhost");
});

test("clampFindLimit stays between 1 and 50", () => {
  assert.equal(clampFindLimit(), 20);
  assert.equal(clampFindLimit(3), 3);
  assert.equal(clampFindLimit(999), 50);
});

test("clampAggregateLimit stays between 1 and 20", () => {
  assert.equal(clampAggregateLimit(), 20);
  assert.equal(clampAggregateLimit(4), 4);
  assert.equal(clampAggregateLimit(80), 20);
});

test("assertReadOnlyPipeline blocks $out and $merge", () => {
  assert.doesNotThrow(() =>
    assertReadOnlyPipeline([{ $match: { phone_number: "555" } }]),
  );
  assert.throws(
    () => assertReadOnlyPipeline([{ $out: "form_leads_copy" }]),
    /\$out is blocked/,
  );
  assert.throws(
    () => assertReadOnlyPipeline([{ $merge: { into: "other" } }]),
    /\$merge is blocked/,
  );
});
