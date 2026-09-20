import { createHash } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import artifact from "./generated/intelligence-contract-v1.json";
import {
  INTELLIGENCE_TOOLS,
  IntelligenceError,
  type IntelligenceTool,
} from "./auth";
import { intelligenceContext } from "./context";
import type { IntelligenceApi } from "./api";

export const SCHEMA_URI = "csi://schemas/csi-envelope-v1";
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [
          key,
          canonical((value as Record<string, unknown>)[key]),
        ]),
    );
  return value;
}
export const SCHEMA_TEXT = JSON.stringify(canonical(artifact.envelope_schema));
export const SCHEMA_DIGEST = createHash("sha256")
  .update(SCHEMA_TEXT)
  .digest("hex");
export const PROMPT_VERSION = artifact.prompt_version;
export const toolSchemas = Object.fromEntries(
  INTELLIGENCE_TOOLS.map((name) => [
    name,
    z.fromJSONSchema(
      artifact.tools[name] as Parameters<typeof z.fromJSONSchema>[0],
    ),
  ]),
) as Record<IntelligenceTool, z.ZodType>;

const descriptions: Record<IntelligenceTool, string> = {
  get_intelligence_context:
    "Read bounded, captured context for the server-created run subject, including Owner instructions and honest coverage.",
  get_call_transcript:
    "Read an authorized immutable redacted transcript version in bounded pages; preserve uncertainty and incomplete coverage.",
  list_number_activity:
    "Read captured chronological activity for the run's Contact Number, using the returned cursor.",
  search_leads:
    "Discover relevant Form Lead and Call Lead candidates within server-controlled scope; results do not confirm attachments.",
  get_lead:
    "Read a Lead admitted to this run's evidence scope; a supplied ID alone never authorizes access.",
  search_bookings:
    "Search relevant official Bookings within run scope with bounded pages and Cancellation context.",
  get_booking:
    "Read an authorized official Booking and related Cancellation evidence.",
  get_rep_identity:
    "Read reviewed call-time identity for an authorized interaction; unknown is a valid result.",
  query_operational_records:
    "Ask bounded read questions over Form Leads, Call Leads, Job Timeline, Bookings, Cancellations, Agents, Granot sources, RingCentral queues and User accounts. Named datasets and plain text only; no Mongo operators, filters, collection names or arbitrary fields. Main server controls relevance, redaction and evidence admission.",
  search_ringcentral_calls:
    "Read authorized RingCentral Call Log evidence for the run subject within a bounded time range. No media download, refresh, message or provider write.",
  get_ringcentral_call:
    "Inspect one RingCentral Call Log record already authorized for the run subject; returns redacted metadata, never private recording URLs.",
  submit_intelligence_analysis:
    "Submit exactly one immutable analysis envelope. Receipt means durable acceptance, not applied effects. On uncertain delivery stop for orchestration status recovery.",
};

export function registerIntelligenceCapabilities(
  server: McpServer,
  api: IntelligenceApi,
) {
  for (const name of INTELLIGENCE_TOOLS) {
    // Registration is request-local; listing and direct calls enforce the signed allowlist.
    if (!intelligenceContext().claims.tools.includes(name)) continue;
    server.registerTool(
      name,
      {
        description: descriptions[name],
        inputSchema: toolSchemas[name],
        annotations: {
          readOnlyHint: name !== "submit_intelligence_analysis",
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (args: unknown) => {
        try {
          const context = intelligenceContext(name);
          const parsed = toolSchemas[name].parse(args);
          const result = await api(
            context,
            name === "get_intelligence_context"
              ? "context"
              : name === "submit_intelligence_analysis"
                ? "submit"
                : "read",
            name === "get_intelligence_context"
              ? undefined
              : name === "submit_intelligence_analysis"
                ? parsed
                : { tool: name, args: parsed },
          );
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result) }],
          };
        } catch (error) {
          const code =
            error instanceof IntelligenceError ? error.code : "INVALID_INPUT";
          const issues =
            error instanceof IntelligenceError
              ? error.issues
              : error instanceof z.ZodError
                ? error.issues.slice(0, 16).flatMap((issue) => {
                    const path = issue.path.map(String).join(".").slice(0, 160);
                    const issueCode = String(issue.code).slice(0, 48);
                    return path && issueCode ? [{ path, code: issueCode }] : [];
                  })
                : undefined;
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  ok: false,
                  code,
                  ...(issues?.length ? { issues } : {}),
                }),
              },
            ],
          };
        }
      },
    );
  }
  server.registerResource(
    "csi-envelope-v1",
    SCHEMA_URI,
    {
      description:
        "Generated frozen main-server envelope schema; server additionally validates refinements and evidence authority.",
      mimeType: "application/schema+json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/schema+json",
          text: SCHEMA_TEXT,
        },
      ],
    }),
  );
  server.registerPrompt(
    PROMPT_VERSION,
    {
      description:
        "Retrieve the exact server-pinned prompt. CSI-13 must explicitly load and persist this text and schema digest before invoking its model.",
      argsSchema: z.object({}).strict(),
    },
    async () => {
      const pinned = intelligenceContext().status.prompt_context;
      if (
        pinned.prompt_version !== PROMPT_VERSION ||
        pinned.schema_version !== artifact.schema_version ||
        pinned.schema_digest !== SCHEMA_DIGEST
      )
        throw new IntelligenceError("ORIGINAL_EVIDENCE_UNAVAILABLE", 422);
      return {
        description: PROMPT_VERSION,
        messages: [
          {
            role: "user" as const,
            content: { type: "text" as const, text: pinned.rendered_prompt },
          },
        ],
        _meta: {
          prompt_version: pinned.prompt_version,
          schema_version: pinned.schema_version,
          schema_digest: pinned.schema_digest,
          mode: pinned.mode,
        },
      };
    },
  );
}
