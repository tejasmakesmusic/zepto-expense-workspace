# Agent Orientation

This is a local-first Zepto invoice and expense review workspace. The valuable source code lives in `scripts/`, `scripts/lib/`, `scripts/tests/`, `web/zepto-workspace/`, and `docs/`.

## Safety Boundaries

- Do not commit or publish `invoices/`, `outputs/`, `work/`, `.superpowers/`, `node_modules/`, `__pycache__/`, or `pytest-cache-files-*`.
- Treat browser profiles, HTML fallback captures, PDFs, CSVs, XLSX files, annotations, and logs as private user data.
- The downloader launches a persistent Playwright Chrome profile in `work/playwright-zepto-profile`; do not move that into source control.
- The dashboard writes review annotations into `outputs/zepto_review_annotations.json`.

## How To Verify

Use these from the repository root:

```powershell
npm.cmd run test:js
python -m pytest scripts/tests
```

If `npm` is not blocked in the shell, `npm run ...` is fine too.

## Project Shape

- `scripts/run_zepto_workflow.js` orchestrates the full workflow.
- `scripts/zepto_download_invoices.js` handles browser automation and invoice/fallback capture.
- `scripts/extract_zepto_invoices.py` parses PDFs into invoice rows.
- `scripts/reconcile_zepto_data.js` produces reconciled order rows.
- `scripts/build_zepto_expense_workbook.py` exports the workbook.
- `scripts/serve_zepto_workspace.js` exposes the dashboard API and static assets.
- `web/zepto-workspace/` renders the browser UI without a frontend build step.

Keep changes small and test focused. Prefer adding or updating tests under `scripts/tests/` when changing parser, reconciliation, sync, dataset, or server behavior.
