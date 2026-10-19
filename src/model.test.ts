import { describe, it, expect } from "vitest";
import {
  parseDataset,
  selfTime,
  treeRows,
  percentile,
  type Span,
} from "./model";
const span = (
  id = "root",
  parentId?: string,
  start = 0,
  duration = 100,
): Span => ({
  id,
  parentId,
  traceId: "trace",
  name: id,
  service: "api",
  start,
  duration,
  error: false,
  attributes: {},
});
const parse = (spans: Span[]) => parseDataset(JSON.stringify({ spans }));
describe("trace validation", () => {
  it("rejects duplicate IDs within a trace but allows the same ID across traces", () => {
    expect(() => parse([span(), span()])).toThrow("Duplicate");
    expect(parse([span(), { ...span(), traceId: "other" }]).spans).toHaveLength(
      2,
    );
  });
  it("rejects cycles and self-parenting", () => {
    expect(() => parse([span("a", "b"), span("b", "a")])).toThrow("Cycle");
    expect(() => parse([span("a", "a")])).toThrow("Cycle");
  });
  it("reports missing parents without losing spans", () => {
    const result = parse([span("a", "missing")]);
    expect(result.warnings).toHaveLength(1);
    expect(treeRows(result.spans)).toHaveLength(1);
  });
  it("rejects invalid timing and malformed input", () => {
    expect(() => parse([{ ...span(), duration: -1 }])).toThrow();
    expect(() => parseDataset("{")).toThrow();
    expect(() => parseDataset('{"spans":[]}')).toThrow("No spans");
    expect(() => parseDataset('{"spans":[{}]}')).toThrow();
  });
  it("preserves nanosecond differences before conversion", () => {
    const result = parseDataset(
      JSON.stringify({
        resourceSpans: [
          {
            resource: {
              attributes: [
                { key: "service.name", value: { stringValue: "api" } },
              ],
            },
            scopeSpans: [
              {
                spans: [
                  {
                    spanId: "s",
                    traceId: "t",
                    name: "work",
                    startTimeUnixNano: "1720000000000000000",
                    endTimeUnixNano: "1720000000000001234",
                    status: { code: 2 },
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    expect(result.spans[0].duration).toBe(0.001234);
    expect(result.spans[0].error).toBe(true);
    expect(result.spans[0].service).toBe("api");
  });
  it("supports a deep valid tree without recursive stack overflow", () => {
    const spans = Array.from({ length: 10000 }, (_, i) =>
      span(String(i), i ? String(i - 1) : undefined),
    );
    expect(treeRows(parse(spans).spans)).toHaveLength(10000);
  });
  it("caps imported span count", () => {
    expect(() =>
      parse(Array.from({ length: 10001 }, (_, i) => span(String(i)))),
    ).toThrow("10,000");
  });
});
describe("timing math", () => {
  it("subtracts union rather than double-counting overlapping children", () => {
    const root = span();
    expect(
      selfTime(root, [
        root,
        span("a", "root", 10, 50),
        span("b", "root", 40, 40),
      ]),
    ).toBe(30);
  });
  it("clips child intervals to parent and ignores other traces", () => {
    const root = span("root", undefined, 10, 40);
    expect(
      selfTime(root, [
        root,
        span("a", "root", 0, 20),
        { ...span("b", "root", 10, 40), traceId: "elsewhere" },
      ]),
    ).toBe(30);
  });
  it("orders siblings by time and retains parent depth", () => {
    const rows = treeRows([
      span("b", "root", 20),
      span(),
      span("a", "root", 10),
    ]);
    expect(rows.map((r) => r.span.id)).toEqual(["root", "a", "b"]);
    expect(rows[1].depth).toBe(1);
  });
  it("uses nearest rank and handles empty observations", () => {
    expect(percentile([], 0.95)).toBe(0);
    expect(percentile([4, 1, 2, 3], 0.5)).toBe(2);
  });
});
