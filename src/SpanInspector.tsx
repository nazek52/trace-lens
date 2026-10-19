import { type Span, selfTime } from "./model";
import { ms } from "./format";

type Props = {
  selected?: Span;
  spans: Span[];
  start: number;
  color: (service: string) => string;
};
export function SpanInspector({ selected, spans, start, color }: Props) {
  return (
    <aside className="inspector" aria-label="Span details">
      {selected ? (
        <>
          <p className="eyebrow">SPAN INSPECTOR</p>
          <h2>{selected.name}</h2>
          <p className="inspector-service">
            <i style={{ background: color(selected.service) }} />
            {selected.service}
          </p>
          <dl>
            <div>
              <dt>Duration</dt>
              <dd>{ms(selected.duration)}</dd>
            </div>
            <div>
              <dt>Self time estimate</dt>
              <dd>{ms(selfTime(selected, spans))}</dd>
            </div>
            <div>
              <dt>Start offset</dt>
              <dd>{ms(selected.start - start)}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{selected.error ? "ERROR" : "Not marked as error"}</dd>
            </div>
          </dl>
          <p className="explanation">
            Self time excludes the union of direct child intervals. It is not
            CPU time or a causal critical path.
          </p>
          <h3>Identifiers</h3>
          <code>{selected.id}</code>
          <h3>Attributes</h3>
          <div className="attributes">
            {Object.entries(selected.attributes).map(([key, value]) => (
              <div key={key}>
                <span>{key}</span>
                <code>{value}</code>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="empty">
          <span>⌖</span>
          <h2>Inspect a span</h2>
          <p>Select an operation to examine its timing and attributes.</p>
        </div>
      )}
    </aside>
  );
}
