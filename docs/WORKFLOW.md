# Workflow

## End-To-End Run

```powershell
npm.cmd run workflow
```

This runs four steps:

1. Opens Chrome and downloads/reuses Zepto invoice PDFs.
2. Parses invoice PDFs from `invoices/`.
3. Reconciles parsed invoice data with the captured order ledger.
4. Builds `outputs/zepto_expense_split_ready.xlsx`.

The first step needs an authenticated Zepto browser session. If Chrome opens to a login page, log in manually and let the script continue.

## Rebuild Without Downloading

Use this when PDFs are already present in `invoices/`:

```powershell
npm.cmd run workflow:skip-download
```

## Review Dashboard

```powershell
npm.cmd run serve
```

Open `http://127.0.0.1:4317`.

The dashboard reads from `outputs/` and lets you review orders, line items, exceptions, categories, split tags, and sync status. Saved review decisions are written to `outputs/zepto_review_annotations.json`.

## AI Assistant

Open the `AI Assistant` view in the sidebar.

1. Choose `OpenAI` or `Anthropic`.
2. Paste your API key.
3. Keep private-field redaction enabled unless you explicitly need raw fallback text.
4. Save settings.
5. Test the connection.
6. Run an AI action.
7. Review the staged suggestions before applying them.

Available actions:

- Auto-categorize line items.
- Explain invoice/order mismatches.
- Suggest Splitwise-ready tags.
- Summarize monthly spending.
- Detect unusual purchases or duplicate invoices.
- Structure HTML fallback pages.
- Ask natural-language questions about the local dataset.

For this local dashboard version, AI settings are stored in `outputs/zepto_ai_settings.json`, which is ignored by Git. The Electron version should move API keys into the operating system credential store.

## Output Files

- `outputs/zepto_orders_ledger.json` and `.csv` - captured Zepto order cards.
- `outputs/zepto_download_summary.json` - invoice download status by order.
- `outputs/zepto_invoice_rows.json` and `.csv` - parsed invoice fields and line items.
- `outputs/zepto_reconciliation.json` and `.csv` - merged order/invoice status.
- `outputs/zepto_html_fallbacks.json` and `.csv` - fallback order page captures when PDFs are unavailable.
- `outputs/zepto_expense_split_ready.xlsx` - workbook for expense review and split prep.
- `outputs/zepto_review_annotations.json` - dashboard edits and review tags.
- `outputs/zepto_ai_settings.json` - optional local AI provider settings.

## Troubleshooting

- If Zepto does not show orders, complete login in the opened Chrome window and rerun.
- If Chrome profile state looks broken, stop the script and move `work/playwright-zepto-profile/` aside; the next run creates a fresh profile.
- If PDF parsing fails with `ModuleNotFoundError: pypdf`, run `python -m pip install -r requirements-dev.txt`.
- If the dashboard is empty, run `npm.cmd run workflow:skip-download` to regenerate `outputs/` from existing invoices.
