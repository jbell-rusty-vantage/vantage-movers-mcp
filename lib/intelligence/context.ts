import { AsyncLocalStorage } from "node:async_hooks";
import { IntelligenceError, type IntelligenceCredentials, type IntelligenceTool } from "./auth";

export type PromptContext = {
  rendered_prompt: string; prompt_version: string; schema_version: string;
  schema_digest: string; mode: string;
};
export type SubmissionStatus = {
  run_id: string; status: "running" | "submitted"; submission: unknown | null;
  prompt_context: PromptContext;
};
export type IntelligenceContext = IntelligenceCredentials & { status: SubmissionStatus };
const storage = new AsyncLocalStorage<IntelligenceContext>();
export const runWithIntelligenceContext = <T>(context: IntelligenceContext, callback: () => T): T => storage.run(context, callback);
export function intelligenceContext(tool?: IntelligenceTool): IntelligenceContext {
  const context = storage.getStore();
  if (!context || (tool && !context.claims.tools.includes(tool))) throw new IntelligenceError("RUN_SCOPE_DENIED");
  return context;
}
