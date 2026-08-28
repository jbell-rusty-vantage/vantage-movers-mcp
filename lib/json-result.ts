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
  return `${text.slice(0, maxChars)}\n…truncated ${text.length - maxChars} characters`;
}

export function toolTextResult(value: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: toToolText(value) }],
    isError,
  };
}

export function toolErrorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return toolTextResult({ ok: false, error: message }, true);
}
