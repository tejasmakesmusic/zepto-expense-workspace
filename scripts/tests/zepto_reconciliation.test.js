const test = require("node:test");
const assert = require("node:assert/strict");

const { buildReconciliation } = require("../lib/zepto_reconciliation");

test("buildReconciliation marks matching orders as complete", () => {
  const result = buildReconciliation({
    startedFrom: "2026-02-01T00:00:00+05:30",
    orders: [
      {
        order_id: "order-1",
        order_url: "https://www.zepto.com/order/order-1",
        order_date_iso: "2026-03-01T10:00:00.000Z",
        order_amount_display: "212",
        order_amount_value: 212,
        order_status_text: "Order delivered",
        order_card_text: "Order delivered Placed at 1st Mar 2026, 03:30 pm ₹212",
        in_scope_from_start_date: true,
      },
    ],
    downloadSummary: {
      results: [
        {
          order_id: "order-1",
          status: "downloaded",
          file: "C:\\tmp\\order-1-sample.pdf",
        },
      ],
    },
    invoiceRows: [
      {
        source_order_id: "order-1",
        source_file: "order-1-sample.pdf",
        invoice_number: "INV-1",
        order_number: "ZEP-1",
        invoice_value: "212.00",
      },
    ],
  });

  assert.equal(result.summary.dataset_complete, true);
  assert.equal(result.rows[0].reconciliation_status, "complete");
});

test("buildReconciliation treats five-paise invoice rounding as an amount match", () => {
  const result = buildReconciliation({
    startedFrom: "2026-02-01T00:00:00+05:30",
    orders: [
      {
        order_id: "order-rounding",
        order_url: "https://www.zepto.com/order/order-rounding",
        order_date_iso: "2026-03-01T10:00:00.000Z",
        order_amount_display: "170",
        order_amount_value: 170,
        order_status_text: "Order delivered",
        in_scope_from_start_date: true,
      },
    ],
    downloadSummary: {
      results: [
        {
          order_id: "order-rounding",
          status: "downloaded",
          file: "C:\\tmp\\order-rounding-invoice.pdf",
        },
      ],
    },
    invoiceRows: [
      {
        source_order_id: "order-rounding",
        source_file: "order-rounding-invoice.pdf",
        invoice_number: "INV-ROUNDING",
        order_number: "ZEP-ROUNDING",
        invoice_value: "170.05",
      },
    ],
  });

  assert.equal(result.rows[0].amount_match, "yes");
  assert.equal(result.rows[0].reconciliation_status, "complete");
});

test("buildReconciliation marks missing invoice buttons as missing_invoice", () => {
  const result = buildReconciliation({
    startedFrom: "2026-02-01T00:00:00+05:30",
    orders: [
      {
        order_id: "order-2",
        order_url: "https://www.zepto.com/order/order-2",
        order_date_iso: "2026-03-01T10:00:00.000Z",
        order_amount_display: "188",
        order_amount_value: 188,
        order_status_text: "Order cancelled",
        order_card_text: "Order cancelled Placed at 1st Mar 2026, 03:30 pm ₹188",
        in_scope_from_start_date: true,
      },
    ],
    downloadSummary: {
      results: [
        {
          order_id: "order-2",
          status: "missing_button",
        },
      ],
    },
    invoiceRows: [],
  });

  assert.equal(result.summary.dataset_complete, false);
  assert.equal(result.rows[0].reconciliation_status, "missing_invoice");
});

test("buildReconciliation preserves html fallback context when invoice is unavailable", () => {
  const result = buildReconciliation({
    startedFrom: "2026-02-01T00:00:00+05:30",
    orders: [
      {
        order_id: "order-2",
        order_url: "https://www.zepto.com/order/order-2",
        order_date_iso: "2026-03-01T10:00:00.000Z",
        order_amount_display: "188",
        order_amount_value: 188,
        order_status_text: "Order cancelled",
        order_card_text: "Order cancelled Placed at 1st Mar 2026, 03:30 pm â‚¹188",
        in_scope_from_start_date: true,
      },
    ],
    downloadSummary: {
      results: [
        {
          order_id: "order-2",
          status: "missing_button",
          html_capture_status: "captured",
          html_order_number: "ABC123",
          html_bill_summary_text: "Item Total Rs 188 Total Bill Rs 188",
          html_json_path: "C:\\tmp\\order-2.json",
        },
      ],
    },
    invoiceRows: [],
  });

  assert.equal(result.summary.dataset_complete, false);
  assert.equal(result.summary.data_capture_complete, true);
  assert.equal(result.rows[0].reconciliation_status, "missing_invoice_html_captured");
  assert.equal(result.rows[0].html_capture_status, "captured");
  assert.equal(result.rows[0].html_order_number, "ABC123");
});

test("buildReconciliation detects amount mismatches and orphan parsed invoices", () => {
  const result = buildReconciliation({
    startedFrom: "2026-02-01T00:00:00+05:30",
    orders: [
      {
        order_id: "order-3",
        order_url: "https://www.zepto.com/order/order-3",
        order_date_iso: "2026-03-01T10:00:00.000Z",
        order_amount_display: "300",
        order_amount_value: 300,
        order_status_text: "Order delivered",
        order_card_text: "Order delivered Placed at 1st Mar 2026, 03:30 pm ₹300",
        in_scope_from_start_date: true,
      },
    ],
    downloadSummary: {
      results: [
        {
          order_id: "order-3",
          status: "downloaded",
          file: "C:\\tmp\\order-3-invoice.pdf",
        },
      ],
    },
    invoiceRows: [
      {
        source_order_id: "order-3",
        source_file: "order-3-invoice.pdf",
        invoice_number: "INV-3",
        order_number: "ZEP-3",
        invoice_value: "302.00",
      },
      {
        source_order_id: "019aaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        source_file: "019aaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa-orphan-order-invoice.pdf",
        invoice_number: "INV-4",
        order_number: "ZEP-4",
        invoice_value: "100.00",
      },
    ],
  });

  assert.equal(result.summary.dataset_complete, false);
  assert.equal(result.rows[0].reconciliation_status, "amount_mismatch");
  assert.equal(
    result.rows.find((row) => row.order_id === "019aaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa").reconciliation_status,
    "parsed_without_order_match",
  );
});
