const CATEGORY_VOCABULARY = [
  "groceries",
  "household",
  "personal",
  "medicines",
  "snacks",
  "misc",
];

const CATEGORY_KEYWORDS = {
  groceries: [
    "milk",
    "paneer",
    "tomato",
    "potato",
    "onion",
    "vegetable",
    "fruit",
    "curd",
    "bread",
    "eggs",
    "egg",
    "mushroom",
    "rice",
    "atta",
    "dal",
    "hybrid",
  ],
  household: [
    "cleaner",
    "detergent",
    "mop",
    "tissue",
    "foil",
    "garbage bag",
    "storage",
    "container",
    "basket",
    "dishwash",
  ],
  personal: [
    "marlboro",
    "cigarette",
    "grooming",
    "cosmetic",
    "hydration drink",
    "zero sugar",
    "deodorant",
    "shampoo",
    "soap",
    "razor",
  ],
  medicines: [
    "vicks",
    "medicine",
    "tablet",
    "syrup",
    "ointment",
    "capsule",
    "capsules",
    "pharmacy",
    "melatonin",
    "sleep gummies",
    "gummies",
    "healthcare",
  ],
  snacks: [
    "potato chips",
    "chips",
    "puffs",
    "cookies",
    "cookie",
    "chocolate",
    "candy",
    "soft drink",
    "biscuit",
    "snack",
    "kurkure",
    "lays",
  ],
};

const PROMO_PATTERNS = [
  "flyer",
  "tv flyer",
  "hope starts here",
];

const SMALL_EXTRA_ITEM_PATTERNS = [
  "order adjustment",
  "service charge",
  "delivery fee",
  "handling fee",
];

const ROUNDING_ADJUSTMENT_PATTERNS = [
  "round off",
  "rounding adjustment",
  "tax adjustment",
  "cess",
];

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function roundCurrency(value) {
  return Number(Number(value || 0).toFixed(2));
}

function parseAmount(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? roundCurrency(value) : 0;
  }
  const text = String(value || "").trim();
  if (!text) {
    return 0;
  }
  const normalized = text.replace(/,/g, "");
  const multiplicationMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:x|\u00D7)\s*(?:rs\.?\s*)?(\d+(?:\.\d+)?)/i);
  if (multiplicationMatch) {
    return roundCurrency(Number(multiplicationMatch[1]) * Number(multiplicationMatch[2]));
  }
  const matches = normalized.match(/-?\d+(?:\.\d+)?/g) || [];
  if (matches.length === 0) {
    return 0;
  }
  const decimalMatches = matches.filter((match) => match.includes("."));
  const selected = decimalMatches.at(-1) || matches.at(-1);
  return roundCurrency(Number(selected));
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findPhraseRanges(text, phrase) {
  const phrasePattern = phrase
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => escapeRegex(part))
    .join("[\\s./_-]+");
  const pattern = new RegExp(`(^|[^a-z0-9])(${phrasePattern})(?=[^a-z0-9]|$)`, "g");
  const ranges = [];

  for (const match of text.matchAll(pattern)) {
    const prefix = match[1] || "";
    const matchedText = match[2] || "";
    const start = (match.index || 0) + prefix.length;
    ranges.push([start, start + matchedText.length]);
  }

  return ranges;
}

function isPromoLike(text) {
  return PROMO_PATTERNS.some((pattern) => findPhraseRanges(text, pattern).length > 0);
}

function findKeywordMatches(text, keywords) {
  const sortedKeywords = [...keywords].sort((left, right) => right.length - left.length || left.localeCompare(right));
  const occupiedRanges = [];
  const matches = [];

  for (const keyword of sortedKeywords) {
    for (const range of findPhraseRanges(text, keyword)) {
      const overlapsExisting = occupiedRanges.some(([start, end]) => range[0] < end && range[1] > start);
      if (!overlapsExisting) {
        occupiedRanges.push(range);
        matches.push(keyword);
        break;
      }
    }
  }

  return matches;
}

function isLikelySmallExtraItemRow(row) {
  const text = normalizeText(row?.item_description);
  return SMALL_EXTRA_ITEM_PATTERNS.some((pattern) => findPhraseRanges(text, pattern).length > 0);
}

function isLikelyRoundingAdjustmentRow(row) {
  const text = normalizeText(row?.item_description);
  return ROUNDING_ADJUSTMENT_PATTERNS.some((pattern) => findPhraseRanges(text, pattern).length > 0);
}

function collectRowSignals(row) {
  const text = normalizeText(row?.item_description);
  const amount = parseAmount(row?.line_total_amount);
  const promoLike = isPromoLike(text);
  const multiplier = promoLike ? 0.02 : 1;
  const matchesByCategory = {};

  for (const category of CATEGORY_VOCABULARY) {
    if (category === "misc") {
      continue;
    }
    const matches = findKeywordMatches(text, CATEGORY_KEYWORDS[category]);
    if (matches.length > 0) {
      matchesByCategory[category] = matches;
    }
  }

  return {
    amount,
    matchesByCategory,
    promoLike,
    text,
    weightedAmount: amount * multiplier,
  };
}

function determineConfidence(winnerScore, runnerUpScore) {
  if (winnerScore >= 75 && winnerScore >= (runnerUpScore * 2 || 1)) {
    return "high";
  }
  if (winnerScore >= 20 && winnerScore > runnerUpScore) {
    return "medium";
  }
  return "low";
}

function suggestOrderCategory(order) {
  const scores = Object.fromEntries(CATEGORY_VOCABULARY.map((category) => [category, 0]));
  const tieBreakers = Object.fromEntries(CATEGORY_VOCABULARY.map((category) => [category, 0]));
  const reasonsByCategory = new Map(CATEGORY_VOCABULARY.map((category) => [category, []]));

  for (const row of order?.invoice_rows || []) {
    const signals = collectRowSignals(row);
    const matchedCategories = Object.entries(signals.matchesByCategory);
    const rowScore = matchedCategories.length > 0
      ? signals.weightedAmount / matchedCategories.length
      : 0;
    for (const [category, matches] of matchedCategories) {
      scores[category] += rowScore;
      tieBreakers[category] += Math.max(...matches.map((keyword) => keyword.length), 0);
      const reasons = reasonsByCategory.get(category);
      for (const keyword of matches) {
        reasons.push({
          keyword,
          score: rowScore,
        });
      }
    }
  }

  const ranked = CATEGORY_VOCABULARY
    .filter((category) => category !== "misc")
    .map((category) => ({
      category,
      score: scores[category],
      tieBreaker: tieBreakers[category],
    }))
    .sort((left, right) => (
      right.score - left.score
      || right.tieBreaker - left.tieBreaker
      || left.category.localeCompare(right.category)
    ));

  const winner = ranked[0] || { category: "misc", score: 0 };
  const runnerUp = ranked[1] || { score: 0 };

  if (!winner.score) {
    return {
      category: "misc",
      confidence: "low",
      reasons: [],
    };
  }

  const reasons = (reasonsByCategory.get(winner.category) || [])
    .sort((left, right) => right.score - left.score || left.keyword.localeCompare(right.keyword))
    .map((entry) => entry.keyword)
    .filter((keyword, index, values) => values.indexOf(keyword) === index)
    .slice(0, 3);

  return {
    category: winner.category,
    confidence: determineConfidence(winner.score, runnerUp.score),
    reasons,
  };
}

function explainOrderMismatch(order) {
  if (order?.reconciliation_status !== "amount_mismatch") {
    return null;
  }

  const orderAmount = parseAmount(order?.order_amount_value);
  const invoiceAmount = parseAmount(order?.parsed_invoice_values);
  const rawDelta = roundCurrency(invoiceAmount - orderAmount);
  const absDelta = Math.abs(rawDelta);
  const deltaDirection = rawDelta > 0 ? "invoice_higher" : rawDelta < 0 ? "order_higher" : "equal";
  if (deltaDirection === "equal") {
    return null;
  }
  const rows = order?.invoice_rows || [];
  const promoRows = rows.filter((row) => isPromoLike(normalizeText(row?.item_description)));
  const matchingPromoRow = promoRows.find((row) => Math.abs(parseAmount(row?.line_total_amount) - absDelta) <= 0.15);
  const tinyRows = rows.filter((row) => parseAmount(row?.line_total_amount) <= 5);
  const matchingTinyRow = tinyRows.find((row) => (
    Math.abs(parseAmount(row?.line_total_amount) - absDelta) <= 0.15
      && isLikelySmallExtraItemRow(row)
  ));
  const matchingRoundingRow = rows.find((row) => (
    Math.abs(parseAmount(row?.line_total_amount) - absDelta) <= 0.15
      && isLikelyRoundingAdjustmentRow(row)
  ));

  if (rawDelta > 0 && absDelta <= 1.05 && matchingPromoRow) {
    return {
      order_amount: orderAmount,
      invoice_amount: invoiceAmount,
      delta_amount: absDelta,
      delta_direction: deltaDirection,
      likely_reason_code: "marketing_insert_rounding",
      likely_reason_summary: "A flyer-like or promo insert likely explains most of the small invoice delta.",
      confidence: "high",
      evidence_items: [matchingPromoRow.item_description || ""],
    };
  }

  if (rawDelta > 0 && absDelta <= 1.05 && matchingRoundingRow) {
    return {
      order_amount: orderAmount,
      invoice_amount: invoiceAmount,
      delta_amount: absDelta,
      delta_direction: deltaDirection,
      likely_reason_code: "rounding_or_tax_adjustment",
      likely_reason_summary: "The difference is small enough to look like rounding or a tax adjustment.",
      confidence: "medium",
      evidence_items: [matchingRoundingRow.item_description || ""],
    };
  }

  if (rawDelta > 0 && absDelta <= 5 && matchingTinyRow) {
    return {
      order_amount: orderAmount,
      invoice_amount: invoiceAmount,
      delta_amount: absDelta,
      delta_direction: deltaDirection,
      likely_reason_code: "small_extra_item",
      likely_reason_summary: "A small extra invoice line item closely matches the order and invoice difference.",
      confidence: absDelta <= 1.5 ? "high" : "medium",
      evidence_items: [matchingTinyRow.item_description || ""],
    };
  }

  if (rows.length > 1) {
    return {
      order_amount: orderAmount,
      invoice_amount: invoiceAmount,
      delta_amount: absDelta,
      delta_direction: deltaDirection,
      likely_reason_code: "mixed_basket_unclear",
      likely_reason_summary: "The basket has multiple line items and no single clear mismatch cause stands out.",
      confidence: "low",
      evidence_items: rows.slice(0, 3).map((row) => row.item_description || ""),
    };
  }

  return {
    order_amount: orderAmount,
    invoice_amount: invoiceAmount,
    delta_amount: absDelta,
    delta_direction: deltaDirection,
    likely_reason_code: "unclassified_mismatch",
    likely_reason_summary: "The mismatch is real, but the current heuristics cannot explain it confidently.",
    confidence: "low",
    evidence_items: rows.slice(0, 3).map((row) => row.item_description || ""),
  };
}

module.exports = {
  CATEGORY_VOCABULARY,
  explainOrderMismatch,
  suggestOrderCategory,
};
