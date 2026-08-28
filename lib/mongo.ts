import { MongoClient, type Document } from "mongodb";

const MONGO_CONNECT_OPTIONS = {
  maxPoolSize: 5,
  minPoolSize: 0,
  maxIdleTimeMS: 60_000,
  serverSelectionTimeoutMS: 5_000,
  socketTimeoutMS: 45_000,
};

const WRITE_STAGES = new Set(["$out", "$merge"]);
const DEFAULT_FIND_LIMIT = 20;
const MAX_FIND_LIMIT = 50;
const MAX_AGGREGATE_DOCS = 20;
const SCHEMA_SAMPLE_SIZE = 40;

type MongoCache = {
  client: MongoClient | null;
  promise: Promise<MongoClient> | null;
  uri: string | null;
};

declare global {
  var __vantageMcpMongo: MongoCache | undefined;
}

function getCache(): MongoCache {
  if (!globalThis.__vantageMcpMongo) {
    globalThis.__vantageMcpMongo = { client: null, promise: null, uri: null };
  }
  return globalThis.__vantageMcpMongo;
}

export function isTestMode(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.TEST_MODE?.trim().toLowerCase() === "true";
}

export function getDefaultDatabaseName(
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = env.MONGO_DATABASE_NAME?.trim();
  if (configured) {
    return configured;
  }
  return isTestMode(env) ? "testvantagemovers" : "vantagemovers";
}

export function getMongoUri(
  env: Record<string, string | undefined> = process.env,
): string {
  const uri = env.MONGO_URI?.trim();
  if (!uri) {
    throw new Error("MONGO_URI is not configured on the MCP server");
  }
  return uri;
}

export async function getMongoClient(
  env: Record<string, string | undefined> = process.env,
): Promise<MongoClient> {
  const uri = getMongoUri(env);
  const cache = getCache();
  if (cache.client && cache.uri === uri) {
    return cache.client;
  }
  if (!cache.promise || cache.uri !== uri) {
    cache.uri = uri;
    cache.promise = MongoClient.connect(uri, MONGO_CONNECT_OPTIONS).then(
      (client) => {
        cache.client = client;
        return client;
      },
    );
  }
  return cache.promise;
}

export function assertReadOnlyPipeline(pipeline: unknown[]): void {
  for (const stage of pipeline) {
    if (!stage || typeof stage !== "object" || Array.isArray(stage)) {
      throw new Error("Each aggregation stage must be an object");
    }
    for (const key of Object.keys(stage)) {
      if (WRITE_STAGES.has(key)) {
        throw new Error(
          `Aggregation stage ${key} is blocked. Mongo tools on this server are read-only.`,
        );
      }
    }
  }
}

export function clampFindLimit(limit?: number): number {
  if (limit === undefined) {
    return DEFAULT_FIND_LIMIT;
  }
  return Math.min(Math.max(1, Math.floor(limit)), MAX_FIND_LIMIT);
}

export function clampAggregateLimit(limit?: number): number {
  if (limit === undefined) {
    return MAX_AGGREGATE_DOCS;
  }
  return Math.min(Math.max(1, Math.floor(limit)), MAX_AGGREGATE_DOCS);
}

export async function listDatabases() {
  const client = await getMongoClient();
  const result = await client.db().admin().listDatabases();
  return result.databases.map((database) => ({
    name: database.name,
    sizeOnDisk: database.sizeOnDisk,
    empty: database.empty,
  }));
}

export async function listCollections(database = getDefaultDatabaseName()) {
  const client = await getMongoClient();
  return client.db(database).listCollections().toArray();
}

export async function collectionIndexes(
  collection: string,
  database = getDefaultDatabaseName(),
) {
  const client = await getMongoClient();
  return client.db(database).collection(collection).indexes();
}

export async function dbStats(database = getDefaultDatabaseName()) {
  const client = await getMongoClient();
  return client.db(database).stats();
}

export async function findDocuments(input: {
  collection: string;
  database?: string;
  filter?: Document;
  projection?: Document;
  sort?: Document;
  limit?: number;
  skip?: number;
}) {
  const client = await getMongoClient();
  const limit = clampFindLimit(input.limit);
  return client
    .db(input.database ?? getDefaultDatabaseName())
    .collection(input.collection)
    .find(input.filter ?? {})
    .project(input.projection ?? {})
    .sort(input.sort ?? {})
    .skip(input.skip ?? 0)
    .limit(limit)
    .toArray();
}

export async function countDocuments(input: {
  collection: string;
  database?: string;
  filter?: Document;
}) {
  const client = await getMongoClient();
  return client
    .db(input.database ?? getDefaultDatabaseName())
    .collection(input.collection)
    .countDocuments(input.filter ?? {});
}

export async function aggregateDocuments(input: {
  collection: string;
  database?: string;
  pipeline: Document[];
  limit?: number;
}) {
  assertReadOnlyPipeline(input.pipeline);
  const client = await getMongoClient();
  const limit = clampAggregateLimit(input.limit);
  return client
    .db(input.database ?? getDefaultDatabaseName())
    .collection(input.collection)
    .aggregate([...input.pipeline, { $limit: limit }])
    .toArray();
}

function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (value instanceof Date) return "date";
  if (typeof value === "object" && value && "_bsontype" in value) {
    return String((value as { _bsontype?: string })._bsontype ?? "object");
  }
  return typeof value;
}

export async function inferCollectionSchema(input: {
  collection: string;
  database?: string;
  sampleSize?: number;
}) {
  const sampleSize = Math.min(input.sampleSize ?? SCHEMA_SAMPLE_SIZE, 100);
  const docs = await findDocuments({
    collection: input.collection,
    database: input.database,
    limit: sampleSize,
    sort: { _id: -1 },
  });

  const fields = new Map<string, Set<string>>();
  for (const doc of docs) {
    for (const [key, value] of Object.entries(doc)) {
      const types = fields.get(key) ?? new Set<string>();
      types.add(describeValue(value));
      fields.set(key, types);
    }
  }

  return {
    database: input.database ?? getDefaultDatabaseName(),
    collection: input.collection,
    sampled: docs.length,
    fields: Object.fromEntries(
      [...fields.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, types]) => [key, [...types].sort()]),
    ),
  };
}
