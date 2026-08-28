import { AsyncLocalStorage } from "node:async_hooks";

export type McpRequestContext = {
  apiSecret: string;
};

const requestContext = new AsyncLocalStorage<McpRequestContext>();

export function runWithRequestContext<T>(
  context: McpRequestContext,
  fn: () => T,
): T {
  return requestContext.run(context, fn);
}

export function getRequestContext(): McpRequestContext {
  const context = requestContext.getStore();
  if (!context?.apiSecret) {
    throw new Error("MCP request is missing a verified VANTAGE_API_SECRET");
  }
  return context;
}

export function getApiSecret(): string {
  return getRequestContext().apiSecret;
}
