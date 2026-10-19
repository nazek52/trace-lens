import { SpanInspector } from "./SpanInspector";
import { ms } from "./format";
import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { type Dataset, type Span, percentile, treeRows } from "./model";
import { sample } from "./sample";
import "./style.css";

const colors = [
  "#b7ed78",
  "#72bfdd",
  "#c7a3f3",
  "#f2bc70",
  "#e88e9c",
  "#7ac7b4",
  "#aebee0",
];
function App() {
  const [dataset, setDataset] = useState<Dataset>(sample),
    [trace, setTrace] = useState(sample.spans[0].traceId);
  const [selected, setSelected] = useState<Span | undefined>(
    sample.spans.find((s) => s.id === "payment"),
  );
  const [query, setQuery] = useState(""),
    [service, setService] = useState("all"),
    [errors, setErrors] = useState(false);
  const [page, setPage] = useState(0),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [filename, setFilename] = useState("Synthetic checkout trace");
  const input = useRef<HTMLInputElement>(null),
    worker = useRef<Worker | null>(null),
    generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
      worker.current?.terminate();
    },
    [],
  );
  const traces = useMemo(
    () => Array.from(new Set(dataset.spans.map((s) => s.traceId))),
    [dataset],
  );
  const spans = useMemo(
    () => dataset.spans.filter((s) => s.traceId === trace),
    [dataset, trace],
  );
  const services = useMemo(
    () => Array.from(new Set(spans.map((s) => s.service))).sort(),
    [spans],
  );
  const color = (name: string) =>
    colors[Math.max(0, services.indexOf(name)) % colors.length];
  const start = spans.reduce((min, s) => Math.min(min, s.start), Infinity),
    end = spans.reduce((max, s) => Math.max(max, s.start + s.duration), 0),
    duration = Math.max(0, end - start);
  const rows = useMemo(
    () =>
      treeRows(spans).filter(
        ({ span }) =>
          (service === "all" || span.service === service) &&
          (!errors || span.error) &&
          `${span.name} ${span.service} ${span.id}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [spans, service, errors, query],
  );
  const reset = () => {
    setQuery("");
    setService("all");
    setErrors(false);
    setPage(0);
  };
  async function openFile(file: File) {
    const id = ++generation.current;
    worker.current?.terminate();
    setBusy(false);
    if (file.size > 10 * 1024 * 1024) {
      setNotice("Choose a JSON file no larger than 10 MiB.");
      return;
    }
    setBusy(true);
    setNotice("Parsing locally…");
    try {
      const source = await file.text();
      if (id !== generation.current) return;
      const parser = new Worker(
        new URL("./parser.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current = parser;
      parser.onmessage = (event) => {
        if (id !== generation.current) return;
        setBusy(false);
        parser.terminate();
        if (event.data.ok) {
          const data: Dataset = event.data.dataset;
          setDataset(data);
          setTrace(data.spans[0].traceId);
          setSelected(undefined);
          setFilename(file.name);
          reset();
          setNotice(`Loaded ${data.spans.length} spans. Nothing was uploaded.`);
        } else
          setNotice(
            `Import failed: ${event.data.error} Your previous trace is still open.`,
          );
      };
      parser.onerror = () => {
        if (id !== generation.current) return;
        setBusy(false);
        parser.terminate();
        setNotice("Parser failed. Your previous trace is still open.");
      };
      parser.postMessage(source);
    } catch {
      if (id === generation.current) {
        setBusy(false);
        setNotice("Could not read the file.");
      }
    }
  }
  function exportTrace() {
    const blob = new Blob([JSON.stringify({ spans }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "trace-lens-export.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="app">
      <aside className="rail">
        <a className="logo" href="#main" aria-label="Trace Lens home">
          ⌁
        </a>
        <span className="rail-active" aria-hidden="true">
          ▥
        </span>
        <span className="rail-caption">
          LOCAL
          <br />
          ONLY
        </span>
      </aside>
      <div className="shell">
        <header>
          <div className="brand">
            Trace Lens <span>/ EXPLORER</span>
          </div>
          <div className="privacy">
            <i /> Private by design
          </div>
          <a
            href="https://opentelemetry.io/docs/concepts/signals/traces/"
            target="_blank"
            rel="noreferrer"
          >
            Trace concepts ↗
          </a>
        </header>
        <main id="main">
          <section className="hero">
            <div>
              <p className="eyebrow">OBSERVE THE PATH. FIND THE WAIT.</p>
              <h1>Follow the latency.</h1>
              <p>
                Read a request from edge to database. Keep the evidence on your
                machine.
              </p>
            </div>
            <div className="import-actions">
              <input
                ref={input}
                type="file"
                accept=".json,application/json"
                aria-label="Import trace JSON"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void openFile(file);
                  e.target.value = "";
                }}
                hidden
              />
              <button
                className="primary"
                disabled={busy}
                onClick={() => input.current?.click()}
              >
                {busy ? "Reading trace…" : "↑ Import trace JSON"}
              </button>
              <span>OTLP JSON or Trace Lens format · up to 10 MiB</span>
            </div>
          </section>
          <div className="filebar">
            <span className="file-dot" />
            <strong>{filename}</strong>
            <span>
              {dataset.spans.length} spans / {traces.length} trace
              {traces.length === 1 ? "" : "s"}
            </span>
            <button
              onClick={() => {
                generation.current++;
                worker.current?.terminate();
                setBusy(false);
                setDataset(sample);
                setTrace(sample.spans[0].traceId);
                setSelected(sample.spans[6]);
                setFilename("Synthetic checkout trace");
                reset();
                setNotice("Synthetic example loaded.");
              }}
            >
              Load example
            </button>
            <button onClick={exportTrace}>Export trace ↓</button>
          </div>
          <section className="metrics" aria-label="Selected trace summary">
            {[
              ["TRACE DURATION", ms(duration), "Wall-clock elapsed time"],
              ["SERVICES", String(services.length), "Across the request path"],
              [
                "ERROR SPANS",
                String(spans.filter((s) => s.error).length),
                "OTLP status = ERROR",
              ],
              [
                "P95 SPAN DURATION",
                ms(
                  percentile(
                    spans.map((s) => s.duration),
                    0.95,
                  ),
                ),
                "Nearest-rank · nested spans",
              ],
            ].map(([label, value, hint]) => (
              <article key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>{hint}</small>
              </article>
            ))}
          </section>
          <div className="toolbar">
            <label className="search">
              <span className="sr-only">Search spans</span>
              <input
                placeholder="Search operation, service, or span ID…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
              />
            </label>
            <label>
              <span className="sr-only">Service filter</span>
              <select
                value={service}
                onChange={(e) => {
                  setService(e.target.value);
                  setPage(0);
                }}
              >
                <option value="all">All services</option>
                {services.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={errors}
                onChange={(e) => {
                  setErrors(e.target.checked);
                  setPage(0);
                }}
              />{" "}
              Errors only
            </label>
            <label>
              <span className="sr-only">Selected trace</span>
              <select
                className="trace-select"
                value={trace}
                onChange={(e) => {
                  setTrace(e.target.value);
                  setSelected(undefined);
                  reset();
                }}
              >
                {traces.map((id) => (
                  <option key={id}>{id}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="explorer">
            <section className="waterfall">
              <div className="waterfall-heading">
                <h2>Request waterfall</h2>
                <span>{rows.length} matching spans</span>
              </div>
              <div className="ruler">
                <span>OPERATION / SERVICE</span>
                <div>
                  {[0, 0.25, 0.5, 0.75, 1].map((n) => (
                    <span key={n}>{Math.round(duration * n)} ms</span>
                  ))}
                </div>
              </div>
              <div className="span-list">
                {rows
                  .slice(page * 100, (page + 1) * 100)
                  .map(({ span, depth }) => (
                    <button
                      className={`span-row ${selected?.id === span.id ? "selected" : ""}`}
                      key={span.id}
                      onClick={() => setSelected(span)}
                      aria-pressed={selected?.id === span.id}
                      aria-label={`${span.name}, ${span.service}, ${ms(span.duration)}${span.error ? ", error" : ""}`}
                    >
                      <div
                        className="span-name"
                        style={{ paddingLeft: 14 + Math.min(depth, 6) * 12 }}
                      >
                        <span
                          className="service-dot"
                          style={{ background: color(span.service) }}
                        />
                        <div>
                          <strong>
                            {span.error && (
                              <span className="error-mark">! </span>
                            )}
                            {span.name}
                          </strong>
                          <small>{span.service}</small>
                        </div>
                      </div>
                      <div className="track">
                        <div
                          className={`bar ${span.error ? "failed" : ""}`}
                          style={{
                            left: `${(100 * (span.start - start)) / Math.max(duration, 1)}%`,
                            width: `${Math.max(0.3, (100 * span.duration) / Math.max(duration, 1))}%`,
                            background: color(span.service),
                          }}
                        />
                        <span className="bar-label">{ms(span.duration)}</span>
                      </div>
                    </button>
                  ))}
              </div>
              {!rows.length && (
                <div className="empty">
                  <h3>No matching spans</h3>
                  <p>Try another service or reset your filters.</p>
                  <button onClick={reset}>Reset filters</button>
                </div>
              )}
              {rows.length > 100 && (
                <nav className="pagination" aria-label="Span pages">
                  <button
                    disabled={page === 0}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </button>
                  <span>
                    Page {page + 1} / {Math.ceil(rows.length / 100)}
                  </span>
                  <button
                    disabled={(page + 1) * 100 >= rows.length}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </button>
                </nav>
              )}
              <div className="legend">
                {services.map((s) => (
                  <span key={s}>
                    <i style={{ background: color(s) }} />
                    {s}
                  </span>
                ))}
              </div>
            </section>
            <SpanInspector
              selected={selected}
              spans={spans}
              start={start}
              color={color}
            />
          </div>
          {dataset.warnings.length > 0 && (
            <details className="warnings">
              <summary>
                {dataset.warnings.length} data quality warning(s)
              </summary>
              <ul>
                {dataset.warnings.slice(0, 100).map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
              {dataset.warnings.length > 100 && (
                <p>Showing the first 100 warnings.</p>
              )}
            </details>
          )}
          <p role="status" className="status">
            {notice}
          </p>
          <footer>
            <span>TRACE LENS / ENGINEERING TOOLKIT</span>
            <span>No server. No uploads. No tracking.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
