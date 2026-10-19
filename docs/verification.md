# Verification record

Executed 2026-10-19 on Windows, Node.js 24.19.0, Chromium via Playwright.

- **11 unit tests passed**: duplicate IDs, parent cycles, orphans, invalid timing, nanosecond precision, a 10,000-deep tree, import cap, overlapping child intervals, clipping, tree order and percentile semantics.
- **5 browser tests passed**: filters/inspection; real Worker OTLP import and invalid-file preservation; export/re-import with no POST requests; mobile overflow and keyboard focus; desktop runtime errors and screenshot.
- TypeScript compilation and production Vite build passed. Main bundle approximately **74kB gzip**, parser Worker approximately **3.5kB uncompressed** in this build.
- npm dependency audit reported **0 vulnerabilities** at the time of validation; this is not a permanent security guarantee.

The desktop screenshot in README comes from the real application. Mobile was checked at 390×844 and desktop at 1440×1100. No full screen-reader, cross-browser or adversarial fuzzing audit is claimed. CI reruns unit/build/browser checks on Linux; inspect the current workflow result.
