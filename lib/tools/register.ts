import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { toolErrorResult, toolTextResult } from "../json-result";
import { formatVantageApiResult, vantageApi } from "../vantage-api";
import {
  createLead,
  createLeadInputSchema,
  deleteLead,
  deleteLeadInputSchema,
  getLead,
  getLeadInputSchema,
  listLeads,
  listLeadsInputSchema,
  searchLeads,
  searchLeadsInputSchema,
  updateLead,
  updateLeadInputSchema,
} from "./leads";
import { HISTORY_TOOLS } from "./history";
import {
  mongoAggregateInputSchema,
  mongoAggregateTool,
  mongoCollectionIndexesInputSchema,
  mongoCollectionIndexesTool,
  mongoCollectionSchemaInputSchema,
  mongoCollectionSchemaTool,
  mongoCountInputSchema,
  mongoCountTool,
  mongoDbStatsInputSchema,
  mongoDbStatsTool,
  mongoFindInputSchema,
  mongoFindTool,
  mongoListCollectionsInputSchema,
  mongoListCollectionsTool,
  mongoListDatabasesInputSchema,
  mongoListDatabasesTool,
} from "./mongo-ops";

function wrap<T>(run: (input: T) => Promise<unknown>) {
  return async (input: T) => {
    try {
      return toolTextResult(await run(input));
    } catch (error) {
      return toolErrorResult(error);
    }
  };
}

export function registerVantageTools(server: McpServer) {
  server.registerTool(
    "vantage_health",
    {
      title: "Vantage API health",
      description:
        "Ping the Vantage / Granot backend health and database endpoints.",
      inputSchema: z.object({}).strict(),
    },
    wrap(async () => {
      const [health, db] = await Promise.all([
        vantageApi({ method: "GET", path: "/health" }),
        vantageApi({ method: "GET", path: "/db" }),
      ]);
      return {
        health: formatVantageApiResult(health),
        db: formatVantageApiResult(db),
      };
    }),
  );

  server.registerTool(
    "search_leads",
    {
      title: "Search leads",
      description:
        "Scored identity search for Form Leads or Call Leads. Use this to resolve a person by phone, email, name, Tracking Reference, or Job Number. Writes never go through this tool.",
      inputSchema: searchLeadsInputSchema,
    },
    wrap(searchLeads),
  );

  server.registerTool(
    "list_leads",
    {
      title: "List leads",
      description:
        "Browse recent Form Leads or Call Leads with optional text and source filters. Distinct from scored search_leads.",
      inputSchema: listLeadsInputSchema,
    },
    wrap(listLeads),
  );

  server.registerTool(
    "get_lead",
    {
      title: "Get lead",
      description: "Fetch one Form Lead or Call Lead by Mongo id.",
      inputSchema: getLeadInputSchema,
    },
    wrap(getLead),
  );

  server.registerTool(
    "create_lead",
    {
      title: "Create lead",
      description:
        "Create a Form Lead or Call Lead through the Vantage API so duplicate detection, Sheet Sync, and CRM posting stay on the official write path. Do not insert leads directly in Mongo.",
      inputSchema: createLeadInputSchema,
    },
    wrap(createLead),
  );

  server.registerTool(
    "update_lead",
    {
      title: "Update lead",
      description:
        "Patch a Form Lead or Call Lead through the Vantage API. Use the official write path so Sheet Sync stays owned by the backend.",
      inputSchema: updateLeadInputSchema,
    },
    wrap(updateLead),
  );

  server.registerTool(
    "delete_lead",
    {
      title: "Delete lead",
      description:
        "Delete a Form Lead or Call Lead through the Vantage API. confirm must be true. Set cascade when a booked Form Lead must be removed with its booking chain.",
      inputSchema: deleteLeadInputSchema,
    },
    wrap(deleteLead),
  );

  // Read-only history over the main server's history routes (spec §8.2); never Mongo.
  for (const tool of HISTORY_TOOLS) {
    server.registerTool(
      tool.name,
      { title: tool.title, description: tool.description, inputSchema: tool.inputSchema },
      wrap(tool.run as (input: unknown) => Promise<unknown>),
    );
  }

  server.registerTool(
    "mongo_list_databases",
    {
      title: "MongoDB list databases",
      description:
        "Read-only Atlas inventory, matching the official MongoDB MCP list-databases tool.",
      inputSchema: mongoListDatabasesInputSchema,
    },
    wrap(mongoListDatabasesTool),
  );

  server.registerTool(
    "mongo_list_collections",
    {
      title: "MongoDB list collections",
      description:
        "Read-only collection list for a database. Defaults to vantagemovers unless TEST_MODE is on.",
      inputSchema: mongoListCollectionsInputSchema,
    },
    wrap(mongoListCollectionsTool),
  );

  server.registerTool(
    "mongo_collection_schema",
    {
      title: "MongoDB collection schema",
      description:
        "Infer field types from a recent sample of documents. Read-only. Same idea as the official MongoDB MCP collection-schema tool.",
      inputSchema: mongoCollectionSchemaInputSchema,
    },
    wrap(mongoCollectionSchemaTool),
  );

  server.registerTool(
    "mongo_collection_indexes",
    {
      title: "MongoDB collection indexes",
      description: "Describe indexes on a collection. Read-only.",
      inputSchema: mongoCollectionIndexesInputSchema,
    },
    wrap(mongoCollectionIndexesTool),
  );

  server.registerTool(
    "mongo_find",
    {
      title: "MongoDB find",
      description:
        "Read-only find. Prefer Vantage lead tools for lead CRUD. Limit is capped at 50. Do not use this to mutate documents.",
      inputSchema: mongoFindInputSchema,
    },
    wrap(mongoFindTool),
  );

  server.registerTool(
    "mongo_aggregate",
    {
      title: "MongoDB aggregate",
      description:
        "Read-only aggregation. $out and $merge are blocked. Result size is capped.",
      inputSchema: mongoAggregateInputSchema,
    },
    wrap(mongoAggregateTool),
  );

  server.registerTool(
    "mongo_count",
    {
      title: "MongoDB count",
      description: "Count documents in a collection. Read-only.",
      inputSchema: mongoCountInputSchema,
    },
    wrap(mongoCountTool),
  );

  server.registerTool(
    "mongo_db_stats",
    {
      title: "MongoDB db stats",
      description: "Database storage statistics. Read-only.",
      inputSchema: mongoDbStatsInputSchema,
    },
    wrap(mongoDbStatsTool),
  );
}
