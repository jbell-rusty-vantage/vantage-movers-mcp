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

/**
 * The envelope contract is `csi-envelope-v1` and does not change here; what is
 * versioned is its JSON Schema *rendering*, one resource per revision (22
 * §4.2). Every revision the generator emitted is served, because a run pins a
 * digest at preparation and an `original_evidence` replay must be able to read
 * back exactly the schema its parent was given. A pinned digest this build does
 * not carry is refused, never answered with a different rendering.
 */
export type SchemaRevision = { uri: string; text: string; digest: string };
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
const digestOf = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const declared: Record<string, { uri: string; envelope_schema: unknown }> =
  (artifact as { revisions?: Record<string, { uri: string; envelope_schema: unknown }> }).revisions ??
  // An artifact generated before revisions existed carries only the current one.
  { r1: { uri: "csi://schemas/csi-envelope-v1", envelope_schema: artifact.envelope_schema } };
export const SCHEMA_REVISIONS: SchemaRevision[] = Object.values(declared).map((entry) => ({
  uri: entry.uri,
  text: JSON.stringify(canonical(entry.envelope_schema)),
  digest: digestOf(entry.envelope_schema),
}));
export const SCHEMA_TEXT = JSON.stringify(canonical(artifact.envelope_schema));
export const SCHEMA_DIGEST = digestOf(artifact.envelope_schema);
export const SCHEMA_URI =
  SCHEMA_REVISIONS.find((revision) => revision.digest === SCHEMA_DIGEST)?.uri ??
  "csi://schemas/csi-envelope-v1";
export const PROMPT_VERSION = artifact.prompt_version;
/** Prompt names still served. A run keeps the one it pinned; see the server's `CSI_PROMPT_VERSIONS`. */
export const PROMPT_VERSIONS: string[] =
  (artifact as { prompt_versions?: string[] }).prompt_versions ?? [artifact.prompt_version];
export const toolSchemas = Object.fromEntries(
  INTELLIGENCE_TOOLS.map((name) => [
    name,
    z.fromJSONSchema(
      artifact.tools[name] as Parameters<typeof z.fromJSONSchema>[0],
    ),
  ]),
) as Record<IntelligenceTool, z.ZodType>;

/**
 * Publish the generated JSON Schema verbatim while keeping Zod as the
 * validator.
 *
 * `tools/list` is what reaches the model on every step, and the submit tool
 * embeds the whole envelope schema. Letting the SDK re-derive that schema from
 * the reconstructed Zod type inlines every `$ref` the generator hoisted, which
 * would put 41 KB back on the wire for a contract that is byte-identical at
 * 17 KB. Validation is untouched: the same Zod type still checks every call.
 */
function publishedSchema(schema: z.ZodType, json: unknown): z.ZodType {
  const standard = (schema as unknown as { "~standard": Record<string, unknown> })["~standard"];
  const converter = { input: () => json as Record<string, unknown>, output: () => json as Record<string, unknown> };
  return { "~standard": { ...standard, jsonSchema: converter } } as unknown as z.ZodType;
}
const publishedToolSchemas = Object.fromEntries(
  INTELLIGENCE_TOOLS.map((name) => [name, publishedSchema(toolSchemas[name], artifact.tools[name])]),
) as Record<IntelligenceTool, z.ZodType>;

const descriptions: Record<IntelligenceTool, string> = {
  get_intelligence_context:
    "Read bounded, captured context for the server-created run subject, including Owner instructions and honest coverage. Use supplied captured pages first; do not repeat a read already provided by the worker.",
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
    "Submit one accepted immutable csi-envelope-v1 analysis using the worker-provided run id as idempotency_key. Include all required nullable fields. Finding keys must be unique and every finding_keys reference must exist. The six summary texts together total at most 4000 characters. Cite only identifiers and field paths exposed by captured snapshots. On explicit INVALID_INPUT repair the reported paths and resubmit the same key within the one-repair allowance; do not gather more evidence during repair. Receipt means durable acceptance, not applied effects. Stop on acceptance, uncertain delivery or any other submit error for orchestration status recovery.",
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
        inputSchema: publishedToolSchemas[name],
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
  for (const revision of SCHEMA_REVISIONS) {
    server.registerResource(
      revision.uri,
      revision.uri,
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
            text: revision.text,
          },
        ],
      }),
    );
  }
  for (const version of PROMPT_VERSIONS) {
  server.registerPrompt(
    version,
    {
      description:
        "Retrieve the exact server-pinned prompt. CSI-13 must explicitly load and persist this text and schema digest before invoking its model.",
      argsSchema: z.object({}).strict(),
    },
    async () => {
      const pinned = intelligenceContext().status.prompt_context;
      // The run's own pinned version and digest decide, not this build's
      // current ones: a replay asks for what its parent was asked.
      if (
        pinned.prompt_version !== version ||
        pinned.schema_version !== artifact.schema_version ||
        !SCHEMA_REVISIONS.some((revision) => revision.digest === pinned.schema_digest)
      )
        throw new IntelligenceError("ORIGINAL_EVIDENCE_UNAVAILABLE", 422);
      return {
        description: version,
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
}
