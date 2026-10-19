# Frontend architecture

## Parsing boundary
The browser checks file size before reading. A Web Worker parses and validates up to 10,000 spans; the main thread receives only a normalized dataset. Each import has a generation number and terminates the previous worker. A late result from an older file cannot replace newer state. Invalid input leaves the last valid trace available for inspection.

## Timing and topology
For OTLP input, timestamps stay BigInt until the common origin is subtracted. Conversion to milliseconds happens only after subtracting. A parent lookup map is scoped by trace ID; a visited/complete traversal detects cycles without recursive calls. Rendering walks an iterative stack. A deep trace therefore cannot exhaust the JavaScript call stack.

## Responsiveness
Only 100 matching rows are rendered per page. File parsing runs outside the main thread. Service labels and error text preserve meaning independent of color. Mobile layout places the inspector below the waterfall and reduces indentation without hiding data. Filters and selections are React state; no server cache or persisted trace store exists.

## Self time
Direct-child intervals are clipped to the parent's range, sorted, and merged. The union length is subtracted from parent duration. Summing child durations would double-count overlap. This remains a timing estimate, not CPU usage or a causal critical path.

## Intentional scope
OTLP JSON export subset and a portable normalized format; no protobuf decoder, live collector, remote storage, complete resource-attribute model, or service worker. Real traces may contain sensitive attributes; importing them keeps them local, but exported downloads are still the user's files.
