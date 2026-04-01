const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function normalizeQuotedValue(value: string): string {
  if (value.length < 2) {
    return value;
  }

  const quote = value[0];
  if ((quote !== '"' && quote !== "'") || value[value.length - 1] !== quote) {
    return value;
  }

  const inner = value.slice(1, -1);
  if (quote === "'") {
    return inner;
  }

  return inner
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

export function parseEnvAssignments(content: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const withoutExport = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const separator = withoutExport.indexOf("=");

    if (separator < 1) {
      continue;
    }

    const key = withoutExport.slice(0, separator).trim();
    if (!KEY_PATTERN.test(key)) {
      continue;
    }

    const rawValue = withoutExport.slice(separator + 1).trim();
    parsed[key] = normalizeQuotedValue(rawValue);
  }

  return parsed;
}
