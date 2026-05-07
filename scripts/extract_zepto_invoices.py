from __future__ import annotations

from collections import Counter
import csv
import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
INVOICES_DIR = ROOT / "invoices"
OUTPUT_DIR = ROOT / "outputs"


@dataclass
class InvoiceFields:
    invoice_number: str
    order_number: str
    invoice_date: str
    seller_name: str
    seller_gstin: str
    bill_to_name: str
    ship_to_address: str
    invoice_value: str


@dataclass
class InvoiceRow:
    source_file: str
    invoice_number: str
    order_number: str
    invoice_date: str
    seller_name: str
    seller_gstin: str
    bill_to_name: str
    ship_to_address: str
    item_description: str
    hsn: str
    quantity: str
    product_rate: str
    discount_percent: str
    taxable_amount: str
    cgst_rate: str
    sgst_rate: str
    cgst_amount: str
    sgst_amount: str
    cess_rate: str
    cess_amount: str
    line_total_amount: str
    invoice_value: str
    parse_quality: str


FIELDNAMES = [field.name for field in InvoiceRow.__dataclass_fields__.values()]
PARTIAL_DESCRIPTION_DISALLOWED_PHRASES = (
    "whether gst is payable",
    "reverse-charge",
    "invoice value",
    "item total",
    "order delivered from",
    "e-commerce platform",
    "for imei / serial number information",
    "note:",
    "tax invoice/bill of supply",
    "seller name:",
    "bill to",
    "ship to",
    "place of supply",
    "fssai",
)
PARTIAL_DESCRIPTION_HEADER_TOKENS = frozenset(
    {
        "sr",
        "no",
        "item",
        "description",
        "unit",
        "mrp",
        "rsp",
        "hsn",
        "qty",
        "product",
        "rate",
        "disc",
        "taxable",
        "amt",
        "cgst",
        "s",
        "ut",
        "gst",
        "cess",
        "total",
    }
)


def clean_spaces(text: str) -> str:
    return re.sub(r"[ \t]+", " ", text).strip()


def clean_item_description(text: str) -> str:
    text = clean_spaces(text)
    return re.sub(r"(?<=\w)-\s+(?=\w)", "-", text)


def is_serial_number_token(text: str) -> bool:
    return bool(re.fullmatch(r"[1-9]\d{0,2}", text))


def is_numeric_column_token(text: str) -> bool:
    return bool(re.fullmatch(r"\d+(?:\.\d+)?%?", text) or text.startswith("+ "))


def looks_like_item_description(text: str) -> bool:
    normalized = clean_item_description(text)
    if not normalized or not re.search(r"[A-Za-z]", normalized):
        return False

    lowered = normalized.casefold()
    if any(phrase in lowered for phrase in PARTIAL_DESCRIPTION_DISALLOWED_PHRASES):
        return False

    header_tokens = re.findall(r"[A-Za-z]+", lowered)
    if header_tokens and all(token in PARTIAL_DESCRIPTION_HEADER_TOKENS for token in header_tokens):
        return False

    return len(header_tokens) >= 2 or bool(re.search(r"[\d()/-]", normalized))


def normalize_text(text: str) -> str:
    text = text.replace("\r", "\n")
    text = text.replace("\x00", "")
    text = re.sub(r"\n{2,}", "\n", text)
    return text


def match_first(pattern: str, text: str) -> str:
    match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
    return clean_spaces(match.group(1)) if match else ""


def match_gstin(text: str) -> str:
    match = re.search(r"GSTIN:\s*(\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9])", text)
    return match.group(1) if match else ""


def extract_invoice_value(text: str) -> str:
    return (
        match_first(r"\bNet\s+Invoice\s+Value\s+([0-9.]+)", text)
        or match_first(r"\bInvoice\s+Value\s+([0-9.]+)", text)
    )


def extract_pdf_text(pdf_path: Path) -> str:
    reader = PdfReader(str(pdf_path))
    pages = [(page.extract_text() or "") for page in reader.pages]
    return normalize_text("\n".join(pages))


def extract_invoice_fields(text: str) -> InvoiceFields:
    return InvoiceFields(
        invoice_number=match_first(r"Invoice No\.\s*:\s*([A-Z0-9]+)", text),
        order_number=match_first(r"Order No\.\s*:\s*([A-Z0-9]+)", text),
        invoice_date=match_first(r"Date\s*:\s*([0-9-]+)", text),
        seller_name=match_first(r"Seller Name:\s*(.*?)GSTIN:", text),
        seller_gstin=match_gstin(text),
        bill_to_name=match_first(r"Bill To\s+Ship To\s+([^\n]+)", text),
        ship_to_address=match_first(
            r"Ship To\s+(.*?)SR\s+No",
            text,
        ),
        invoice_value=extract_invoice_value(text),
    )


def find_item_table_lines(text: str) -> list[str]:
    lines = [line.strip() for line in normalize_text(text).split("\n")]
    start = next(index for index, line in enumerate(lines) if line == "SR")
    stop = next(
        index
        for index, line in enumerate(lines[start:], start=start)
        if line in {"Item Total", "Invoice Value"}
    )
    return [line for line in lines[start:stop] if line]


def split_item_blocks(table_lines: list[str]) -> list[list[str]]:
    blocks: list[list[str]] = []
    current: list[str] = []

    def looks_like_description_start(line: str) -> bool:
        return bool(line) and not is_numeric_column_token(line)

    for index, line in enumerate(table_lines):
        next_line = table_lines[index + 1] if index + 1 < len(table_lines) else ""
        starts_new_block = is_serial_number_token(line) and (
            not current
            or (len(current) >= 4 and looks_like_description_start(next_line))
        )
        if starts_new_block:
            if current:
                blocks.append(current)
            current = [line]
            continue
        if current:
            current.append(line)
    if current:
        blocks.append(current)
    return blocks


def parse_item_block(
    block: list[str], fields: InvoiceFields, source_file: str
) -> InvoiceRow:
    tokens = [token.strip() for token in block if token.strip()]
    if len(tokens) < 15:
        raise ValueError("item block is too short to parse")

    serial = tokens.pop(0)
    if not re.fullmatch(r"\d+", serial):
        raise ValueError("item block is missing a serial number")

    cess_detail_index = next(
        (index for index in range(len(tokens) - 1, -1, -1) if tokens[index].startswith("+")),
        -1,
    )
    if cess_detail_index < 10 or cess_detail_index + 2 >= len(tokens):
        raise ValueError("item block is missing the cess detail marker")

    hsn = tokens[cess_detail_index - 10]
    quantity = tokens[cess_detail_index - 9]
    product_rate = tokens[cess_detail_index - 8]
    discount_percent = tokens[cess_detail_index - 7]
    taxable_amount = tokens[cess_detail_index - 6]
    cgst_rate = tokens[cess_detail_index - 5]
    sgst_rate = tokens[cess_detail_index - 4]
    cgst_amount = tokens[cess_detail_index - 3]
    sgst_amount = tokens[cess_detail_index - 2]
    cess_rate = tokens[cess_detail_index - 1]
    cess_amount = tokens[cess_detail_index + 1]
    line_total_amount = tokens[cess_detail_index + 2]

    description_tokens = tokens[: cess_detail_index - 10]
    if description_tokens and re.fullmatch(r"\d+(?:\.\d+)?", description_tokens[-1]):
        description_tokens.pop()

    item_description = clean_item_description(" ".join(description_tokens))
    if not item_description:
        raise ValueError("item block is missing an item description")

    return InvoiceRow(
        source_file=source_file,
        invoice_number=fields.invoice_number,
        order_number=fields.order_number,
        invoice_date=fields.invoice_date,
        seller_name=fields.seller_name,
        seller_gstin=fields.seller_gstin,
        bill_to_name=fields.bill_to_name,
        ship_to_address=clean_spaces(fields.ship_to_address),
        item_description=item_description,
        hsn=hsn,
        quantity=quantity,
        product_rate=product_rate,
        discount_percent=discount_percent,
        taxable_amount=taxable_amount,
        cgst_rate=cgst_rate,
        sgst_rate=sgst_rate,
        cgst_amount=cgst_amount,
        sgst_amount=sgst_amount,
        cess_rate=cess_rate,
        cess_amount=cess_amount,
        line_total_amount=line_total_amount,
        invoice_value=fields.invoice_value,
        parse_quality="parsed_line_item",
    )


def build_invoice_fallback(fields: InvoiceFields, source_file: str) -> InvoiceRow:
    return InvoiceRow(
        source_file=source_file,
        invoice_number=fields.invoice_number,
        order_number=fields.order_number,
        invoice_date=fields.invoice_date,
        seller_name=fields.seller_name,
        seller_gstin=fields.seller_gstin,
        bill_to_name=fields.bill_to_name,
        ship_to_address=clean_spaces(fields.ship_to_address),
        item_description="",
        hsn="",
        quantity="",
        product_rate="",
        discount_percent="",
        taxable_amount="",
        cgst_rate="",
        sgst_rate="",
        cgst_amount="",
        sgst_amount="",
        cess_rate="",
        cess_amount="",
        line_total_amount="",
        invoice_value=fields.invoice_value,
        parse_quality="invoice_fallback",
    )


def build_partial_line_item(
    block: list[str], fields: InvoiceFields, source_file: str
) -> InvoiceRow | None:
    tokens = [token.strip() for token in block if token.strip()]
    if tokens and is_serial_number_token(tokens[0]):
        tokens = tokens[1:]

    tail_start = len(tokens)
    while tail_start > 0 and is_numeric_column_token(tokens[tail_start - 1]):
        tail_start -= 1

    description_tokens = tokens[:tail_start] if tail_start else []
    if not description_tokens:
        description_tokens = [
            token for token in tokens if not is_numeric_column_token(token)
        ]

    item_description = clean_item_description(" ".join(description_tokens))
    if not looks_like_item_description(item_description):
        return None

    return InvoiceRow(
        source_file=source_file,
        invoice_number=fields.invoice_number,
        order_number=fields.order_number,
        invoice_date=fields.invoice_date,
        seller_name=fields.seller_name,
        seller_gstin=fields.seller_gstin,
        bill_to_name=fields.bill_to_name,
        ship_to_address=clean_spaces(fields.ship_to_address),
        item_description=item_description,
        hsn="",
        quantity="",
        product_rate="",
        discount_percent="",
        taxable_amount="",
        cgst_rate="",
        sgst_rate="",
        cgst_amount="",
        sgst_amount="",
        cess_rate="",
        cess_amount="",
        line_total_amount="",
        invoice_value=fields.invoice_value,
        parse_quality="partial_line_item",
    )


def try_parse_item_block(
    block: list[str], fields: InvoiceFields, source_file: str
) -> InvoiceRow:
    try:
        return parse_item_block(block, fields, source_file)
    except (IndexError, ValueError):
        partial_row = build_partial_line_item(block, fields, source_file)
        if partial_row is not None:
            return partial_row
        return build_invoice_fallback(fields, source_file)


def parse_item_table_lines(
    text: str, fields: InvoiceFields, source_file: str
) -> list[InvoiceRow]:
    try:
        blocks = split_item_blocks(find_item_table_lines(text))
    except (StopIteration, ValueError):
        return [build_invoice_fallback(fields, source_file)]

    rows: list[InvoiceRow] = []
    for block in blocks:
        rows.append(try_parse_item_block(block, fields, source_file))
    return rows or [build_invoice_fallback(fields, source_file)]


def parse_invoice(pdf_path: Path) -> list[InvoiceRow]:
    text = extract_pdf_text(pdf_path)
    fields = extract_invoice_fields(text)
    return parse_item_table_lines(text, fields, pdf_path.name)


def build_row_dedupe_key(row: InvoiceRow) -> tuple[str, ...]:
    return tuple(
        str(value)
        for field, value in asdict(row).items()
        if field != "source_file"
    )


def build_invoice_dedupe_key(rows: list[InvoiceRow]) -> tuple[tuple[tuple[str, ...], int], ...]:
    counts = Counter(build_row_dedupe_key(row) for row in rows)
    return tuple(sorted(counts.items()))


def write_csv(rows: Iterable[InvoiceRow], csv_path: Path) -> None:
    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES)
        writer.writeheader()
        for row in rows:
            writer.writerow(asdict(row))


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    invoice_files = sorted(INVOICES_DIR.glob("*.pdf"))
    parsed_invoices: list[list[InvoiceRow]] = []

    for pdf_path in invoice_files:
        parsed_invoices.append(parse_invoice(pdf_path))

    deduped_rows: list[InvoiceRow] = []
    seen_invoice_keys: set[tuple[tuple[tuple[str, ...], int], ...]] = set()
    for invoice_rows in parsed_invoices:
        key = build_invoice_dedupe_key(invoice_rows)
        if key in seen_invoice_keys:
            continue
        seen_invoice_keys.add(key)
        deduped_rows.extend(invoice_rows)

    csv_path = OUTPUT_DIR / "zepto_invoice_rows.csv"
    json_path = OUTPUT_DIR / "zepto_invoice_rows.json"

    write_csv(deduped_rows, csv_path)
    json_path.write_text(
        json.dumps([asdict(row) for row in deduped_rows], indent=2),
        encoding="utf-8",
    )

    print(
        json.dumps(
            {
                "invoice_files": len(invoice_files),
                "row_count": len(deduped_rows),
                "csv": str(csv_path),
                "json": str(json_path),
            }
        )
    )


if __name__ == "__main__":
    main()
