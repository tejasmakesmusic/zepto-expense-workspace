const {
  sourceOrderIdFromFileName,
  toCsv,
} = require("./zepto_workflow_utils");

function parseMoney(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function toPaise(value) {
  const parsed = parseMoney(value);
  return parsed === null ? null : Math.round(parsed * 100);
}

function uniqueValues(values) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function compareAmounts(orderAmount, invoiceValues) {
  const orderPaise = toPaise(orderAmount);
  const numericInvoiceValues = uniqueValues(invoiceValues)
    .map(parseMoney)
    .filter((value) => value !== null);
  const invoiceValuePaise = numericInvoiceValues.map(toPaise).filter((value) => value !== null);

  if (orderPaise === null || invoiceValuePaise.length === 0) {
    return { match: "", normalizedInvoiceValues: numericInvoiceValues };
  }

  const match = invoiceValuePaise.some((value) => Math.abs(value - orderPaise) <= 5);
  return { match: match ? "yes" : "no", normalizedInvoiceValues: numericInvoiceValues };
}

function deriveParsedGroups(invoiceRows) {
  const parsedByOrderId = new Map();
  for (const row of invoiceRows) {
    const orderId = row.source_order_id || sourceOrderIdFromFileName(row.source_file);
    if (!orderId) {
      continue;
    }
    const existing = parsedByOrderId.get(orderId) || [];
    existing.push(row);
    parsedByOrderId.set(orderId, existing);
  }
  return parsedByOrderId;
}

function buildLedgerRow(order, downloadResult, parsedRows) {
  const parsedSourceFiles = uniqueValues(parsedRows.map((row) => row.source_file));
  const parsedInvoiceNumbers = uniqueValues(parsedRows.map((row) => row.invoice_number));
  const parsedOrderNumbers = uniqueValues(parsedRows.map((row) => row.order_number));
  const parsedInvoiceValues = uniqueValues(parsedRows.map((row) => row.invoice_value));
  const amountComparison = compareAmounts(order.order_amount_value, parsedInvoiceValues);
  const htmlCaptured = downloadResult && downloadResult.html_capture_status === "captured";

  let reconciliationStatus = "needs_review";
  let notes = "";
  if (!downloadResult) {
    notes = "No download summary result for this order.";
  } else if (downloadResult.status === "missing_button") {
    reconciliationStatus = htmlCaptured ? "missing_invoice_html_captured" : "missing_invoice";
    notes = htmlCaptured
      ? "Order detail page did not expose an invoice download button. Captured fallback order details from the HTML page."
      : "Order detail page did not expose an invoice download button.";
  } else if (downloadResult.status === "no_download" || downloadResult.status === "error") {
    reconciliationStatus = htmlCaptured ? "download_failed_html_captured" : "download_failed";
    notes = htmlCaptured
      ? `${downloadResult.error || "Invoice download did not complete."} Captured fallback order details from the HTML page.`
      : downloadResult.error || "Invoice download did not complete.";
  } else if (parsedRows.length === 0) {
    reconciliationStatus = "missing_invoice";
    notes = "Download summary shows an invoice file, but no parsed invoice rows were found.";
  } else if (amountComparison.match === "no") {
    reconciliationStatus = "amount_mismatch";
    notes = "Invoice value does not match the order-list amount.";
  } else {
    reconciliationStatus = "complete";
  }

  return {
    order_id: order.order_id,
    order_url: order.order_url,
    order_date_iso: order.order_date_iso,
    order_amount_display: order.order_amount_display,
    order_amount_value: order.order_amount_value ?? "",
    order_status_text: order.order_status_text,
    download_status: downloadResult ? downloadResult.status : "",
    download_file: downloadResult ? downloadResult.file || "" : "",
    parsed_source_files: parsedSourceFiles.join(" | "),
    parsed_invoice_numbers: parsedInvoiceNumbers.join(" | "),
    parsed_order_numbers: parsedOrderNumbers.join(" | "),
    parsed_invoice_values: parsedInvoiceValues.join(" | "),
    amount_match: amountComparison.match,
    reconciliation_status: reconciliationStatus,
    notes,
    html_capture_status: downloadResult ? downloadResult.html_capture_status || "" : "",
    html_capture_source: downloadResult ? downloadResult.html_capture_source || "" : "",
    html_html_path: downloadResult ? downloadResult.html_html_path || "" : "",
    html_json_path: downloadResult ? downloadResult.html_json_path || "" : "",
    html_order_number: downloadResult ? downloadResult.html_order_number || "" : "",
    html_items_text: downloadResult ? downloadResult.html_items_text || "" : "",
    html_bill_summary_text: downloadResult ? downloadResult.html_bill_summary_text || "" : "",
    html_order_details_text: downloadResult ? downloadResult.html_order_details_text || "" : "",
    html_receiver_details_text: downloadResult ? downloadResult.html_receiver_details_text || "" : "",
    html_delivery_address_text: downloadResult ? downloadResult.html_delivery_address_text || "" : "",
    html_order_placed_at_text: downloadResult ? downloadResult.html_order_placed_at_text || "" : "",
  };
}

function buildOrphanRow(orderId, parsedRows) {
  return {
    order_id: orderId,
    order_url: "",
    order_date_iso: "",
    order_amount_display: "",
    order_amount_value: "",
    order_status_text: "",
    download_status: "",
    download_file: "",
    parsed_source_files: uniqueValues(parsedRows.map((row) => row.source_file)).join(" | "),
    parsed_invoice_numbers: uniqueValues(parsedRows.map((row) => row.invoice_number)).join(" | "),
    parsed_order_numbers: uniqueValues(parsedRows.map((row) => row.order_number)).join(" | "),
    parsed_invoice_values: uniqueValues(parsedRows.map((row) => row.invoice_value)).join(" | "),
    amount_match: "",
    reconciliation_status: "parsed_without_order_match",
    notes: "Parsed invoice rows do not have a matching order in the captured order ledger.",
  };
}

function buildSummary(startedFrom, orders, ordersDiscovered, downloadResults, parsedByOrderId, rows) {
  const statusCounts = {};
  for (const row of rows) {
    statusCounts[row.reconciliation_status] = (statusCounts[row.reconciliation_status] || 0) + 1;
  }

  const uniqueParsedOrderIds = [...parsedByOrderId.keys()];
  return {
    startedFrom,
    total_orders_discovered: ordersDiscovered,
    total_in_scope_orders: orders.length,
    total_download_results: downloadResults.length,
    total_downloaded: downloadResults.filter((item) => item.status === "downloaded").length,
    total_already_downloaded: downloadResults.filter((item) => item.status === "already_downloaded").length,
    total_missing_button: downloadResults.filter((item) => item.status === "missing_button").length,
    total_no_download: downloadResults.filter((item) => item.status === "no_download").length,
    total_error: downloadResults.filter((item) => item.status === "error").length,
    total_html_fallback_captured: downloadResults.filter((item) => item.html_capture_status === "captured").length,
    total_unique_parsed_order_ids: uniqueParsedOrderIds.length,
    dataset_complete: rows.every((row) => row.reconciliation_status === "complete"),
    data_capture_complete: rows.every((row) =>
      row.reconciliation_status === "complete" ||
      row.reconciliation_status === "amount_mismatch" ||
      row.html_capture_status === "captured"
    ),
    status_counts: statusCounts,
    missing_order_ids: rows
      .filter((row) => row.reconciliation_status !== "complete")
      .map((row) => row.order_id),
  };
}

function buildReconciliation({
  startedFrom = "",
  orders = [],
  ordersDiscovered = orders.length,
  downloadSummary = {},
  invoiceRows = [],
}) {
  const inScopeOrders = orders.filter((order) => order.in_scope_from_start_date !== false);
  const downloadResults = Array.isArray(downloadSummary.results) ? downloadSummary.results : [];
  const downloadByOrderId = new Map(
    downloadResults.map((result) => [result.order_id || "", result]).filter(([orderId]) => orderId),
  );
  const parsedByOrderId = deriveParsedGroups(invoiceRows);

  const rows = inScopeOrders.map((order) =>
    buildLedgerRow(order, downloadByOrderId.get(order.order_id), parsedByOrderId.get(order.order_id) || []),
  );

  const knownOrderIds = new Set(inScopeOrders.map((order) => order.order_id));
  for (const [orderId, parsedRows] of parsedByOrderId.entries()) {
    if (!knownOrderIds.has(orderId)) {
      rows.push(buildOrphanRow(orderId, parsedRows));
    }
  }

  return {
    summary: buildSummary(startedFrom, inScopeOrders, ordersDiscovered, downloadResults, parsedByOrderId, rows),
    rows,
  };
}

function reconciliationRowsToCsv(rows) {
  const headers = [
    "order_id",
    "order_url",
    "order_date_iso",
    "order_amount_display",
    "order_amount_value",
    "order_status_text",
    "download_status",
    "download_file",
    "parsed_source_files",
    "parsed_invoice_numbers",
    "parsed_order_numbers",
    "parsed_invoice_values",
    "amount_match",
    "reconciliation_status",
    "notes",
    "html_capture_status",
    "html_capture_source",
    "html_html_path",
    "html_json_path",
    "html_order_number",
    "html_items_text",
    "html_bill_summary_text",
    "html_order_details_text",
    "html_receiver_details_text",
    "html_delivery_address_text",
    "html_order_placed_at_text",
  ];
  return toCsv(headers, rows);
}

module.exports = {
  buildReconciliation,
  reconciliationRowsToCsv,
};
