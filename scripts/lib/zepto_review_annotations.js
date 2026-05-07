const fs = require("node:fs/promises");
const path = require("node:path");

const ALLOWED_KEYS = new Set([
  "expense_category",
  "suppress_suggested_category",
  "split_type",
  "split_with",
  "notes",
  "ready_for_splitwise",
  "review_status",
  "review_reason",
]);

function emptyAnnotations() {
  return {
    updatedAt: null,
    orders: {},
    lineItems: {},
  };
}

function normalizeAnnotation(record = {}) {
  const next = {};
  for (const [key, value] of Object.entries(record || {})) {
    if (!ALLOWED_KEYS.has(key)) {
      continue;
    }
    next[key] = value;
  }
  return next;
}

function normalizeAnnotations(payload = {}) {
  const normalized = emptyAnnotations();
  normalized.updatedAt = payload.updatedAt || null;
  normalized.orders = {};
  for (const [orderId, record] of Object.entries(payload.orders || {})) {
    normalized.orders[orderId] = normalizeAnnotation(record);
  }
  normalized.lineItems = {};
  for (const [lineItemKey, record] of Object.entries(payload.lineItems || {})) {
    normalized.lineItems[lineItemKey] = normalizeAnnotation(record);
  }
  return normalized;
}

async function readAnnotations(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return normalizeAnnotations(JSON.parse(raw));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return emptyAnnotations();
    }
    throw error;
  }
}

async function writeOrderAnnotation(filePath, orderId, patch) {
  const existing = await readAnnotations(filePath);
  const current = existing.orders[orderId] || {};
  const next = {
    updatedAt: new Date().toISOString(),
    orders: {
      ...existing.orders,
      [orderId]: {
        ...current,
        ...normalizeAnnotation(patch),
      },
    },
    lineItems: existing.lineItems || {},
  };
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(next, null, 2) + "\n", "utf8");
  return next;
}

async function writeLineItemAnnotation(filePath, lineItemKey, patch) {
  const existing = await readAnnotations(filePath);
  const current = existing.lineItems[lineItemKey] || {};
  const next = {
    updatedAt: new Date().toISOString(),
    orders: existing.orders || {},
    lineItems: {
      ...existing.lineItems,
      [lineItemKey]: {
        ...current,
        ...normalizeAnnotation(patch),
      },
    },
  };
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(next, null, 2) + "\n", "utf8");
  return next;
}

module.exports = {
  emptyAnnotations,
  readAnnotations,
  writeOrderAnnotation,
  writeLineItemAnnotation,
};
