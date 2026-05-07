# Data And Privacy

This repository is meant to store code and documentation, not personal Zepto data.

## Never Commit

- `invoices/` - invoice PDFs may contain names, addresses, GSTINs, order IDs, and purchase details.
- `outputs/` - generated JSON, CSV, XLSX, annotations, logs, and HTML fallback captures can contain the same private data.
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
