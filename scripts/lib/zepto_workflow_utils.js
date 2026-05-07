const path = require("path");

const SOURCE_ORDER_ID_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-/i;

function normalizeWhitespace(text = "") {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function sanitizeFilename(name) {
  return String(name ?? "").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
}

function orderIdFromHref(href, fallback = "unknown-order") {
  return (String(href ?? "").match(/\/order\/([^/?]+)/) || [])[1] || fallback;
}

function sourceOrderIdFromFileName(fileName, fallback = "") {
  return (path.basename(String(fileName ?? "")).match(SOURCE_ORDER_ID_RE) || [])[1] || fallback;
}

function parseOrderDate(text) {
  const isoString = parseOrderDateIsoString(text);
  if (!isoString) {
    return null;
  }
  const parsed = new Date(isoString);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseOrderDateIsoString(text) {
  if (!text) {
    return null;
  }
  const match = String(text).match(
    /Placed at\s+(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4}),\s+(\d{1,2}:\d{2}\s*[ap]m)/i,
  );
  if (!match) {
    return null;
  }
  const [, day, month, year, time] = match;
  const monthIndex = new Date(`${month} 1, ${year}`).getMonth();
  if (!Number.isFinite(monthIndex) || monthIndex < 0) {
    return null;
  }
  const [clock, meridiemRaw] = time.trim().split(/\s+/);
  const [hoursRaw, minutesRaw] = clock.split(":").map(Number);
  const meridiem = meridiemRaw.toLowerCase();
  let hours = hoursRaw % 12;
  if (meridiem === "pm") {
    hours += 12;
  }
  const monthPart = String(monthIndex + 1).padStart(2, "0");
  const dayPart = String(Number(day)).padStart(2, "0");
  const hourPart = String(hours).padStart(2, "0");
  const minutePart = String(minutesRaw).padStart(2, "0");
  return `${year}-${monthPart}-${dayPart}T${hourPart}:${minutePart}:00+05:30`;
}

function extractOrderAmount(text) {
  const matches = [...String(text ?? "").matchAll(/(?:₹|â‚¹|Rs\.?)\s*([0-9]+(?:\.[0-9]+)?)/gi)];
  if (matches.length === 0) {
    return { display: "", value: null };
  }
  const raw = matches[matches.length - 1][1];
  const value = Number(raw);
  return {
    display: raw,
    value: Number.isFinite(value) ? value : null,
  };
}

function extractOrderStatusText(text) {
  const compact = normalizeWhitespace(text);
  const placedAtMatch = compact.match(/^(.*?)\s+Placed at\b/i);
  let status = placedAtMatch ? placedAtMatch[1].trim() : compact;
  status = status.replace(/\s+Rate your order$/i, "").trim();
  status = status.replace(/\s+REFUND COMPLETED$/i, "").trim();
  return status;
}

function parseOrderCardText(text, href, startDate) {
  const compact = normalizeWhitespace(text);
  const orderDate = parseOrderDate(compact);
  const orderDateIso = parseOrderDateIsoString(compact);
  const amount = extractOrderAmount(compact);

  return {
    order_id: orderIdFromHref(href),
    order_url: href,
    order_date_iso: orderDateIso || "",
    order_amount_display: amount.display,
    order_amount_value: amount.value,
    order_status_text: extractOrderStatusText(compact),
    order_card_text: compact,
    in_scope_from_start_date: orderDate ? orderDate >= startDate : true,
  };
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(headers, rows) {
  return [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n") + "\n";
}

module.exports = {
  normalizeWhitespace,
  sanitizeFilename,
  orderIdFromHref,
  sourceOrderIdFromFileName,
  parseOrderDate,
  parseOrderDateIsoString,
  parseOrderCardText,
  toCsv,
};
