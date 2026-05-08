# Architecture

## Data Flow

```mermaid
flowchart LR
  Zepto["Zepto orders page"] --> Downloader["scripts/zepto_download_invoices.js"]
  Downloader --> Invoices["invoices/*.pdf"]
  Downloader --> Ledger["outputs/zepto_orders_ledger.json"]
  Downloader --> Fallbacks["outputs/zepto_html_fallbacks.json"]
  Invoices --> Parser["scripts/extract_zepto_invoices.py"]
  Parser --> InvoiceRows["outputs/zepto_invoice_rows.json"]
  Ledger --> Reconcile["scripts/reconcile_zepto_data.js"]
  InvoiceRows --> Reconcile
  Fallbacks --> Reconcile
  Reconcile --> Reconciled["outputs/zepto_reconciliation.json"]
  Reconciled --> Server["scripts/serve_zepto_workspace.js"]
  InvoiceRows --> Server
  Fallbacks --> Server
  Server --> Dashboard["web/zepto-workspace"]
  Reconciled --> Workbook["scripts/build_zepto_expense_workbook.py"]
  InvoiceRows --> Workbook
```

## Runtime Layers

- Capture layer: `scripts/zepto_download_invoices.js` drives a visible Chrome session with Playwright, saves PDFs, and captures HTML fallback data.
- Parse layer: `scripts/extract_zepto_invoices.py` extracts invoice-level fields and line-item rows from PDFs.
- Reconciliation layer: `scripts/lib/zepto_reconciliation.js` merges captured orders, downloads, parsed invoices, and fallback status.
- Dataset layer: `scripts/lib/zepto_workspace_data.js` builds the dashboard dataset, line item view, source metadata, and workbench issues.
- Review layer: `scripts/lib/zepto_review_annotations.js` persists order and line-item annotations in generated JSON.
- AI layer: `scripts/lib/zepto_ai_assistant.js` redacts local data, calls the selected OpenAI or Anthropic provider, and normalizes staged suggestions.
- UI layer: `web/zepto-workspace/` is a static JavaScript app served by `scripts/serve_zepto_workspace.js`.
- Export layer: `scripts/build_zepto_expense_workbook.py` writes the review workbook with openpyxl.

## AI Data Flow

AI features are optional and local-key based:

1. User saves provider settings in the dashboard.
2. Server stores settings in `outputs/zepto_ai_settings.json`.
3. AI action routes load the current local dataset.
4. Redaction removes names, addresses, GSTINs, invoice file paths, and raw private fields by default.
5. The provider receives only the redacted action payload.
6. Returned suggestions are displayed for review.
7. Applying line-item suggestions writes normal annotations through the existing annotation path.

## Testing

JavaScript tests use Node's built-in `node:test` runner. Python tests use `pytest` but are written with `unittest` assertions.

Run:

```powershell
npm.cmd run test:js
python -m pytest scripts/tests
```
