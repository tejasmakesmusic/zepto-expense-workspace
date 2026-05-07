import unittest
from pathlib import Path

from scripts.extract_zepto_invoices import (
    extract_invoice_fields,
    parse_item_table_lines,
)


FIXTURES = Path(__file__).resolve().parent / "fixtures"


class ExtractZeptoInvoicesTests(unittest.TestCase):
    def read_fixture(self, name: str) -> str:
        return (FIXTURES / name).read_text(encoding="utf-8")

    def test_extract_invoice_fields_keeps_gstin_clean(self) -> None:
        text = self.read_fixture("zepto_invoice_multi_item.txt")
        fields = extract_invoice_fields(text)

        self.assertEqual(fields.invoice_number, "26026C0000947490")
        self.assertEqual(fields.order_number, "MJMQOVNWF35113A")
        self.assertEqual(fields.seller_gstin, "06AAKCC1645G1ZT")

    def test_extract_invoice_fields_prefers_net_invoice_value(self) -> None:
        text = """
        Invoice No. : 26046C0002584802
        Order No. : JLOKOVNWR03331A
        Date : 15-04-2026
        Seller Name: HOLISOL LOGISTICS PRIVATE LIMITED
        GSTIN: 06AAKCC1645G1ZT
        Bill To
        Ship To
        tejaswa sharma
        sample address
        SR
        Invoice Value
        271.01
        Goodwill to customer
        - 1.00
        Net Invoice Value
        270.01
        """
        fields = extract_invoice_fields(text)

        self.assertEqual(fields.invoice_value, "270.01")

    def test_two_item_invoice_emits_two_line_items(self) -> None:
        text = self.read_fixture("zepto_invoice_two_item.txt")
        fields = extract_invoice_fields(text)
        rows = parse_item_table_lines(text, fields, "sample-two-item.pdf")

        self.assertEqual(len(rows), 2)
        self.assertEqual(
            rows[0].item_description,
            "Brooke Bond Red Label Natural Care Tea 1 pack (250 g)",
        )
        self.assertEqual(rows[0].line_total_amount, "139.00")
        self.assertEqual(rows[0].parse_quality, "parsed_line_item")
        self.assertEqual(
            rows[1].item_description,
            "Eggs by Henfruit - Max Protein Specialty Eggs 1 pack (10 pcs)",
        )
        self.assertEqual(rows[1].line_total_amount, "103.00")

    def test_multi_item_invoice_is_split_into_multiple_rows(self) -> None:
        text = self.read_fixture("zepto_invoice_multi_item.txt")
        fields = extract_invoice_fields(text)
        rows = parse_item_table_lines(text, fields, "sample-multi-item.pdf")

        self.assertEqual(
            [
                (row.item_description, row.line_total_amount, row.parse_quality)
                for row in rows
            ],
            [
                ("Tops Vinegar - White Vinegar 1 pc (610 ml)", "49.00", "parsed_line_item"),
                ("MasterChow Red Chilli Sauce 1 pc (200 g)", "48.00", "parsed_line_item"),
                ("MasterChow Dark Soya Sauce 1 pc (210 g)", "49.00", "parsed_line_item"),
                ("Capsicum Green 250-350 g", "24.00", "parsed_line_item"),
                (
                    "Chukde Monosodium Glutamate (Aromatic Seasoning Salt) 1 pack (100 g)",
                    "44.00",
                    "parsed_line_item",
                ),
                ("Maggi Masala-ae-Magic Sabzi Masala 1 pack (72 g)", "54.00", "parsed_line_item"),
            ],
        )

    def test_pre_table_slice_falls_back_to_invoice_level_row(self) -> None:
        text = self.read_fixture("zepto_invoice_fallback.txt")
        fields = extract_invoice_fields(text)
        rows = parse_item_table_lines(text, fields, "sample-fallback.pdf")

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].item_description, "")
        self.assertEqual(rows[0].parse_quality, "invoice_fallback")


if __name__ == "__main__":
    unittest.main()
