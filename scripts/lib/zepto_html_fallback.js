const { toCsv } = require("./zepto_workflow_utils");

function normalizeWhitespace(text = "") {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function extractSection(text, startPattern, endPattern) {
  const source = normalizeWhitespace(text);
  const match = source.match(startPattern);
  if (!match) {
    return "";
  }
  const startIndex = match.index + match[0].length;
  const rest = source.slice(startIndex);
  if (!endPattern) {
    return normalizeWhitespace(rest);
  }
  const endMatch = rest.match(endPattern);
  const section = endMatch ? rest.slice(0, endMatch.index) : rest;
  return normalizeWhitespace(section);
}

function extractValue(text, pattern) {
  const match = normalizeWhitespace(text).match(pattern);
  return match ? normalizeWhitespace(match[1] || match[0]) : "";
}

function buildHtmlFallbackRecord({ order, pageState, htmlPath = "", jsonPath = "" }) {
  const bodyText = normalizeWhitespace(pageState?.bodyText || "");
  const buttonTexts = Array.isArray(pageState?.buttonTexts)
    ? pageState.buttonTexts.map((text) => normalizeWhitespace(text)).filter(Boolean)
    : [];

  return {
    order_id: order.order_id,
    order_url: order.order_url,
    order_date_iso: order.order_date_iso || "",
    order_amount_display: order.order_amount_display || "",
    order_status_text: order.order_status_text || "",
    html_capture_status: "captured",
    html_capture_source: "order_page_html",
    html_html_path: htmlPath,
    html_json_path: jsonPath,
    html_order_number: extractValue(bodyText, /Order\s+#([A-Z0-9]+)/i),
    html_items_text: extractSection(
      bodyText,
      /\b(?:\d+\s+items?\s+in\s+order)\b/i,
      /\bBill Summary\b/i,
    ),
    html_bill_summary_text: extractSection(bodyText, /\bBill Summary\b/i, /\bOrder Details\b/i),
    html_order_details_text: extractSection(
      bodyText,
      /\bOrder Details\b/i,
      /\b(?:Rate Order|Order Again)\b/i,
    ),
    html_receiver_details_text: extractSection(bodyText, /\bReceiver Details\b/i, /\bDelivery Address\b/i),
    html_delivery_address_text: extractSection(bodyText, /\bDelivery Address\b/i, /\bOrder Placed at\b/i),
    html_order_placed_at_text: extractValue(bodyText, /\bOrder Placed at\s+(.+?)(?:\bOrder Arrived at\b|\bOrder Again\b|$)/i),
    html_button_texts: buttonTexts.join(" | "),
    html_raw_text: bodyText,
  };
}

function htmlFallbackRowsToCsv(rows) {
  const headers = [
    "order_id",
    "order_url",
    "order_date_iso",
    "order_amount_display",
    "order_status_text",
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
    "html_button_texts",
  ];
  return toCsv(headers, rows);
}

module.exports = {
  buildHtmlFallbackRecord,
  htmlFallbackRowsToCsv,
};
