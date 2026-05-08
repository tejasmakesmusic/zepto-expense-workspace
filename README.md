# Zepto Expense Workspace

A local workflow for downloading Zepto order invoices, parsing invoice line items, reconciling them with the order ledger, and reviewing the resulting expense data in a browser dashboard.

The project is designed to run on a local machine because Zepto login and invoice downloads require an authenticated browser session. It keeps personal PDFs, browser profiles, and generated reports out of Git by default.

## What You Need

- Windows, macOS, or Linux with a desktop browser
- Node.js 20 or newer
- Python 3.12 or newer
- Google Chrome installed
- A Zepto account with access to `https://www.zepto.com/account/orders`
- Git, if you want to version or publish your changes

PowerShell note: if Windows blocks `npm`, use `npm.cmd` in the commands below.

## Quick Start

```powershell
npm.cmd install
python -m pip install -r requirements-dev.txt
npm.cmd run test
npm.cmd run serve
```

Open `http://127.0.0.1:4317` for the local dashboard.

To run the full data workflow:

```powershell
npm.cmd run workflow
```

The workflow opens a Chrome window. Log into Zepto if prompted and leave the browser available while it collects order links and invoices.

If you already have PDFs in `invoices/` and only want to rebuild parsed outputs:

```powershell
npm.cmd run workflow:skip-download
```

## Main Commands

- `npm run download` opens Chrome, collects Zepto orders, downloads missing invoice PDFs, and captures HTML fallback pages when needed.
- `npm run parse` reads `invoices/*.pdf` and writes parsed line item JSON/CSV files.
- `npm run reconcile` joins the order ledger, download summary, parsed invoices, and fallback records.
- `npm run workbook` builds `outputs/zepto_expense_split_ready.xlsx`.
- `npm run workflow` runs download, parse, reconcile, and workbook generation end to end.
- `npm run serve` starts the local dashboard at `http://127.0.0.1:4317`.
- `npm run test` runs JavaScript and Python tests.

## Optional AI Features

The dashboard has an `AI Assistant` view. Users can bring their own OpenAI or Anthropic API key to:

- auto-categorize invoice line items
- explain invoice/order mismatches
- suggest Splitwise-ready tags
- summarize monthly spending
- detect unusual purchases or duplicate invoices
- structure messy HTML fallback captures
- ask natural-language questions about the local dataset

AI suggestions are staged for review. They are not applied to annotations until the user clicks Apply.

## Repository Map

- `scripts/zepto_download_invoices.js` - Playwright workflow for Zepto order and invoice capture.
- `scripts/extract_zepto_invoices.py` - PDF parser for Zepto invoice fields and line items.
- `scripts/reconcile_zepto_data.js` - reconciles orders, downloads, parsed invoices, and HTML fallback captures.
- `scripts/build_zepto_expense_workbook.py` - builds the review workbook with openpyxl.
- `scripts/serve_zepto_workspace.js` - local HTTP server and dashboard API.
- `scripts/lib/zepto_ai_assistant.js` - optional OpenAI/Anthropic AI assistant layer with redaction.
- `scripts/lib/` - reusable parsing, reconciliation, sync, insight, and annotation helpers.
- `web/zepto-workspace/` - static browser dashboard.
- `scripts/tests/` - Node and Python tests with redacted text fixtures.
- `docs/` - setup, workflow, architecture, and privacy notes.

## Private Data

These directories are intentionally ignored by Git:

- `invoices/` for downloaded invoice PDFs
- `outputs/` for generated JSON, CSV, XLSX, annotations, logs, and HTML fallback captures
- `work/` for browser profiles, screenshots, temporary pages, and local debugging files
- `.superpowers/` for local planning/runtime state

Review `docs/DATA_PRIVACY.md` before publishing a repo or sharing a ZIP.

## More Docs

- `docs/SETUP.md` for first-time installation and platform notes
- `docs/WORKFLOW.md` for operating the downloader, parser, dashboard, and workbook
- `docs/ARCHITECTURE.md` for how the modules fit together
- `docs/DATA_PRIVACY.md` for what not to commit or share
- `AGENTS.md` for LLM/code-agent orientation
