const fs = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_SETTINGS = {
  provider: "",
  model: "",
  apiKey: "",
  redactPrivateFields: true,
  allowRawHtmlFallback: false,
};

const DEFAULT_MODELS = {
  openai: "gpt-4.1-mini",
  anthropic: "claude-3-5-haiku-latest",
};

const CATEGORY_VALUES = new Set(["groceries", "household", "personal", "medicines", "snacks", "misc"]);
const SPLIT_TYPE_VALUES = new Set(["personal", "shared", "exclude", "needs_review"]);

function getSettingsPath(baseDir) {
  return path.join(baseDir, "outputs", "zepto_ai_settings.json");
}

function normalizeProvider(value) {
  const provider = String(value || "").trim().toLowerCase();
  return ["openai", "anthropic"].includes(provider) ? provider : "";
}

function normalizeSettings(raw = {}) {
  const provider = normalizeProvider(raw.provider);
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    provider,
    model: String(raw.model || DEFAULT_MODELS[provider] || "").trim(),
    apiKey: String(raw.apiKey || "").trim(),
    redactPrivateFields: raw.redactPrivateFields !== false,
    allowRawHtmlFallback: raw.allowRawHtmlFallback === true,
  };
}

function publicSettings(settings) {
  return {
    provider: settings.provider,
    model: settings.model,
    hasApiKey: Boolean(settings.apiKey),
    apiKeyPreview: settings.apiKey ? `${settings.apiKey.slice(0, 7)}...${settings.apiKey.slice(-4)}` : "",
    redactPrivateFields: settings.redactPrivateFields,
    allowRawHtmlFallback: settings.allowRawHtmlFallback,
  };
}

async function readAiSettings(baseDir) {
  try {
    const raw = JSON.parse(await fs.readFile(getSettingsPath(baseDir), "utf8"));
    return normalizeSettings(raw);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return normalizeSettings({});
    }
    throw error;
  }
}

async function writeAiSettings(baseDir, patch = {}) {
  const current = await readAiSettings(baseDir);
  const next = normalizeSettings({
    ...current,
    ...patch,
    apiKey: patch.apiKey === undefined ? current.apiKey : patch.apiKey,
  });
  await fs.mkdir(path.dirname(getSettingsPath(baseDir)), { recursive: true });
  await fs.writeFile(getSettingsPath(baseDir), JSON.stringify(next, null, 2) + "\n", "utf8");
  return next;
}

function stripPrivateInvoiceFields(row = {}) {
  return {
    source_order_id: row.source_order_id || "",
    item_description: row.item_description || "",
    quantity: row.quantity || "",
    product_rate: row.product_rate || "",
    line_total_amount: row.line_total_amount || "",
    invoice_value: row.invoice_value || "",
    parse_quality: row.parse_quality || "",
  };
}

function redactOrder(order = {}, settings = DEFAULT_SETTINGS) {
  const base = {
    order_id: order.order_id || "",
    order_date_iso: order.order_date_iso || "",
    order_month: order.order_month || "",
    order_amount_value: order.order_amount_value || 0,
    order_status_text: order.order_status_text || "",
    reconciliation_status: order.reconciliation_status || "",
    parsed_invoice_values: order.parsed_invoice_values || "",
    effective_category: order.effective_category || "",
    suggested_category: order.suggested_category || "",
    mismatch_explainer: order.mismatch_explainer || null,
    annotations: order.annotations || {},
    invoice_rows: (order.invoice_rows || []).map(stripPrivateInvoiceFields),
  };

  if (settings.allowRawHtmlFallback) {
    base.html_fallback = order.html_fallback || null;
  } else if (order.html_fallback) {
    base.html_fallback = {
      html_capture_status: order.html_fallback.html_capture_status || "",
      html_items_text: order.html_fallback.html_items_text || "",
      html_bill_summary_text: settings.redactPrivateFields ? "" : order.html_fallback.html_bill_summary_text || "",
    };
  }

  return base;
}

function redactLineItem(lineItem = {}) {
  return {
    order_id: lineItem.order_id || "",
    line_item_key: lineItem.line_item_key || "",
    order_date_iso: lineItem.order_date_iso || "",
    order_month: lineItem.order_month || "",
    order_status_text: lineItem.order_status_text || "",
    reconciliation_status: lineItem.reconciliation_status || "",
    item_description: lineItem.item_description || "",
    quantity: lineItem.quantity || "",
    product_rate: lineItem.product_rate || "",
    line_total_amount: lineItem.line_total_amount || "",
    effective_category: lineItem.effective_category || "",
    suggested_category: lineItem.suggested_category || "",
    split_type: lineItem.split_type || "",
    split_with: lineItem.split_with || "",
    notes: lineItem.notes || "",
    ready_for_splitwise: Boolean(lineItem.ready_for_splitwise),
    parse_quality: lineItem.parse_quality || "",
  };
}

function buildDatasetSnapshot(dataset, settings) {
  const orders = (dataset.orders || []).map((order) => redactOrder(order, settings));
  const lineItems = (dataset.lineItems || []).map(redactLineItem);
  return {
    generatedAt: dataset.generatedAt || "",
    summary: dataset.summary || {},
    orders,
    lineItems,
    workbench: dataset.workbench || { issues: [], issueCounts: {} },
  };
}

function extractJsonObject(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    return {};
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("AI response did not contain JSON.");
    }
    return JSON.parse(match[0]);
  }
}

async function callOpenAI(settings, systemPrompt, userPayload) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${settings.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: settings.model || DEFAULT_MODELS.openai,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || `OpenAI request failed with ${response.status}`);
  }
  return extractJsonObject(payload.choices?.[0]?.message?.content || "{}");
}

async function callAnthropic(settings, systemPrompt, userPayload) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: settings.model || DEFAULT_MODELS.anthropic,
      max_tokens: 4000,
      temperature: 0.2,
      system: systemPrompt,
      messages: [
        { role: "user", content: JSON.stringify(userPayload) },
      ],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || `Anthropic request failed with ${response.status}`);
  }
  const text = (payload.content || [])
    .map((part) => part.type === "text" ? part.text : "")
    .join("\n");
  return extractJsonObject(text);
}

async function callConfiguredAi(settings, systemPrompt, userPayload) {
  if (!settings.provider || !settings.apiKey) {
    const error = new Error("Add an OpenAI or Anthropic API key in AI Settings first.");
    error.code = "AI_SETTINGS_REQUIRED";
    error.statusCode = 400;
    throw error;
  }
  if (settings.provider === "openai") {
    return callOpenAI(settings, systemPrompt, userPayload);
  }
  if (settings.provider === "anthropic") {
    return callAnthropic(settings, systemPrompt, userPayload);
  }
  throw new Error("Unsupported AI provider.");
}

function safeCategory(value, fallback = "misc") {
  const category = String(value || "").trim().toLowerCase();
  return CATEGORY_VALUES.has(category) ? category : fallback;
}

function safeSplitType(value, fallback = "needs_review") {
  const splitType = String(value || "").trim().toLowerCase();
  return SPLIT_TYPE_VALUES.has(splitType) ? splitType : fallback;
}

function normalizeLineItemSuggestions(payload = {}) {
  const suggestions = Array.isArray(payload.suggestions) ? payload.suggestions : [];
  return suggestions
    .map((item) => ({
      line_item_key: String(item.line_item_key || ""),
      order_id: String(item.order_id || ""),
      expense_category: safeCategory(item.expense_category),
      split_type: safeSplitType(item.split_type),
      split_with: String(item.split_with || ""),
      ready_for_splitwise: item.ready_for_splitwise === true,
      notes: String(item.notes || item.reason || ""),
      confidence: String(item.confidence || "medium"),
      reason: String(item.reason || item.notes || ""),
    }))
    .filter((item) => item.line_item_key);
}

function normalizeMismatchExplanations(payload = {}) {
  return (Array.isArray(payload.explanations) ? payload.explanations : [])
    .map((item) => ({
      order_id: String(item.order_id || ""),
      summary: String(item.summary || ""),
      likely_reason: String(item.likely_reason || ""),
      confidence: String(item.confidence || "medium"),
      evidence: Array.isArray(item.evidence) ? item.evidence.map(String).slice(0, 5) : [],
      suggested_action: String(item.suggested_action || ""),
    }))
    .filter((item) => item.order_id);
}

function normalizeAnomalies(payload = {}) {
  return (Array.isArray(payload.anomalies) ? payload.anomalies : [])
    .map((item) => ({
      id: String(item.id || item.order_id || item.line_item_key || ""),
      type: String(item.type || "unusual_purchase"),
      severity: String(item.severity || "medium"),
      title: String(item.title || ""),
      detail: String(item.detail || ""),
      evidence: Array.isArray(item.evidence) ? item.evidence.map(String).slice(0, 5) : [],
    }))
    .filter((item) => item.title || item.detail);
}

function actionPrompt(action) {
  const base = "You are an expense-review assistant for a local Zepto invoice workspace. Return strict JSON only. Do not include markdown. Do not infer personal identity. Prefer conservative suggestions and include reasons.";
  const prompts = {
    categorize: `${base} Categorize invoice line items into one of groceries, household, personal, medicines, snacks, misc. Also suggest split_type as personal, shared, exclude, or needs_review. Return {"suggestions":[{"line_item_key":"","order_id":"","expense_category":"","split_type":"","split_with":"","ready_for_splitwise":false,"confidence":"low|medium|high","reason":"","notes":""}]}.`,
    mismatches: `${base} Explain order/invoice mismatches. Return {"explanations":[{"order_id":"","summary":"","likely_reason":"","confidence":"low|medium|high","evidence":[],"suggested_action":""}]}.`,
    monthlySummary: `${base} Summarize monthly spending patterns, category drivers, and review risks. Return {"summary":"","highlights":[],"category_notes":[],"recommended_actions":[]}.`,
    anomalies: `${base} Detect unusual purchases, possible duplicate invoices, repeated items, odd amounts, or review risks. Return {"anomalies":[{"id":"","type":"","severity":"low|medium|high","title":"","detail":"","evidence":[]}]}.`,
    htmlFallback: `${base} Structure messy HTML fallback order text into order number, item guesses, bill summary, and missing fields. Return {"fallbacks":[{"order_id":"","order_number":"","items":[],"bill_summary":"","missing_fields":[],"confidence":"low|medium|high"}]}.`,
    query: `${base} Answer natural language questions using only the supplied local dataset snapshot. Return {"answer":"","rows":[{"label":"","value":"","order_id":"","line_item_key":""}],"assumptions":[]}.`,
  };
  return prompts[action] || base;
}

function actionPayload(action, dataset, settings, requestBody = {}) {
  const snapshot = buildDatasetSnapshot(dataset, settings);
  if (action === "categorize") {
    const limit = Math.min(Number(requestBody.limit || 100), 200);
    return {
      lineItems: snapshot.lineItems
        .filter((item) => requestBody.includeReviewed ? true : !item.ready_for_splitwise)
        .slice(0, limit),
    };
  }
  if (action === "mismatches") {
    return {
      orders: snapshot.orders.filter((order) => order.reconciliation_status === "amount_mismatch" || order.reconciliation_status !== "complete"),
    };
  }
  if (action === "htmlFallback") {
    return {
      orders: snapshot.orders.filter((order) => order.html_fallback),
    };
  }
  if (action === "query") {
    return {
      question: String(requestBody.question || ""),
      dataset: snapshot,
    };
  }
  return snapshot;
}

async function runAiAction({ baseDir, dataset, action, requestBody = {} }) {
  const settings = await readAiSettings(baseDir);
  const payload = actionPayload(action, dataset, settings, requestBody);
  const raw = await callConfiguredAi(settings, actionPrompt(action), payload);
  if (action === "categorize") {
    return { action, suggestions: normalizeLineItemSuggestions(raw), raw };
  }
  if (action === "mismatches") {
    return { action, explanations: normalizeMismatchExplanations(raw), raw };
  }
  if (action === "anomalies") {
    return { action, anomalies: normalizeAnomalies(raw), raw };
  }
  return { action, ...raw };
}

async function testAiSettings(baseDir) {
  const settings = await readAiSettings(baseDir);
  const raw = await callConfiguredAi(
    settings,
    "Return strict JSON only. Return {\"ok\":true,\"message\":\"connected\"}.",
    { ping: true },
  );
  return {
    ok: raw.ok === true,
    message: String(raw.message || "connected"),
    settings: publicSettings(settings),
  };
}

module.exports = {
  publicSettings,
  readAiSettings,
  runAiAction,
  testAiSettings,
  writeAiSettings,
};
