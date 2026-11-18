const REDACT_KEY = /^(authorization|cookie|set-cookie|x-api-secret|x-vantage-api-secret|vantage_api_secret|mongo_uri|mongodb_uri|password|secret)$/i;

const DEFAULT_MAX_CHARS = 24_000;

export function redactValue(key: string, value: unknown): unknown {
  if (REDACT_KEY.test(key)) {
    return "[redacted]";
  }
  return value;
}

export function redactUnknown(value: unknown, seen = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item, seen));
  }
  if (value && typeof value === "object") {
    if (value instanceof Date) return value.toISOString();
    if ("_bsontype" in value && "toJSON" in value && typeof value.toJSON === "function") {
      return value.toJSON();
    }
    if (seen.has(value)) {
      return "[circular]";
    }
    seen.add(value);
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, nested]) => [key, redactValue(key, redactUnknown(nested, seen))],
    );
    return Object.fromEntries(entries);
  }
  return value;
}

export function toToolText(value: unknown, maxChars = DEFAULT_MAX_CHARS): string {
  const redacted = redactUnknown(value);
  const text =
    typeof redacted === "string" ? redacted : JSON.stringify(redacted, null, 2);
  if (text.length <= maxChars) {
    return text;
  }
  const compact = JSON.stringify(redacted);
  if (compact.length <= maxChars) return compact;
  // Drop whole trailing records, never half a JSON document. Preserve summary fields
  // and report every omitted array so a sample cannot masquerade as a total.
  const omitted: Record<string, number> = {};
  const envelope = {
    output_coverage: {
      complete: false,
      reason: "response_budget",
      instruction: "Partial output. Use a narrower view, smaller page or exact record. Do not total the returned sample.",
      omitted_array_items: omitted,
    },
    result: redacted,
  };
  for (let attempt = 0; attempt < 200; attempt++) {
    const arrays: { path: string; value: unknown[]; size: number }[] = [];
    function visit(item: unknown, path: string) {
      if (!item || typeof item !== "object") return;
      if (Array.isArray(item) && item.length) arrays.push({ path, value: item, size: JSON.stringify(item).length });
      for (const [key, child] of Object.entries(item)) visit(child, `${path}/${key}`);
    }
    visit(redacted, "");
    arrays.sort((a, b) => b.size - a.size);
    const largest = arrays[0];
    if (!largest) break;
    const removed = largest.value.splice(Math.floor(largest.value.length / 2));
    omitted[largest.path || "/"] = (omitted[largest.path || "/"] ?? 0) + removed.length;
    const bounded = JSON.stringify(envelope);
    if (bounded.length <= maxChars) return bounded;
  }
  return JSON.stringify({ ok: false, error: "RESPONSE_TOO_LARGE", output_coverage: { complete: false }, instruction: "Request a narrower view or smaller page; this result has been withheld rather than cut mid-record." });
}

export function toolTextResult(value: unknown, isError = false) {
  const text = toToolText(value);
  const apiFailure = !!value && typeof value === "object" && (
    ("ok" in value && value.ok === false) ||
    ("data" in value && !!value.data && typeof value.data === "object" && "ok" in value.data && value.data.ok === false)
  );
  return {
    content: [{ type: "text" as const, text }],
    isError: isError || apiFailure || text.includes('"error":"RESPONSE_TOO_LARGE"'),
  };
}

export function toolErrorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return toolTextResult({ ok: false, error: message }, true);
}
