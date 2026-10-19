export type Span = {
  id: string;
  traceId: string;
  parentId?: string;
  name: string;
  service: string;
  start: number;
  duration: number;
  error: boolean;
  attributes: Record<string, string>;
};
export type Dataset = { spans: Span[]; warnings: string[] };
type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected a JSON object.");
  return value as RecordValue;
};
const list = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) throw new Error("Expected a JSON array.");
  return value;
};
const text = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value || value.length > 4096)
    throw new Error(`Invalid ${field}.`);
  return value;
};
const number = (value: unknown, field: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new Error(`Invalid ${field}.`);
  return value;
};
const nano = (value: unknown): bigint => {
  if (typeof value !== "string" || !/^\d{1,24}$/.test(value))
    throw new Error("OTLP timestamps must be integer strings.");
  return BigInt(value);
};

function attributes(value: unknown): Record<string, string> {
  if (value === undefined) return {};
  return Object.fromEntries(
    list(value)
      .slice(0, 100)
      .map((item) => {
        const row = object(item),
          v = object(row.value);
        return [
          text(row.key, "attribute key"),
          String(
            v.stringValue ??
              v.intValue ??
              v.doubleValue ??
              v.boolValue ??
              "[complex value]",
          ).slice(0, 4096),
        ];
      }),
  );
}

export function parseDataset(source: string): Dataset {
  if (source.length > 10 * 1024 * 1024)
    throw new Error("File is larger than 10 MiB.");
  const input = object(JSON.parse(source));
  let spans: Span[];
  if ("resourceSpans" in input) {
    const raw: {
      span: RecordValue;
      service: string;
      start: bigint;
      end: bigint;
    }[] = [];
    for (const item of list(input.resourceSpans)) {
      const resource = object(item);
      const attrs = resource.resource
        ? attributes(object(resource.resource).attributes)
        : {};
      for (const scope of list(resource.scopeSpans ?? [])) {
        for (const item of list(object(scope).spans ?? [])) {
          const span = object(item);
          raw.push({
            span,
            service: attrs["service.name"] || "unknown-service",
            start: nano(span.startTimeUnixNano),
            end: nano(span.endTimeUnixNano),
          });
          if (raw.length > 10000)
            throw new Error("Limit: 10,000 spans per file.");
        }
      }
    }
    const base = raw.reduce(
      (min, row) => (row.start < min ? row.start : min),
      raw[0]?.start ?? 0n,
    );
    spans = raw.map(({ span, service, start, end }) => {
      if (end < start || end - base > BigInt(Number.MAX_SAFE_INTEGER))
        throw new Error("Invalid or excessively wide timestamp range.");
      const status = span.status ? object(span.status).code : undefined;
      return {
        id: text(span.spanId, "spanId"),
        traceId: text(span.traceId, "traceId"),
        parentId: span.parentSpanId
          ? text(span.parentSpanId, "parentSpanId")
          : undefined,
        name: text(span.name, "name"),
        service,
        start: Number(start - base) / 1e6,
        duration: Number(end - start) / 1e6,
        error: status === 2 || status === "STATUS_CODE_ERROR",
        attributes: attributes(span.attributes),
      };
    });
  } else {
    const rows = list(input.spans);
    if (rows.length > 10000) throw new Error("Limit: 10,000 spans per file.");
    spans = rows.map((item) => {
      const row = object(item);
      if (typeof row.error !== "boolean")
        throw new Error("error must be a boolean.");
      const attrs = row.attributes === undefined ? {} : object(row.attributes);
      if (Object.values(attrs).some((v) => typeof v !== "string"))
        throw new Error("Attributes must be strings.");
      return {
        id: text(row.id, "id"),
        traceId: text(row.traceId, "traceId"),
        parentId: row.parentId ? text(row.parentId, "parentId") : undefined,
        name: text(row.name, "name"),
        service: text(row.service, "service"),
        start: number(row.start, "start"),
        duration: number(row.duration, "duration"),
        error: row.error,
        attributes: attrs as Record<string, string>,
      };
    });
  }
  if (!spans.length) throw new Error("No spans found in this file.");
  const keyed = new Map<string, Span>();
  const key = (s: Span) => `${s.traceId}\u0000${s.id}`;
  for (const span of spans) {
    if (
      span.traceId.includes("\u0000") ||
      span.id.includes("\u0000") ||
      span.parentId?.includes("\u0000")
    )
      throw new Error("IDs cannot contain null characters.");
    if (!Number.isFinite(span.start + span.duration))
      throw new Error("Timestamp overflow.");
    if (keyed.has(key(span)))
      throw new Error("Duplicate span ID within a trace.");
    keyed.set(key(span), span);
  }
  const warnings: string[] = [];
  const completed = new Set<string>();
  for (const start of spans) {
    let current: Span | undefined = start;
    const visiting = new Set<string>();
    while (current && !completed.has(key(current))) {
      const ident = key(current);
      if (visiting.has(ident))
        throw new Error("Cycle detected in span parents.");
      visiting.add(ident);
      const parent: Span | undefined = current.parentId
        ? keyed.get(`${current.traceId}\u0000${current.parentId}`)
        : undefined;
      if (current.parentId && !parent)
        warnings.push(`Missing parent for ${current.id}. Shown as a root.`);
      if (
        parent &&
        (current.start < parent.start ||
          current.start + current.duration > parent.start + parent.duration)
      )
        warnings.push(
          `Span ${current.id} extends beyond its parent; check clock skew or asynchronous work.`,
        );
      current = parent;
    }
    for (const ident of visiting) completed.add(ident);
  }
  return { spans, warnings };
}

export function selfTime(span: Span, spans: Span[]): number {
  const intervals = spans
    .filter((s) => s.traceId === span.traceId && s.parentId === span.id)
    .map((s) => [
      Math.max(span.start, s.start),
      Math.min(span.start + span.duration, s.start + s.duration),
    ])
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);
  let covered = 0,
    end = span.start;
  for (const [start, stop] of intervals) {
    covered += Math.max(0, stop - Math.max(start, end));
    end = Math.max(end, stop);
  }
  return Math.max(0, span.duration - covered);
}

export function treeRows(spans: Span[]): { span: Span; depth: number }[] {
  const ids = new Set(spans.map((s) => s.id));
  const children = new Map<string, Span[]>();
  for (const span of spans) {
    const parent = span.parentId && ids.has(span.parentId) ? span.parentId : "";
    const siblings = children.get(parent);
    if (siblings) siblings.push(span);
    else children.set(parent, [span]);
  }
  for (const rows of children.values())
    rows.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  const stack = (children.get("") || [])
    .map((span) => ({ span, depth: 0 }))
    .reverse();
  const result: { span: Span; depth: number }[] = [];
  while (stack.length) {
    const row = stack.pop()!;
    result.push(row);
    const next = (children.get(row.span.id) || []).map((span) => ({
      span,
      depth: row.depth + 1,
    }));
    stack.push(...next.reverse());
  }
  return result;
}

export function percentile(values: number[], q: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)];
}
