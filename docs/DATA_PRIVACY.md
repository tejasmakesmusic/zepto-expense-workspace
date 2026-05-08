# Data And Privacy

This repository is meant to store code and documentation, not personal Zepto data.

## Never Commit

- `invoices/` - invoice PDFs may contain names, addresses, GSTINs, order IDs, and purchase details.
- `outputs/` - generated JSON, CSV, XLSX, annotations, logs, and HTML fallback captures can contain the same private data.
- `outputs/zepto_ai_settings.json` - optional AI provider settings and API key for the local dashboard version.
- `work/` - browser profiles, screenshots, page captures, debug logs, and temporary files.
- `.env` files, browser profile data, cookies, tokens, or session storage.
- `node_modules/`, Python caches, and test cache directories.

The `.gitignore` is set up for this. Check `git status -sb` before every commit.

## Before Publishing

Run:

```powershell
git status -sb
git diff --cached --name-only
```

Only source files, tests, and docs should appear. If PDFs, browser data, generated outputs, or local logs appear, unstage them before pushing.

## Sharing Generated Reports

Generated reports are useful, but they are not public artifacts. Share them only with people who are allowed to see the underlying order and invoice data.

## AI Provider Privacy

The AI Assistant sends redacted JSON payloads to the selected provider only when the user runs an AI action. Keep private-field redaction enabled unless the user intentionally wants raw HTML fallback text included.

The local dashboard stores the API key in `outputs/zepto_ai_settings.json`, which is ignored by Git. A packaged Electron app should store the key in the operating system credential store instead.
