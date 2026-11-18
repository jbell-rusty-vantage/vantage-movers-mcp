import assert from "node:assert/strict";
import test from "node:test";
import { McpServer } from "@modelcontextprotocol/server";
import { managerPromptArgsSchema, managerPromptDefinitions, registerManagerPrompts } from "./prompts";

test("all manager prompts register through the installed SDK", () => {
  const server = new McpServer({ name: "manager-prompt-test", version: "1.0.0" });
  const registered: { name: string; callback: (args: { period: string; focus?: string }) => unknown }[] = [];
  const original = server.registerPrompt.bind(server);
  server.registerPrompt = ((name: string, config: unknown, callback: unknown) => {
    registered.push({ name, callback: callback as (args: { period: string; focus?: string }) => unknown });
    return original(name, config as never, callback as never);
  }) as typeof server.registerPrompt;
  registerManagerPrompts(server);
  assert.equal(registered.length, 6);
  assert.equal(new Set(registered.map(({ name }) => name)).size, 6);
  for (const prompt of registered) {
    const response = prompt.callback({ period: "last week", focus: "Jane\nreview" }) as { messages: { role: string; content: { type: string; text: string } }[] };
    assert.equal(response.messages[0].role, "user");
    assert.equal(response.messages[0].content.type, "text");
    const text = response.messages[0].content.text;
    for (const required of ["America/New_York", "denominator", "agent_allocations", "receiver_agent", "Cancellation", "archive", "unknown", "billability", "read-only", '"period":"last week"']) {
      assert.ok(text.includes(required), `${prompt.name} missing ${required}`);
    }
  }
});

test("period remains free-form while missing periods are rejected", () => {
  assert.equal(managerPromptArgsSchema.parse({ period: "since the start of the month" }).period, "since the start of the month");
  assert.equal(managerPromptArgsSchema.safeParse({}).success, false);
  assert.equal(managerPromptArgsSchema.safeParse({ period: "" }).success, false);
  assert.ok(managerPromptDefinitions.find(({ name }) => name === "intake_review")?.task.includes("may be unavailable"));
});
