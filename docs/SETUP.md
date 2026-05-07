# Setup

## Platform

Use a local desktop environment. The invoice downloader needs to open a visible Chrome window so you can complete Zepto login when required.

Recommended baseline:

- Node.js 20 or newer
- Python 3.12 or newer
- Google Chrome
- Git

## Install

From the repository root:

```powershell
npm.cmd install
python -m pip install -r requirements-dev.txt
```

On macOS or Linux, replace `npm.cmd` with `npm`.

## Check The Install

```powershell
npm.cmd run test:js
python -m pytest scripts/tests
```

## Start The Dashboard

```powershell
npm.cmd run serve
```

Then open `http://127.0.0.1:4317`.

## Common Windows Note

PowerShell may block `npm.ps1` because script execution is disabled. Use `npm.cmd` instead:

```powershell
npm.cmd run workflow
```

## Optional Baseline Workbook Import

If you have an older analysis workbook and want its sheets included in the generated workbook:

```powershell
python scripts/export_existing_workbook.py "C:\path\to\existing-workbook.xlsx"
python scripts/build_zepto_expense_workbook.py
```

The exported CSVs go to `outputs/existing_workbook_export/`, which is private generated data and is not committed.
