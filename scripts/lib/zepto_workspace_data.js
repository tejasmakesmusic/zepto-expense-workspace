const fs = require("node:fs/promises");
const path = require("node:path");

const { sourceOrderIdFromFileName } = require("./zepto_workflow_utils");
const { emptyAnnotations, readAnnotations } = require("./zepto_review_annotations");
const {
  explainOrderMismatch,
  suggestOrderCategory,
} = require("./zepto_workspace_insights");

function readJson(filePath, fallbackValue) {
  return fs.readFile(filePath, "utf8")
    .then((raw) => JSON.parse(raw))
    .catch((error) => {
      if (error && error.code === "ENOENT") {
        return fallbackValue;
      }
      throw error;
    });
}

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeMonth(isoString) {
  const text = String(isoString || "");
  return /^\d{4}-\d{2}/.test(text) ? text.slice(0, 7) : "";
}

function splitPipeValues(text) {
  return String(text || "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function toWorkspaceRelativePath(filePath, baseDir) {
  if (!filePath || !baseDir) {
    return "";
  }
  const relativePath = path.relative(baseDir, filePath);
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return "";
  }
  return relativePath.replace(/\\/g, "/");
}

function toFileUrl(filePath, baseDir) {
  const relativePath = toWorkspaceRelativePath(filePath, baseDir);
  return relativePath ? `/files/${encodeURIComponent(relativePath)}` : "";
}

function groupInvoiceRows(invoiceRows) {
  const byOrderId = new Map();
  for (const row of invoiceRows || []) {
    const orderId = row.source_order_id || sourceOrderIdFromFileName(row.source_file);
    if (!orderId) {
      continue;
    }
    const bucket = byOrderId.get(orderId) || [];
    bucket.push(row);
    byOrderId.set(orderId, bucket);
  }
  return byOrderId;
}

function groupHtmlFallbacks(htmlFallbacks) {
  const byOrderId = new Map();
  for (const row of htmlFallbacks || []) {
    if (!row.order_id) {
      continue;
    }
    byOrderId.set(row.order_id, row);
  }
  return byOrderId;
}

function deriveOrderSearchText(order) {
  return [
    order.order_id,
    order.order_status_text,
    ...(order.invoice_numbers || []),
    ...(order.order_numbers || []),
    ...(order.invoice_rows || []).map((row) => row.item_description || ""),
    order.html_fallback?.html_items_text || "",
    order.html_fallback?.html_bill_summary_text || "",
    order.annotations?.expense_category || "",
    order.annotations?.split_type || "",
    order.annotations?.split_with || "",
    order.annotations?.notes || "",
  ]
    .join(" ")
    .toLowerCase();
}

function hasSuppressedSuggestedCategory(annotations) {
  return Boolean(annotations?.suppress_suggested_category) && !annotations?.expense_category;
}

function buildHtmlFallback(row, htmlFallback) {
  const htmlCaptureStatus = row.html_capture_status || htmlFallback?.html_capture_status || "";
  if (!htmlCaptureStatus) {
    return null;
  }

  return {
    order_id: row.order_id,
    html_capture_status: htmlCaptureStatus,
    html_capture_source: row.html_capture_source || htmlFallback?.html_capture_source || "",
    html_html_path: row.html_html_path || htmlFallback?.html_html_path || "",
    html_json_path: row.html_json_path || htmlFallback?.html_json_path || "",
    html_order_number: row.html_order_number || htmlFallback?.html_order_number || "",
    html_items_text: row.html_items_text || htmlFallback?.html_items_text || "",
    html_bill_summary_text: row.html_bill_summary_text || htmlFallback?.html_bill_summary_text || "",
    html_order_details_text: row.html_order_details_text || htmlFallback?.html_order_details_text || "",
    html_receiver_details_text: row.html_receiver_details_text || htmlFallback?.html_receiver_details_text || "",
    html_delivery_address_text: row.html_delivery_address_text || htmlFallback?.html_delivery_address_text || "",
    html_order_placed_at_text: row.html_order_placed_at_text || htmlFallback?.html_order_placed_at_text || "",
  };
}

function buildOrderRecord(row, orderLedgerRow, invoiceRows, htmlFallback, annotations, baseDir) {
  const invoiceNumbers = unique([
    ...splitPipeValues(row.parsed_invoice_numbers),
    ...invoiceRows.map((invoiceRow) => invoiceRow.invoice_number || ""),
  ]);
  const orderNumbers = unique([
    ...splitPipeValues(row.parsed_order_numbers),
    ...invoiceRows.map((invoiceRow) => invoiceRow.order_number || ""),
    row.html_order_number || "",
    htmlFallback?.html_order_number || "",
  ]);
  const downloadFile = row.download_file || "";
  const mergedHtmlFallback = buildHtmlFallback(row, htmlFallback);
  const htmlPath = row.html_html_path || htmlFallback?.html_html_path || "";
  const htmlJsonPath = row.html_json_path || htmlFallback?.html_json_path || "";
  const categorySuggestion = suggestOrderCategory({
    invoice_rows: invoiceRows,
  });
  const suppressSuggestedCategory = hasSuppressedSuggestedCategory(annotations);
  const mismatchExplainer = explainOrderMismatch({
    reconciliation_status: row.reconciliation_status,
    order_amount_value: row.order_amount_value,
    parsed_invoice_values: row.parsed_invoice_values,
    invoice_rows: invoiceRows,
  });
  const order = {
    ...row,
    order_card_text: orderLedgerRow?.order_card_text || "",
    invoice_rows: invoiceRows,
    invoice_numbers: invoiceNumbers,
    order_numbers: orderNumbers,
    has_invoice: invoiceRows.length > 0 || Boolean(downloadFile),
    has_html_fallback: (row.html_capture_status || htmlFallback?.html_capture_status || "") === "captured",
    is_exception: row.reconciliation_status !== "complete",
    order_month: safeMonth(row.order_date_iso),
    annotations: annotations || {},
    suggested_category: categorySuggestion.category || "",
    suggested_category_confidence: categorySuggestion.confidence || "low",
    suggested_category_reasons: categorySuggestion.reasons || [],
    effective_category: annotations?.expense_category || (suppressSuggestedCategory ? "" : categorySuggestion.category || ""),
    mismatch_explainer: mismatchExplainer,
    html_fallback: mergedHtmlFallback,
    links: {
      invoice: toFileUrl(downloadFile, baseDir),
      html: toFileUrl(htmlPath, baseDir),
      htmlJson: toFileUrl(htmlJsonPath, baseDir),
    },
  };
  order.search_text = deriveOrderSearchText(order);
  return order;
}

function deriveMonthlySpend(orders) {
  const totals = new Map();
  for (const order of orders) {
    const month = order.order_month;
    if (!month) {
      continue;
    }
    totals.set(month, (totals.get(month) || 0) + safeNumber(order.order_amount_value));
  }
  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, amount]) => ({ month, amount: Number(amount.toFixed(2)) }));
}

function deriveLineItemSearchText(order, invoiceRow) {
  return unique([
    order.order_id,
    order.order_status_text,
    order.order_month,
    String(order.order_amount_value ?? ""),
    order.reconciliation_status,
    invoiceRow.effective_category,
    order.suggested_category,
    invoiceRow.split_type || "",
    invoiceRow.split_with || "",
    invoiceRow.notes || "",
    invoiceRow.item_description || "",
    invoiceRow.invoice_number || "",
    invoiceRow.order_number || "",
    invoiceRow.seller_name || "",
    invoiceRow.seller_gstin || "",
    invoiceRow.parse_quality || "",
  ].map((part) => String(part || "").trim()))
    .join(" ")
    .toLowerCase();
}

function hasOwn(record, key) {
  return Object.prototype.hasOwnProperty.call(record || {}, key);
}

function deriveLineItemKey(order, invoiceRow, lineIndex) {
  return `${order.order_id || ""}::${invoiceRow.invoice_number || ""}::${lineIndex}`;
}

function valueFromLineOrOrder(lineAnnotation, orderAnnotation, key, fallback = "") {
  if (hasOwn(lineAnnotation, key)) {
    return lineAnnotation[key];
  }
  if (hasOwn(orderAnnotation, key)) {
    return orderAnnotation[key];
  }
  return fallback;
}

function ownsAnyAnnotationField(record, fields) {
  return fields.some((field) => hasOwn(record, field));
}

function deriveLineSplitTagSource(lineAnnotation, orderAnnotation) {
  const tagFields = ["expense_category", "split_type", "split_with", "ready_for_splitwise"];
  if (ownsAnyAnnotationField(lineAnnotation, tagFields)) {
    return "line_item";
  }
  if (ownsAnyAnnotationField(orderAnnotation, tagFields)) {
    return "order";
  }
  return "suggested";
}

function deriveLineItems(orders, lineItemAnnotations = {}) {
  return (orders || [])
    .flatMap((order) =>
      (order.invoice_rows || []).map((invoiceRow, lineIndex) => {
        const lineItemKey = deriveLineItemKey(order, invoiceRow, lineIndex);
        const lineAnnotation = lineItemAnnotations[lineItemKey] || {};
        const orderAnnotation = order.annotations || {};
        const effectiveLineRow = {
          effective_category: valueFromLineOrOrder(lineAnnotation, orderAnnotation, "expense_category", order.effective_category || ""),
          split_type: valueFromLineOrOrder(lineAnnotation, orderAnnotation, "split_type", ""),
          split_with: valueFromLineOrOrder(lineAnnotation, orderAnnotation, "split_with", ""),
          notes: valueFromLineOrOrder(lineAnnotation, orderAnnotation, "notes", ""),
          ready_for_splitwise: hasOwn(lineAnnotation, "ready_for_splitwise")
            ? Boolean(lineAnnotation.ready_for_splitwise)
            : Boolean(orderAnnotation.ready_for_splitwise),
          review_status: valueFromLineOrOrder(lineAnnotation, orderAnnotation, "review_status", ""),
          review_reason: valueFromLineOrOrder(lineAnnotation, orderAnnotation, "review_reason", ""),
        };
        const lineItem = {
          order_id: order.order_id,
          line_item_key: lineItemKey,
          order_date_iso: order.order_date_iso || "",
          order_month: order.order_month || "",
          order_status_text: order.order_status_text || "",
          order_amount_value: order.order_amount_value,
          reconciliation_status: order.reconciliation_status || "",
          has_invoice: Boolean(order.has_invoice),
          has_html_fallback: Boolean(order.has_html_fallback),
          effective_category: effectiveLineRow.effective_category || "",
          suggested_category: order.suggested_category || "",
          split_type: effectiveLineRow.split_type || "",
          split_with: effectiveLineRow.split_with || "",
          notes: effectiveLineRow.notes || "",
          ready_for_splitwise: effectiveLineRow.ready_for_splitwise,
          review_status: effectiveLineRow.review_status || "",
          review_reason: effectiveLineRow.review_reason || "",
          split_tag_source: deriveLineSplitTagSource(lineAnnotation, orderAnnotation),
          annotations: lineAnnotation,
          item_description: invoiceRow.item_description || "",
          quantity: invoiceRow.quantity || "",
          product_rate: invoiceRow.product_rate || "",
          line_total_amount: invoiceRow.line_total_amount || "",
          invoice_number: invoiceRow.invoice_number || "",
          order_number: invoiceRow.order_number || "",
          seller_name: invoiceRow.seller_name || "",
          seller_gstin: invoiceRow.seller_gstin || "",
          parse_quality: invoiceRow.parse_quality || "",
        };
        lineItem.search_text = deriveLineItemSearchText(order, { ...invoiceRow, ...lineItem });
        return lineItem;
      }),
    )
    .sort((left, right) => String(right.order_date_iso || "").localeCompare(String(left.order_date_iso || "")));
}

function isCancelledOrder(order) {
  return /cancelled/i.test(order.order_status_text || "") || order.reconciliation_status === "cancelled_order";
}

function isDownloadFailure(order, downloadResult) {
  const reconciliationStatus = String(order.reconciliation_status || "").toLowerCase();
  const downloadStatus = String(downloadResult?.status || "").toLowerCase();
  return reconciliationStatus === "download_failed" || ["error", "failed", "download_failed"].includes(downloadStatus);
}

function makeWorkbenchIssue(order, issueType, title, detail, overrides = {}) {
  return {
    order_id: order.order_id,
    issue_type: issueType,
    title,
    detail,
    order_date_iso: order.order_date_iso || "",
    order_amount_value: order.order_amount_value,
    reconciliation_status: order.reconciliation_status || "",
    review_status: order.annotations?.review_status || "",
    has_invoice: Boolean(order.has_invoice),
    has_html_fallback: Boolean(order.has_html_fallback),
    mismatch_explainer: order.mismatch_explainer || null,
    ...overrides,
  };
}

function deriveWorkbench(orders, lineItems = [], downloadSummary = {}) {
  const downloadByOrderId = new Map((downloadSummary.results || []).map((row) => [row.order_id, row]));
  const lineItemsByOrderId = new Map();
  for (const lineItem of lineItems || []) {
    const bucket = lineItemsByOrderId.get(lineItem.order_id) || [];
    bucket.push(lineItem);
    lineItemsByOrderId.set(lineItem.order_id, bucket);
  }
  const priority = {
    amount_mismatch: 10,
    missing_invoice_html_captured: 20,
    missing_invoice_without_fallback: 20,
    download_failed: 30,
    cancelled_order: 40,
    needs_retry: 50,
    needs_manual_followup: 60,
    not_ready_for_split: 70,
  };
  const issuesByKey = new Map();
  const addIssue = (issue) => {
    issuesByKey.set(`${issue.order_id}::${issue.issue_type}`, issue);
  };

  for (const order of orders || []) {
    const downloadResult = downloadByOrderId.get(order.order_id);
    const orderLineItems = lineItemsByOrderId.get(order.order_id) || [];
    if (order.reconciliation_status === "amount_mismatch") {
      addIssue(makeWorkbenchIssue(order, "amount_mismatch", "Amount mismatch", "Order amount does not match parsed invoice totals."));
    }
    if (order.reconciliation_status === "missing_invoice_html_captured") {
      addIssue(makeWorkbenchIssue(order, "missing_invoice_html_captured", "Missing invoice with HTML fallback", "Invoice PDF is missing, but an HTML fallback was captured."));
    }
    if (order.reconciliation_status === "missing_invoice_without_fallback") {
      addIssue(makeWorkbenchIssue(order, "missing_invoice_without_fallback", "Missing invoice without fallback", "Invoice PDF is missing and no HTML fallback is available."));
    }
    if (isDownloadFailure(order, downloadResult)) {
      addIssue(makeWorkbenchIssue(order, "download_failed", "Download failed", `Download status: ${downloadResult?.status || order.reconciliation_status || "failed"}.`));
    }
    if (isCancelledOrder(order)) {
      addIssue(makeWorkbenchIssue(order, "cancelled_order", "Cancelled order", "Order is marked cancelled and may need exclusion or follow-up."));
    }
    if (order.annotations?.review_status === "needs_retry") {
      addIssue(makeWorkbenchIssue(order, "needs_retry", "Needs retry", order.annotations?.review_reason || "Reviewer marked this order for retry."));
    }
    if (order.annotations?.review_status === "needs_manual_followup") {
      addIssue(makeWorkbenchIssue(order, "needs_manual_followup", "Needs manual follow-up", order.annotations?.review_reason || "Reviewer marked this order for manual follow-up."));
    }
    for (const lineItem of orderLineItems) {
      if (lineItem.review_status === "needs_retry") {
        addIssue(makeWorkbenchIssue(
          order,
          "needs_retry",
          "Needs retry",
          lineItem.review_reason || "A line item was marked for retry.",
          { review_status: lineItem.review_status || "" },
        ));
      }
      if (lineItem.review_status === "needs_manual_followup") {
        addIssue(makeWorkbenchIssue(
          order,
          "needs_manual_followup",
          "Needs manual follow-up",
          lineItem.review_reason || "A line item was marked for manual follow-up.",
          { review_status: lineItem.review_status || "" },
        ));
      }
    }
    const hasLineItems = orderLineItems.length > 0;
    const readyForSplit = hasLineItems
      ? orderLineItems.every((lineItem) => lineItem.ready_for_splitwise)
      : Boolean(order.annotations?.ready_for_splitwise);
    if (!isCancelledOrder(order) && !readyForSplit) {
      addIssue(makeWorkbenchIssue(order, "not_ready_for_split", "Not ready for split", "Order is not marked ready for Splitwise export."));
    }
  }

  const issues = [...issuesByKey.values()].sort((left, right) => {
    const priorityDelta = (priority[left.issue_type] || 999) - (priority[right.issue_type] || 999);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    const dateDelta = String(right.order_date_iso || "").localeCompare(String(left.order_date_iso || ""));
    if (dateDelta !== 0) {
      return dateDelta;
    }
    return String(left.order_id || "").localeCompare(String(right.order_id || ""));
  });
  const issueCounts = {};
  for (const issue of issues) {
    issueCounts[issue.issue_type] = (issueCounts[issue.issue_type] || 0) + 1;
  }
  return { issues, issueCounts };
}

function deriveWorkspaceSummary(orders, reconciliationSummary = {}) {
  const statusCounts = { ...(reconciliationSummary.status_counts || {}) };
  const totalSpend = orders.reduce((sum, order) => sum + safeNumber(order.order_amount_value), 0);
  const invoiceCompleteCount = orders.filter((order) => order.reconciliation_status === "complete").length;
  const htmlFallbackCount = orders.filter((order) => order.has_html_fallback).length;
  const amountMismatchCount = orders.filter((order) => order.reconciliation_status === "amount_mismatch").length;
  const annotationCount = orders.filter((order) => Object.keys(order.annotations || {}).length > 0).length;
  return {
    totalOrders: orders.length,
    invoiceCompleteCount,
    htmlFallbackCount,
    amountMismatchCount,
    exceptionCount: orders.length - invoiceCompleteCount,
    dataCaptureComplete: Boolean(reconciliationSummary.data_capture_complete),
    datasetComplete: Boolean(reconciliationSummary.dataset_complete),
    totalSpend: Number(totalSpend.toFixed(2)),
    monthlySpend: deriveMonthlySpend(orders),
    statusCounts,
    annotationCount,
  };
}

function deriveSourceMetadata({
  baseDir,
  reconciliation,
  ordersLedger,
  invoiceRows,
  htmlFallbacks,
  annotations,
  downloadSummary,
}) {
  return {
    reconciliation: {
      path: "outputs/zepto_reconciliation.json",
      rowCount: Array.isArray(reconciliation.rows) ? reconciliation.rows.length : 0,
    },
    ordersLedger: {
      path: "outputs/zepto_orders_ledger.json",
      rowCount: Array.isArray(ordersLedger.orders) ? ordersLedger.orders.length : 0,
      capturedAt: ordersLedger.capturedAt || "",
    },
    invoiceRows: {
      path: "outputs/zepto_invoice_rows.json",
      rowCount: Array.isArray(invoiceRows) ? invoiceRows.length : 0,
    },
    htmlFallbacks: {
      path: "outputs/zepto_html_fallbacks.json",
      rowCount: Array.isArray(htmlFallbacks) ? htmlFallbacks.length : 0,
    },
    downloadSummary: {
      path: "outputs/zepto_download_summary.json",
      rowCount: Array.isArray(downloadSummary.results) ? downloadSummary.results.length : 0,
    },
    annotations: {
      path: "outputs/zepto_review_annotations.json",
      orderCount: Object.keys(annotations.orders || {}).length,
      lineItemCount: Object.keys(annotations.lineItems || {}).length,
      updatedAt: annotations.updatedAt || null,
    },
    workbook: {
      path: "outputs/zepto_expense_split_ready.xlsx",
      url: toFileUrl(path.join(baseDir, "outputs", "zepto_expense_split_ready.xlsx"), baseDir),
    },
  };
}

function buildWorkspaceDataset({
  reconciliation = { summary: {}, rows: [] },
  ordersLedger = { orders: [] },
  invoiceRows = [],
  htmlFallbacks = [],
  annotations = emptyAnnotations(),
  downloadSummary = { results: [] },
  baseDir = "",
}) {
  const invoiceRowsByOrderId = groupInvoiceRows(invoiceRows);
  const htmlFallbackByOrderId = groupHtmlFallbacks(htmlFallbacks);
  const ledgerByOrderId = new Map((ordersLedger.orders || []).map((order) => [order.order_id, order]));

  const orders = (reconciliation.rows || [])
    .map((row) => buildOrderRecord(
      row,
      ledgerByOrderId.get(row.order_id),
      invoiceRowsByOrderId.get(row.order_id) || [],
      htmlFallbackByOrderId.get(row.order_id) || null,
      annotations.orders?.[row.order_id] || {},
      baseDir,
    ))
    .sort((left, right) => String(right.order_date_iso || "").localeCompare(String(left.order_date_iso || "")));
  const lineItems = deriveLineItems(orders, annotations.lineItems || {});
  const workbench = deriveWorkbench(orders, lineItems, downloadSummary);

  return {
    generatedAt: new Date().toISOString(),
    summary: deriveWorkspaceSummary(orders, reconciliation.summary || {}),
    reconciliationSummary: reconciliation.summary || {},
    orders,
    lineItems,
    workbench,
    featureSuggestions: [
      "Auto-suggest categories from item descriptions",
      "Show amount mismatch delta explanations",
      "Export support packets for cancelled orders with HTML fallback only",
      "Compare workflow runs across dates",
      "Support line-item-level split tagging",
    ],
    sources: deriveSourceMetadata({
      baseDir,
      reconciliation,
      ordersLedger,
      invoiceRows,
      htmlFallbacks,
      annotations,
      downloadSummary,
    }),
  };
}

function applyWorkspaceFilters(orders, filters = {}) {
  return (orders || []).filter((order) => {
    if (filters.status && filters.status !== "all" && order.reconciliation_status !== filters.status) {
      return false;
    }
    if (filters.month && filters.month !== "all" && order.order_month !== filters.month) {
      return false;
    }
    if (filters.orderState === "delivered" && !/delivered/i.test(order.order_status_text || "")) {
      return false;
    }
    if (filters.orderState === "cancelled" && !/cancelled/i.test(order.order_status_text || "")) {
      return false;
    }
    if (filters.invoiceMode === "invoice_only" && (!order.has_invoice || order.has_html_fallback)) {
      return false;
    }
    if (filters.invoiceMode === "html_fallback_only" && (!order.has_html_fallback || order.has_invoice)) {
      return false;
    }
    if (filters.invoiceMode === "missing_invoice_only" && order.has_invoice) {
      return false;
    }
    if (filters.query && !String(order.search_text || "").includes(String(filters.query).trim().toLowerCase())) {
      return false;
    }
    return true;
  });
}

async function loadWorkspaceDataset({ baseDir }) {
  const outputsDir = path.join(baseDir, "outputs");
  const reconciliationPath = path.join(outputsDir, "zepto_reconciliation.json");
  const ordersLedgerPath = path.join(outputsDir, "zepto_orders_ledger.json");
  const invoiceRowsPath = path.join(outputsDir, "zepto_invoice_rows.json");
  const htmlFallbacksPath = path.join(outputsDir, "zepto_html_fallbacks.json");
  const downloadSummaryPath = path.join(outputsDir, "zepto_download_summary.json");
  const annotationsPath = path.join(outputsDir, "zepto_review_annotations.json");

  const [reconciliation, ordersLedger, invoiceRows, htmlFallbacks, downloadSummary, annotations] = await Promise.all([
    readJson(reconciliationPath, { summary: {}, rows: [] }),
    readJson(ordersLedgerPath, { orders: [] }),
    readJson(invoiceRowsPath, []),
    readJson(htmlFallbacksPath, []),
    readJson(downloadSummaryPath, { results: [] }),
    readAnnotations(annotationsPath),
  ]);

  return buildWorkspaceDataset({
    reconciliation,
    ordersLedger,
    invoiceRows,
    htmlFallbacks,
    annotations,
    downloadSummary,
    baseDir,
  });
}

module.exports = {
  applyWorkspaceFilters,
  buildWorkspaceDataset,
  deriveWorkspaceSummary,
  loadWorkspaceDataset,
  toFileUrl,
  toWorkspaceRelativePath,
};
