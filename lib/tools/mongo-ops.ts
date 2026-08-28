import { z } from "zod";
import {
  aggregateDocuments,
  collectionIndexes,
  countDocuments,
  dbStats,
  findDocuments,
  getDefaultDatabaseName,
  inferCollectionSchema,
  listCollections,
  listDatabases,
} from "../mongo";

const databaseName = z.string().trim().min(1).optional();
const collectionName = z.string().trim().min(1);

export const mongoListDatabasesInputSchema = z.object({}).strict();

export const mongoListCollectionsInputSchema = z
  .object({ database: databaseName })
  .strict();

export const mongoCollectionSchemaInputSchema = z
  .object({
    collection: collectionName,
    database: databaseName,
    sample_size: z.number().int().min(1).max(100).optional(),
  })
  .strict();

export const mongoCollectionIndexesInputSchema = z
  .object({
    collection: collectionName,
    database: databaseName,
  })
  .strict();

export const mongoFindInputSchema = z
  .object({
    collection: collectionName,
    database: databaseName,
    filter: z.record(z.string(), z.unknown()).optional(),
    projection: z.record(z.string(), z.unknown()).optional(),
    sort: z.record(z.string(), z.unknown()).optional(),
    limit: z.number().int().min(1).max(50).optional(),
    skip: z.number().int().min(0).optional(),
  })
  .strict();

export const mongoCountInputSchema = z
  .object({
    collection: collectionName,
    database: databaseName,
    filter: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const mongoAggregateInputSchema = z
  .object({
    collection: collectionName,
    database: databaseName,
    pipeline: z.array(z.record(z.string(), z.unknown())).min(1),
    limit: z.number().int().min(1).max(20).optional(),
  })
  .strict();

export const mongoDbStatsInputSchema = z
  .object({ database: databaseName })
  .strict();

export async function mongoListDatabasesTool() {
  return {
    default_database: getDefaultDatabaseName(),
    databases: await listDatabases(),
  };
}

export async function mongoListCollectionsTool(
  input: z.infer<typeof mongoListCollectionsInputSchema>,
) {
  const database = input.database ?? getDefaultDatabaseName();
  return {
    database,
    collections: await listCollections(database),
  };
}

export async function mongoCollectionSchemaTool(
  input: z.infer<typeof mongoCollectionSchemaInputSchema>,
) {
  return inferCollectionSchema({
    collection: input.collection,
    database: input.database,
    sampleSize: input.sample_size,
  });
}

export async function mongoCollectionIndexesTool(
  input: z.infer<typeof mongoCollectionIndexesInputSchema>,
) {
  return {
    database: input.database ?? getDefaultDatabaseName(),
    collection: input.collection,
    indexes: await collectionIndexes(input.collection, input.database),
  };
}

export async function mongoFindTool(input: z.infer<typeof mongoFindInputSchema>) {
  return {
    database: input.database ?? getDefaultDatabaseName(),
    collection: input.collection,
    documents: await findDocuments({
      collection: input.collection,
      database: input.database,
      filter: input.filter,
      projection: input.projection,
      sort: input.sort,
      limit: input.limit,
      skip: input.skip,
    }),
  };
}

export async function mongoCountTool(input: z.infer<typeof mongoCountInputSchema>) {
  return {
    database: input.database ?? getDefaultDatabaseName(),
    collection: input.collection,
    count: await countDocuments({
      collection: input.collection,
      database: input.database,
      filter: input.filter,
    }),
  };
}

export async function mongoAggregateTool(
  input: z.infer<typeof mongoAggregateInputSchema>,
) {
  return {
    database: input.database ?? getDefaultDatabaseName(),
    collection: input.collection,
    documents: await aggregateDocuments({
      collection: input.collection,
      database: input.database,
      pipeline: input.pipeline,
      limit: input.limit,
    }),
  };
}

export async function mongoDbStatsTool(
  input: z.infer<typeof mongoDbStatsInputSchema>,
) {
  const database = input.database ?? getDefaultDatabaseName();
  return {
    database,
    stats: await dbStats(database),
  };
}
