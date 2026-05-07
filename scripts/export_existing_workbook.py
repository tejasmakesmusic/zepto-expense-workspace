from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import openpyxl


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_DIR = ROOT / "outputs" / "existing_workbook_export"


def export_sheet(sheet: openpyxl.worksheet.worksheet.Worksheet, output_dir: Path) -> dict[str, object]:
    rows = list(sheet.iter_rows(values_only=True))
    csv_path = output_dir / f"{sheet.title}.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerows(rows)
    return {
        "sheet": sheet.title,
        "rows": len(rows),
        "columns": max((len(row) for row in rows), default=0),
        "csv": str(csv_path),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Export an existing analysis workbook into CSV files that can be folded into the generated Zepto workbook.",
    )
    parser.add_argument("source", type=Path, help="Path to the existing .xlsx workbook")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Directory for exported CSV files and summary.json",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    workbook = openpyxl.load_workbook(args.source, read_only=True, data_only=True)
    summary = [export_sheet(sheet, output_dir) for sheet in workbook.worksheets]
    summary_path = output_dir / "summary.json"
    summary_path.write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")
    print(json.dumps({"summary": str(summary_path), "sheets": len(summary)}))


if __name__ == "__main__":
    main()
