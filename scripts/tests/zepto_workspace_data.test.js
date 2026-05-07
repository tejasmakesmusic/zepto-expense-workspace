const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const {
  buildWorkspaceDataset,
  applyWorkspaceFilters,
} = require("../lib/zepto_workspace_data");

const stateModuleUrl = pathToFileURL(path.resolve(__dirname, "../../web/zepto-workspace/state.js")).href;

test("buildWorkspaceDataset joins reconciliation rows with invoice rows, html fallback, and annotations", () => {
  const dataset = buildWorkspaceDataset({
    reconciliation: {
      summary: {
        total_in_scope_orders: 4,
        status_counts: {
          complete: 2,
          amount_mismatch: 1,
          missing_invoice_html_captured: 1,
        },
        data_capture_complete: true,
        dataset_complete: false,
      },
      rows: [
        {
          order_id: "order-1",
          order_date_iso: "2026-05-04T21:09:00+05:30",
          order_amount_value: 212,
          order_status_text: "Order delivered",
          reconciliation_status: "complete",
          parsed_invoice_numbers: "INV-1",
          parsed_order_numbers: "ZEP-1",
          download_file: "C:\\repo\\invoices\\order-1.pdf",
        },
        {
          order_id: "order-2",
          order_date_iso: "2026-03-20T01:54:00+05:30",
          order_amount_value: 141.95,
          order_status_text: "Order delivered",
          reconciliation_status: "amount_mismatch",
          parsed_invoice_numbers: "INV-2",
          parsed_order_numbers: "ZEP-2",
          parsed_invoice_values: "142.96",
          download_file: "C:\\repo\\invoices\\order-2.pdf",
          html_capture_status: "captured",
          html_html_path: "C:\\repo\\outputs\\html_fallback\\order-2.html",
          html_json_path: "C:\\repo\\outputs\\html_fallback\\order-2.json",
        },
        {
          order_id: "order-3",
          order_date_iso: "2026-02-20T01:54:00+05:30",
          order_amount_value: 152,
          order_status_text: "Order cancelled",
          reconciliation_status: "missing_invoice_html_captured",
          html_capture_status: "captured",
          html_html_path: "C:\\repo\\outputs\\html_fallback\\order-3.html",
          html_json_path: "C:\\repo\\outputs\\html_fallback\\order-3.json",
        },
        {
          order_id: "11111111-2222-3333-4444-555555555555",
          order_date_iso: "2026-04-15T11:20:00+05:30",
          order_amount_value: 88,
          order_status_text: "Order delivered",
          reconciliation_status: "complete",
          parsed_invoice_numbers: "INV-4 | INV-4B",
          parsed_order_numbers: "ZEP-4",
          download_file: "C:\\repo\\invoices\\order-4.pdf",
          html_capture_status: "captured",
          html_html_path: "C:\\repo\\outputs\\html_fallback\\order-4.html",
          html_json_path: "C:\\repo\\outputs\\html_fallback\\order-4.json",
          html_order_number: "HTML-4",
          html_bill_summary_text: "Row summary says Item Total Rs 88 and Total Bill Rs 88",
        },
      ],
    },
    ordersLedger: {
      capturedAt: "2026-05-06T05:53:44.249Z",
      orders: [
        { order_id: "order-1", order_card_text: "Milk and bread" },
        { order_id: "order-2", order_card_text: "Cigarettes with flyer mismatch" },
        { order_id: "order-3", order_card_text: "Cancelled snacks order" },
        { order_id: "11111111-2222-3333-4444-555555555555", order_card_text: "Eggs and bread with html backup" },
      ],
    },
    invoiceRows: [
      {
        source_file: "order-1-file.pdf",
        source_order_id: "order-1",
        item_description: "Milk",
        line_total_amount: "50.00",
        invoice_value: "212.00",
        invoice_number: "INV-1A",
        order_number: "ZEP-1A",
      },
      {
        source_file: "order-1-file.pdf",
        source_order_id: "order-1",
        item_description: "Bread",
        line_total_amount: "40.00",
        invoice_value: "212.00",
        invoice_number: "INV-1",
        order_number: "ZEP-1",
      },
      {
        source_file: "order-2-file.pdf",
        source_order_id: "order-2",
        item_description: "Valentine's Day Flyer 1 pc",
        line_total_amount: "1.00",
        invoice_value: "142.96",
        invoice_number: "INV-2A",
        order_number: "ZEP-2A",
        parse_quality: "parsed_line_item",
      },
      {
        source_file: "order-2-file.pdf",
        source_order_id: "order-2",
        item_description: "Marlboro Advance Compact 1 pack (10 pcs)",
        line_total_amount: "95.00",
        invoice_value: "142.96",
        invoice_number: "INV-2",
        order_number: "ZEP-2",
      },
      {
        source_file: "11111111-2222-3333-4444-555555555555-invoice.pdf",
        item_description: "Eggs",
        line_total_amount: "52.00",
        invoice_value: "88.00",
        invoice_number: "INV-4A",
        order_number: "ZEP-4A",
      },
      {
        source_file: "11111111-2222-3333-4444-555555555555-invoice.pdf",
        item_description: "Bread",
        line_total_amount: "36.00",
        invoice_value: "88.00",
        invoice_number: "INV-4B",
        order_number: "ZEP-4B",
      },
    ],
    htmlFallbacks: [
      {
        order_id: "order-3",
        html_capture_status: "captured",
        html_bill_summary_text: "Item Total Rs 152 Total Bill Rs 152",
      },
      {
        order_id: "11111111-2222-3333-4444-555555555555",
        html_capture_status: "captured",
        html_order_number: "HTML-4B",
        html_bill_summary_text: "Fallback summary should not replace the richer row text",
        html_items_text: "Fallback eggs and bread item list",
      },
    ],
    annotations: {
      updatedAt: "2026-05-06T12:00:00.000Z",
      orders: {
        "order-1": {
          expense_category: "personal",
          split_type: "household",
          split_with: "Asha",
          notes: "order note",
          ready_for_splitwise: true,
          review_status: "approved",
        },
      },
      lineItems: {
        "order-1::INV-1A::0": {
          expense_category: "groceries",
          split_type: "",
          split_with: "Tejas",
          notes: "milk only",
          ready_for_splitwise: false,
          review_status: "needs_review",
        },
      },
    },
    downloadSummary: {
      results: [
        { order_id: "order-1", status: "already_downloaded" },
        { order_id: "order-2", status: "already_downloaded" },
      ],
    },
    baseDir: "C:\\repo",
  });

  const order1 = dataset.orders.find((order) => order.order_id === "order-1");
  const order2 = dataset.orders.find((order) => order.order_id === "order-2");
  const order3 = dataset.orders.find((order) => order.order_id === "order-3");
  const order4 = dataset.orders.find((order) => order.order_id === "11111111-2222-3333-4444-555555555555");
  const order1LineItems = dataset.lineItems.filter((item) => item.order_id === "order-1");
  const order2LineItems = dataset.lineItems.filter((item) => item.order_id === "order-2");
  const order4LineItems = dataset.lineItems.filter((item) => item.order_id === "11111111-2222-3333-4444-555555555555");
  const order2FlyerLineItem = order2LineItems.find((item) => item.item_description === "Valentine's Day Flyer 1 pc");

  assert.equal(dataset.orders.length, 4);
  assert.equal(dataset.lineItems.length, 6);
  assert.deepEqual(
    dataset.orders.map((order) => order.order_id),
    ["order-1", "11111111-2222-3333-4444-555555555555", "order-2", "order-3"],
  );
  assert.deepEqual(
    dataset.lineItems.map((item) => item.order_id),
    [
      "order-1",
      "order-1",
      "11111111-2222-3333-4444-555555555555",
      "11111111-2222-3333-4444-555555555555",
      "order-2",
      "order-2",
    ],
  );
  assert.equal(order1.invoice_rows.length, 2);
  assert.equal(order1.annotations.expense_category, "personal");
  assert.deepEqual(order1.invoice_numbers, ["INV-1", "INV-1A"]);
  assert.deepEqual(order1.order_numbers, ["ZEP-1", "ZEP-1A"]);
  assert.equal(order1.links.invoice, "/files/invoices%2Forder-1.pdf");
  assert.equal(order1.links.html, "");
  assert.equal(order1.links.htmlJson, "");
  assert.equal(order1.suggested_category, "groceries");
  assert.equal(order1.suggested_category_confidence, "high");
  assert.ok(Array.isArray(order1.suggested_category_reasons));
  assert.ok(order1.suggested_category_reasons.length > 0);
  assert.equal(order1.effective_category, "personal");
  assert.equal(order1.mismatch_explainer, null);
  assert.equal(order2.suggested_category, "personal");
  assert.equal(order2.effective_category, "personal");
  assert.equal(order2.mismatch_explainer?.likely_reason_code, "marketing_insert_rounding");
  assert.equal(order3.html_fallback.html_capture_status, "captured");
  assert.equal(order3.mismatch_explainer, null);
  assert.equal(order4.invoice_rows.length, 2);
  assert.deepEqual(order4.invoice_numbers, ["INV-4", "INV-4B", "INV-4A"]);
  assert.deepEqual(order4.order_numbers, ["ZEP-4", "ZEP-4A", "ZEP-4B", "HTML-4", "HTML-4B"]);
  assert.equal(order4.links.invoice, "/files/invoices%2Forder-4.pdf");
  assert.equal(order4.links.html, "/files/outputs%2Fhtml_fallback%2Forder-4.html");
  assert.equal(order4.links.htmlJson, "/files/outputs%2Fhtml_fallback%2Forder-4.json");
  assert.equal(order4.html_fallback.html_capture_status, "captured");
  assert.equal(order4.html_fallback.html_capture_source, "");
  assert.equal(order4.html_fallback.html_html_path, "C:\\repo\\outputs\\html_fallback\\order-4.html");
  assert.equal(order4.html_fallback.html_json_path, "C:\\repo\\outputs\\html_fallback\\order-4.json");
  assert.equal(order4.html_fallback.html_order_number, "HTML-4");
  assert.equal(order4.html_fallback.html_bill_summary_text, "Row summary says Item Total Rs 88 and Total Bill Rs 88");
  assert.equal(order4.html_fallback.html_items_text, "Fallback eggs and bread item list");
  assert.equal(order4.suggested_category, "groceries");
  assert.equal(order4.effective_category, "groceries");
  assert.equal(dataset.summary.totalSpend, 593.95);
  assert.equal(dataset.summary.exceptionCount, 2);
  assert.equal(dataset.summary.monthlySpend.length, 4);
  assert.equal(dataset.sources.annotations.orderCount, 1);
  assert.equal(dataset.sources.annotations.lineItemCount, 1);
  assert.equal(order1LineItems.length, 2);
  assert.equal(order2LineItems.length, 2);
  assert.equal(order4LineItems.length, 2);
  assert.equal(dataset.lineItems.some((item) => item.order_id === "order-3"), false);
  assert.deepEqual(order1LineItems.map((item) => item.item_description), ["Milk", "Bread"]);
  assert.equal(order1LineItems[0].line_item_key, "order-1::INV-1A::0");
  assert.equal(order1LineItems[0].effective_category, "groceries");
  assert.equal(order1LineItems[0].split_type, "");
  assert.equal(order1LineItems[0].split_with, "Tejas");
  assert.equal(order1LineItems[0].notes, "milk only");
  assert.equal(order1LineItems[0].ready_for_splitwise, false);
  assert.equal(order1LineItems[0].review_status, "needs_review");
  assert.equal(order1LineItems[0].split_tag_source, "line_item");
  assert.equal(order1LineItems[0].annotations.expense_category, "groceries");
  assert.equal(order1LineItems[1].line_item_key, "order-1::INV-1::1");
  assert.equal(order1LineItems[1].effective_category, "personal");
  assert.equal(order1LineItems[1].split_type, "household");
  assert.equal(order1LineItems[1].split_with, "Asha");
  assert.equal(order1LineItems[1].notes, "order note");
  assert.equal(order1LineItems[1].ready_for_splitwise, true);
  assert.equal(order1LineItems[1].review_status, "approved");
  assert.equal(order1LineItems[1].split_tag_source, "order");
  assert.ok(order1LineItems[0].search_text.includes("milk only"));
  assert.ok(order1LineItems[0].search_text.includes("tejas"));
  assert.equal(order2FlyerLineItem.order_date_iso, "2026-03-20T01:54:00+05:30");
  assert.equal(order2FlyerLineItem.order_month, "2026-03");
  assert.equal(order2FlyerLineItem.order_status_text, "Order delivered");
  assert.equal(order2FlyerLineItem.order_amount_value, 141.95);
  assert.equal(order2FlyerLineItem.reconciliation_status, "amount_mismatch");
  assert.equal(order2FlyerLineItem.has_invoice, true);
  assert.equal(order2FlyerLineItem.has_html_fallback, true);
  assert.equal(order2FlyerLineItem.effective_category, "personal");
  assert.equal(order2FlyerLineItem.suggested_category, "personal");
  assert.equal(order2FlyerLineItem.split_type, "");
  assert.equal(order2FlyerLineItem.ready_for_splitwise, false);
  assert.equal(order2FlyerLineItem.quantity, "");
  assert.equal(order2FlyerLineItem.product_rate, "");
  assert.equal(order2FlyerLineItem.line_total_amount, "1.00");
  assert.equal(order2FlyerLineItem.invoice_number, "INV-2A");
  assert.equal(order2FlyerLineItem.order_number, "ZEP-2A");
  assert.equal(order2FlyerLineItem.seller_name, "");
  assert.equal(order2FlyerLineItem.seller_gstin, "");
  assert.equal(order2FlyerLineItem.parse_quality, "parsed_line_item");
  assert.ok(order2FlyerLineItem.search_text.includes("parsed_line_item"));
  assert.ok(order2FlyerLineItem.search_text.includes("inv-2a"));
  assert.match(
    order2FlyerLineItem.search_text,
    /order-2 order delivered 2026-03 141\.95 amount_mismatch personal valentine's day flyer 1 pc inv-2a zep-2a parsed_line_item/i,
  );
});

test("buildWorkspaceDataset preserves an explicit unassigned category override", () => {
  const dataset = buildWorkspaceDataset({
    reconciliation: {
      rows: [
        {
          order_id: "order-1",
          order_date_iso: "2026-05-04T21:09:00+05:30",
          order_amount_value: 212,
          order_status_text: "Order delivered",
          reconciliation_status: "complete",
        },
      ],
    },
    invoiceRows: [
      {
        source_file: "order-1-file.pdf",
        source_order_id: "order-1",
        item_description: "Milk",
        line_total_amount: "50.00",
      },
    ],
    annotations: {
      updatedAt: "2026-05-06T12:00:00.000Z",
      orders: {
        "order-1": {
          expense_category: "",
          suppress_suggested_category: true,
        },
      },
    },
  });

  const order = dataset.orders[0];

  assert.equal(order.suggested_category, "groceries");
  assert.equal(order.annotations.suppress_suggested_category, true);
  assert.equal(order.effective_category, "");
});

test("buildWorkspaceDataset derives deterministic workbench issues and counts", () => {
  const dataset = buildWorkspaceDataset({
    reconciliation: {
      rows: [
        {
          order_id: "new-mismatch",
          order_date_iso: "2026-05-05T10:00:00+05:30",
          order_amount_value: 200,
          order_status_text: "Order delivered",
          reconciliation_status: "amount_mismatch",
          parsed_invoice_values: "190",
        },
        {
          order_id: "missing-no-fallback",
          order_date_iso: "2026-05-04T10:00:00+05:30",
          order_amount_value: 100,
          order_status_text: "Order delivered",
          reconciliation_status: "missing_invoice_without_fallback",
        },
        {
          order_id: "download-error",
          order_date_iso: "2026-05-03T10:00:00+05:30",
          order_amount_value: 75,
          order_status_text: "Order delivered",
          reconciliation_status: "download_failed",
        },
        {
          order_id: "cancelled",
          order_date_iso: "2026-05-06T10:00:00+05:30",
          order_amount_value: 50,
          order_status_text: "Order cancelled",
          reconciliation_status: "complete",
        },
        {
          order_id: "not-ready",
          order_date_iso: "2026-05-02T10:00:00+05:30",
          order_amount_value: 25,
          order_status_text: "Order delivered",
          reconciliation_status: "complete",
        },
      ],
    },
    invoiceRows: [
      { source_order_id: "new-mismatch", item_description: "Milk", invoice_value: "190" },
      { source_order_id: "not-ready", item_description: "Bread" },
    ],
    htmlFallbacks: [
      { order_id: "download-error", html_capture_status: "captured" },
    ],
    annotations: {
      orders: {
        "download-error": { review_status: "needs_retry", review_reason: "retry download" },
        "missing-no-fallback": { review_status: "needs_manual_followup" },
      },
      lineItems: {},
    },
    downloadSummary: {
      results: [
        { order_id: "download-error", status: "error" },
      ],
    },
  });

  assert.deepEqual(dataset.workbench.issueCounts, {
    amount_mismatch: 1,
    missing_invoice_without_fallback: 1,
    download_failed: 1,
    cancelled_order: 1,
    needs_retry: 1,
    needs_manual_followup: 1,
    not_ready_for_split: 4,
  });
  assert.deepEqual(
    dataset.workbench.issues.slice(0, 5).map((issue) => `${issue.order_id}:${issue.issue_type}`),
    [
      "new-mismatch:amount_mismatch",
      "missing-no-fallback:missing_invoice_without_fallback",
      "download-error:download_failed",
      "cancelled:cancelled_order",
      "download-error:needs_retry",
    ],
  );
  const mismatch = dataset.workbench.issues.find((issue) => issue.issue_type === "amount_mismatch");
  assert.equal(mismatch.order_amount_value, 200);
  assert.equal(mismatch.has_invoice, true);
  assert.equal(mismatch.has_html_fallback, false);
  assert.ok(mismatch.mismatch_explainer);
});

test("buildWorkspaceDataset derives workbench review issues from line-item annotations", () => {
  const dataset = buildWorkspaceDataset({
    reconciliation: {
      rows: [
        {
          order_id: "line-retry",
          order_date_iso: "2026-05-05T10:00:00+05:30",
          order_amount_value: 200,
          order_status_text: "Order delivered",
          reconciliation_status: "complete",
        },
        {
          order_id: "line-followup",
          order_date_iso: "2026-05-04T10:00:00+05:30",
          order_amount_value: 100,
          order_status_text: "Order delivered",
          reconciliation_status: "complete",
        },
      ],
    },
    invoiceRows: [
      { source_order_id: "line-retry", item_description: "Milk", invoice_number: "INV-R" },
      { source_order_id: "line-followup", item_description: "Bread", invoice_number: "INV-F" },
    ],
    annotations: {
      orders: {},
      lineItems: {
        "line-retry::INV-R::0": { review_status: "needs_retry", review_reason: "line parse looked wrong" },
        "line-followup::INV-F::0": { review_status: "needs_manual_followup" },
      },
    },
  });

  assert.equal(dataset.workbench.issueCounts.needs_retry, 1);
  assert.equal(dataset.workbench.issueCounts.needs_manual_followup, 1);
  const retry = dataset.workbench.issues.find((issue) => issue.order_id === "line-retry" && issue.issue_type === "needs_retry");
  const followup = dataset.workbench.issues.find((issue) => issue.order_id === "line-followup" && issue.issue_type === "needs_manual_followup");
  assert.equal(retry.detail, "line parse looked wrong");
  assert.equal(retry.review_status, "needs_retry");
  assert.equal(followup.review_status, "needs_manual_followup");
});

test("buildWorkspaceDataset bases not-ready workbench issues on line-item readiness when line items exist", () => {
  const dataset = buildWorkspaceDataset({
    reconciliation: {
      rows: [
        {
          order_id: "all-lines-ready",
          order_date_iso: "2026-05-05T10:00:00+05:30",
          order_amount_value: 200,
          order_status_text: "Order delivered",
          reconciliation_status: "complete",
        },
        {
          order_id: "one-line-not-ready",
          order_date_iso: "2026-05-04T10:00:00+05:30",
          order_amount_value: 100,
          order_status_text: "Order delivered",
          reconciliation_status: "complete",
        },
        {
          order_id: "no-lines-not-ready",
          order_date_iso: "2026-05-03T10:00:00+05:30",
          order_amount_value: 50,
          order_status_text: "Order delivered",
          reconciliation_status: "complete",
        },
      ],
    },
    invoiceRows: [
      { source_order_id: "all-lines-ready", item_description: "Milk", invoice_number: "INV-A" },
      { source_order_id: "one-line-not-ready", item_description: "Bread", invoice_number: "INV-B" },
      { source_order_id: "one-line-not-ready", item_description: "Eggs", invoice_number: "INV-B" },
    ],
    annotations: {
      orders: {
        "all-lines-ready": { ready_for_splitwise: false },
        "one-line-not-ready": { ready_for_splitwise: true },
        "no-lines-not-ready": { ready_for_splitwise: false },
      },
      lineItems: {
        "all-lines-ready::INV-A::0": { ready_for_splitwise: true },
        "one-line-not-ready::INV-B::0": { ready_for_splitwise: true },
        "one-line-not-ready::INV-B::1": { ready_for_splitwise: false },
      },
    },
  });

  const notReadyOrderIds = dataset.workbench.issues
    .filter((issue) => issue.issue_type === "not_ready_for_split")
    .map((issue) => issue.order_id);

  assert.deepEqual(notReadyOrderIds, ["one-line-not-ready", "no-lines-not-ready"]);
});

test("applyWorkspaceFilters matches by status, month, invoice mode, and free text", () => {
  const orders = [
    {
      order_id: "order-1",
      order_month: "2026-05",
      reconciliation_status: "complete",
      order_status_text: "Order delivered",
      has_invoice: true,
      has_html_fallback: false,
      search_text: "order-1 INV-1 groceries milk shared family",
    },
    {
      order_id: "order-2",
      order_month: "2026-02",
      reconciliation_status: "missing_invoice_html_captured",
      order_status_text: "Order cancelled",
      has_invoice: false,
      has_html_fallback: true,
      search_text: "order-2 cancelled snacks html fallback",
    },
    {
      order_id: "order-3",
      order_month: "2026-04",
      reconciliation_status: "complete",
      order_status_text: "Order delivered",
      has_invoice: true,
      has_html_fallback: true,
      search_text: "order-3 dual source order",
    },
  ];

  assert.deepEqual(
    applyWorkspaceFilters(orders, { status: "complete" }).map((order) => order.order_id),
    ["order-1", "order-3"],
  );
  assert.equal(applyWorkspaceFilters(orders, { month: "2026-02" })[0].order_id, "order-2");
  assert.equal(applyWorkspaceFilters(orders, { invoiceMode: "html_fallback_only" })[0].order_id, "order-2");
  assert.deepEqual(
    applyWorkspaceFilters(orders, { invoiceMode: "invoice_only" }).map((order) => order.order_id),
    ["order-1"],
  );
  assert.deepEqual(
    applyWorkspaceFilters(orders, { invoiceMode: "missing_invoice_only" }).map((order) => order.order_id),
    ["order-2"],
  );
  assert.equal(
    applyWorkspaceFilters(orders, { invoiceMode: "html_fallback_only" }).some((order) => order.order_id === "order-3"),
    false,
  );
  assert.equal(
    applyWorkspaceFilters(orders, { invoiceMode: "invoice_only" }).some((order) => order.order_id === "order-3"),
    false,
  );
  assert.equal(applyWorkspaceFilters(orders, { query: "milk" })[0].order_id, "order-1");
  assert.equal(applyWorkspaceFilters(orders, { orderState: "cancelled" })[0].order_id, "order-2");
});

test("getVisibleLineItems applies status and line-item invoice mode semantics", async () => {
  const { getVisibleLineItems } = await import(stateModuleUrl);
  const state = {
    dataset: {
      lineItems: [
        {
          order_id: "invoice-only-order",
          order_month: "2026-05",
          order_status_text: "Order delivered",
          reconciliation_status: "complete",
          has_invoice: true,
          has_html_fallback: false,
          effective_category: "groceries",
          parse_quality: "parsed_line_item",
          ready_for_splitwise: true,
          search_text: "invoice only milk",
        },
        {
          order_id: "dual-source-order",
          order_month: "2026-05",
          order_status_text: "Order delivered",
          reconciliation_status: "amount_mismatch",
          has_invoice: true,
          has_html_fallback: true,
          effective_category: "personal",
          parse_quality: "parsed_line_item",
          ready_for_splitwise: false,
          search_text: "dual source cigarettes",
        },
      ],
    },
    filters: {
      query: "",
      month: "all",
      category: "all",
      parseQuality: "all",
      status: "all",
      orderState: "all",
      invoiceMode: "all",
      readyState: "all",
      sort: "date_desc",
    },
  };

  assert.deepEqual(
    getVisibleLineItems({
      ...state,
      filters: {
        ...state.filters,
        status: "amount_mismatch",
      },
    }).map((lineItem) => lineItem.order_id),
    ["dual-source-order"],
  );
  assert.deepEqual(
    getVisibleLineItems({
      ...state,
      filters: {
        ...state.filters,
        invoiceMode: "invoice_only",
      },
    }).map((lineItem) => lineItem.order_id),
    ["invoice-only-order", "dual-source-order"],
  );
});

test("getVisibleLineItems honors shared sort modes", async () => {
  const { getVisibleLineItems } = await import(stateModuleUrl);
  const state = {
    dataset: {
      lineItems: [
        {
          order_id: "older-higher",
          order_date_iso: "2026-03-01T10:00:00+05:30",
          order_amount_value: 100,
          line_total_amount: "300.00",
          order_month: "2026-03",
          order_status_text: "Order delivered",
          reconciliation_status: "complete",
          has_invoice: true,
          has_html_fallback: false,
          effective_category: "groceries",
          parse_quality: "parsed_line_item",
          ready_for_splitwise: false,
          search_text: "older higher",
        },
        {
          order_id: "newer-lower",
          order_date_iso: "2026-05-01T10:00:00+05:30",
          order_amount_value: 300,
          line_total_amount: "100.00",
          order_month: "2026-05",
          order_status_text: "Order delivered",
          reconciliation_status: "complete",
          has_invoice: true,
          has_html_fallback: false,
          effective_category: "groceries",
          parse_quality: "parsed_line_item",
          ready_for_splitwise: false,
          search_text: "newer lower",
        },
      ],
    },
    filters: {
      query: "",
      month: "all",
      category: "all",
      parseQuality: "all",
      status: "all",
      orderState: "all",
      invoiceMode: "all",
      readyState: "all",
      sort: "date_desc",
    },
  };

  assert.deepEqual(
    getVisibleLineItems(state).map((lineItem) => lineItem.order_id),
    ["newer-lower", "older-higher"],
  );
  assert.deepEqual(
    getVisibleLineItems({
      ...state,
      filters: {
        ...state.filters,
        sort: "date_asc",
      },
    }).map((lineItem) => lineItem.order_id),
    ["older-higher", "newer-lower"],
  );
  assert.deepEqual(
    getVisibleLineItems({
      ...state,
      filters: {
        ...state.filters,
        sort: "amount_desc",
      },
    }).map((lineItem) => lineItem.order_id),
    ["older-higher", "newer-lower"],
  );
  assert.deepEqual(
    getVisibleLineItems({
      ...state,
      filters: {
        ...state.filters,
        sort: "amount_asc",
      },
    }).map((lineItem) => lineItem.order_id),
    ["newer-lower", "older-higher"],
  );
});

test("paginateItems returns a clamped page slice and range summary", async () => {
  const { paginateItems } = await import(stateModuleUrl);
  const items = ["a", "b", "c", "d", "e", "f", "g", "h"];

  assert.deepEqual(paginateItems(items, { page: 2, pageSize: 3 }), {
    items: ["d", "e", "f"],
    summary: {
      page: 2,
      pageSize: 3,
      totalItems: 8,
      totalPages: 3,
      startItem: 4,
      endItem: 6,
      hasPrevious: true,
      hasNext: true,
    },
  });

  assert.deepEqual(paginateItems(items, { page: 99, pageSize: 3 }).summary, {
    page: 3,
    pageSize: 3,
    totalItems: 8,
    totalPages: 3,
    startItem: 7,
    endItem: 8,
    hasPrevious: true,
    hasNext: false,
  });
});

test("pagination state resets to the first page while preserving page size", async () => {
  const { resetPagination, updatePagination } = await import(stateModuleUrl);
  const state = {
    pagination: {
      page: 4,
      pageSize: 50,
    },
  };

  assert.equal(resetPagination(state).pagination.page, 1);
  assert.equal(state.pagination.pageSize, 50);

  updatePagination(state, { page: 3 });
  assert.deepEqual(state.pagination, { page: 3, pageSize: 50 });

  updatePagination(state, { pageSize: 10 });
  assert.deepEqual(state.pagination, { page: 1, pageSize: 10 });
});
