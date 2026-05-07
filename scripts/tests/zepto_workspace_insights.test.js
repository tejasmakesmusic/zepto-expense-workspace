const test = require("node:test");
const assert = require("node:assert/strict");

const {
  suggestOrderCategory,
  explainOrderMismatch,
} = require("../lib/zepto_workspace_insights");

test("suggestOrderCategory picks groceries for a grocery-heavy basket", () => {
  const suggestion = suggestOrderCategory({
    invoice_rows: [
      {
        item_description: "Country Delight Buffalo Fresh Milk | Pouch 1 pack (450 ml)",
        line_total_amount: "138.00",
      },
      {
        item_description: "Ananda Paneer | Made from Cow Milk",
        line_total_amount: "83.00",
      },
      {
        item_description: "Tomato Hybrid 500 g",
        line_total_amount: "42.00",
      },
    ],
  });

  assert.equal(suggestion.category, "groceries");
  assert.equal(suggestion.confidence, "high");
  assert.ok(Array.isArray(suggestion.reasons));
  assert.ok(suggestion.reasons.length > 0);
});

test("suggestOrderCategory discounts flyer-like rows so a personal item still wins", () => {
  const suggestion = suggestOrderCategory({
    invoice_rows: [
      {
        item_description: "TV Flyer 1 pc",
        line_total_amount: "1.00",
      },
      {
        item_description: "Marlboro Advance Compact 1 pack (10 pcs)",
        line_total_amount: "95.00",
      },
    ],
  });

  assert.equal(suggestion.category, "personal");
  assert.notEqual(suggestion.category, "misc");
});

test("suggestOrderCategory does not heavily discount legitimate items just because they contain promo wording", () => {
  const suggestion = suggestOrderCategory({
    invoice_rows: [
      {
        item_description: "Promo Protein Drink 1 bottle",
        line_total_amount: "120.00",
      },
      {
        item_description: "Hydration Drink Lime 1 bottle",
        line_total_amount: "95.00",
      },
    ],
  });

  assert.equal(suggestion.category, "personal");
  assert.equal(suggestion.confidence, "high");
});

test("suggestOrderCategory picks medicines for a medicine-like basket", () => {
  const suggestion = suggestOrderCategory({
    invoice_rows: [
      {
        item_description: "Vicks Season Change Kit",
        line_total_amount: "1.00",
      },
      {
        item_description: "Nurtiburst Serene Sleep Gummies With Melatonin 1 pack (10 pcs)",
        line_total_amount: "79.00",
      },
    ],
  });

  assert.equal(suggestion.category, "medicines");
});

test("suggestOrderCategory matches hyphenated phrase variants", () => {
  const suggestion = suggestOrderCategory({
    invoice_rows: [
      {
        item_description: "Zero-Sugar Lime Sparkling Drink 1 bottle",
        line_total_amount: "79.00",
      },
    ],
  });

  assert.equal(suggestion.category, "personal");
  assert.deepEqual(suggestion.reasons, ["zero sugar"]);
});

test("suggestOrderCategory handles formatted amount inputs", () => {
  const suggestion = suggestOrderCategory({
    invoice_rows: [
      {
        item_description: "Country Delight Eggs | Pack of 12",
        line_total_amount: "Rs. 142.96",
      },
      {
        item_description: "Brown Bread",
        line_total_amount: "1,234.50",
      },
    ],
  });

  assert.equal(suggestion.category, "groceries");
  assert.equal(suggestion.confidence, "high");
});

test("explainOrderMismatch parses formatted amount inputs exactly", () => {
  const explanation = explainOrderMismatch({
    reconciliation_status: "amount_mismatch",
    order_amount_value: "1,233.49",
    parsed_invoice_values: "Rs. 1,234.50",
    invoice_rows: [
      {
        item_description: "Order Adjustment",
        line_total_amount: "Rs. 1.01",
      },
    ],
  });

  assert.equal(explanation.order_amount, 1233.49);
  assert.equal(explanation.invoice_amount, 1234.5);
  assert.equal(explanation.delta_amount, 1.01);
  assert.equal(explanation.delta_direction, "invoice_higher");
  assert.equal(explanation.likely_reason_code, "small_extra_item");
});

test("explainOrderMismatch parses amount values when strings contain multiple numbers", () => {
  const explanation = explainOrderMismatch({
    reconciliation_status: "amount_mismatch",
    order_amount_value: "2 x Rs. 49.00",
    parsed_invoice_values: "Qty 3 - 149.00",
    invoice_rows: [
      {
        item_description: "Adjustment line",
        line_total_amount: "100.00",
      },
    ],
  });

  assert.equal(explanation.order_amount, 98);
  assert.equal(explanation.invoice_amount, 149);
  assert.equal(explanation.delta_amount, 51);
  assert.equal(explanation.delta_direction, "invoice_higher");
  assert.equal(explanation.likely_reason_code, "unclassified_mismatch");
});

test("explainOrderMismatch parses reverse multiplication amount layouts", () => {
  const explanation = explainOrderMismatch({
    reconciliation_status: "amount_mismatch",
    order_amount_value: "Rs. 49.00 x 2",
    parsed_invoice_values: "149.00",
    invoice_rows: [
      {
        item_description: "Adjustment line",
        line_total_amount: "100.00",
      },
    ],
  });

  assert.equal(explanation.order_amount, 98);
  assert.equal(explanation.invoice_amount, 149);
  assert.equal(explanation.delta_amount, 51);
  assert.equal(explanation.delta_direction, "invoice_higher");
  assert.equal(explanation.likely_reason_code, "unclassified_mismatch");
});

test("explainOrderMismatch parses multiplication layouts with the real multiplication sign", () => {
  const explanation = explainOrderMismatch({
    reconciliation_status: "amount_mismatch",
    order_amount_value: "Rs. 49.00 × 2",
    parsed_invoice_values: "149.00",
    invoice_rows: [
      {
        item_description: "Adjustment line",
        line_total_amount: "100.00",
      },
    ],
  });

  assert.equal(explanation.order_amount, 98);
  assert.equal(explanation.invoice_amount, 149);
  assert.equal(explanation.delta_amount, 51);
  assert.equal(explanation.delta_direction, "invoice_higher");
  assert.equal(explanation.likely_reason_code, "unclassified_mismatch");
});

test("explainOrderMismatch uses rounding_or_tax_adjustment for a tiny positive delta with explicit rounding evidence", () => {
  const explanation = explainOrderMismatch({
    reconciliation_status: "amount_mismatch",
    order_amount_value: 200,
    parsed_invoice_values: "201.00",
    invoice_rows: [
      {
        item_description: "Round Off Adjustment",
        line_total_amount: "1.00",
      },
    ],
  });

  assert.equal(explanation.delta_amount, 1);
  assert.equal(explanation.delta_direction, "invoice_higher");
  assert.equal(explanation.likely_reason_code, "rounding_or_tax_adjustment");
  assert.equal(explanation.confidence, "medium");
});

test("explainOrderMismatch prefers rounding_or_tax_adjustment for tax adjustment rows", () => {
  const explanation = explainOrderMismatch({
    reconciliation_status: "amount_mismatch",
    order_amount_value: 200,
    parsed_invoice_values: "201.00",
    invoice_rows: [
      {
        item_description: "Tax Adjustment",
        line_total_amount: "1.00",
      },
    ],
  });

  assert.equal(explanation.delta_amount, 1);
  assert.equal(explanation.delta_direction, "invoice_higher");
  assert.equal(explanation.likely_reason_code, "rounding_or_tax_adjustment");
  assert.notEqual(explanation.likely_reason_code, "small_extra_item");
  assert.deepEqual(explanation.evidence_items, ["Tax Adjustment"]);
});

test("explainOrderMismatch does not use rounding_or_tax_adjustment for generic product rows containing tax wording", () => {
  const explanation = explainOrderMismatch({
    reconciliation_status: "amount_mismatch",
    order_amount_value: 200,
    parsed_invoice_values: "201.00",
    invoice_rows: [
      {
        item_description: "Tax Saver Candy",
        line_total_amount: "1.00",
      },
    ],
  });

  assert.equal(explanation.delta_amount, 1);
  assert.equal(explanation.delta_direction, "invoice_higher");
  assert.notEqual(explanation.likely_reason_code, "rounding_or_tax_adjustment");
  assert.equal(explanation.likely_reason_code, "unclassified_mismatch");
});

test("explainOrderMismatch matches hyphenated promo and adjustment phrases", () => {
  const promoExplanation = explainOrderMismatch({
    reconciliation_status: "amount_mismatch",
    order_amount_value: 141.95,
    parsed_invoice_values: "142.96",
    invoice_rows: [
      {
        item_description: "Hope-Starts-Here",
        line_total_amount: "1.01",
      },
    ],
  });

  assert.equal(promoExplanation.likely_reason_code, "marketing_insert_rounding");
  assert.deepEqual(promoExplanation.evidence_items, ["Hope-Starts-Here"]);

  const adjustmentExplanation = explainOrderMismatch({
    reconciliation_status: "amount_mismatch",
    order_amount_value: 200,
    parsed_invoice_values: "201.00",
    invoice_rows: [
      {
        item_description: "Tax-Adjustment",
        line_total_amount: "1.00",
      },
    ],
  });

  assert.equal(adjustmentExplanation.likely_reason_code, "rounding_or_tax_adjustment");
});

test("explainOrderMismatch does not use rounding_or_tax_adjustment for a one-item basket without adjustment evidence", () => {
  const explanation = explainOrderMismatch({
    reconciliation_status: "amount_mismatch",
    order_amount_value: 141.95,
    parsed_invoice_values: "142.96",
    invoice_rows: [
      {
        item_description: "Brown Bread",
        line_total_amount: "142.96",
      },
    ],
  });

  assert.equal(explanation.delta_amount, 1.01);
  assert.equal(explanation.delta_direction, "invoice_higher");
  assert.notEqual(explanation.likely_reason_code, "rounding_or_tax_adjustment");
  assert.equal(explanation.likely_reason_code, "unclassified_mismatch");
});

test("explainOrderMismatch uses unclassified_mismatch when there is too little evidence to explain a larger delta", () => {
  const explanation = explainOrderMismatch({
    reconciliation_status: "amount_mismatch",
    order_amount_value: 100,
    parsed_invoice_values: "108.75",
    invoice_rows: [
      {
        item_description: "Single unclear line",
        line_total_amount: "108.75",
      },
    ],
  });

  assert.equal(explanation.delta_amount, 8.75);
  assert.equal(explanation.delta_direction, "invoice_higher");
  assert.equal(explanation.likely_reason_code, "unclassified_mismatch");
  assert.equal(explanation.confidence, "low");
});

test("explainOrderMismatch stays conservative when parsed amounts normalize to equal totals", () => {
  const explanation = explainOrderMismatch({
    reconciliation_status: "amount_mismatch",
    order_amount_value: "Rs. 142.960",
    parsed_invoice_values: "142.96",
    invoice_rows: [
      {
        item_description: "Valentine's Day Flyer 1 pc",
        line_total_amount: "1.00",
      },
    ],
  });

  assert.equal(explanation, null);
});

test("suggestOrderCategory picks household for household supplies", () => {
  const suggestion = suggestOrderCategory({
    invoice_rows: [
      {
        item_description: "Kitchen Aluminium Foil 1 pack",
        line_total_amount: "65.00",
      },
      {
        item_description: "Floor Cleaner Citrus 1 bottle",
        line_total_amount: "149.00",
      },
    ],
  });

  assert.equal(suggestion.category, "household");
});

test("suggestOrderCategory picks snacks for packaged snack foods", () => {
  const suggestion = suggestOrderCategory({
    invoice_rows: [
      {
        item_description: "Potato Chips Cream & Onion 1 pack",
        line_total_amount: "40.00",
      },
      {
        item_description: "Chocolate Cookies 1 pack",
        line_total_amount: "55.00",
      },
    ],
  });

  assert.equal(suggestion.category, "snacks");
});

test("suggestOrderCategory does not let incidental grocery words overpower a snack item", () => {
  const suggestion = suggestOrderCategory({
    invoice_rows: [
      {
        item_description: "Potato Chips Cream & Onion 1 pack",
        line_total_amount: "40.00",
      },
    ],
  });

  assert.equal(suggestion.category, "snacks");
  assert.ok(
    suggestion.reasons.includes("chips")
      || suggestion.reasons.includes("potato chips")
  );
});

test("suggestOrderCategory does not count one mixed row fully into multiple categories", () => {
  const suggestion = suggestOrderCategory({
    invoice_rows: [
      {
        item_description: "Soap Cookies Combo",
        line_total_amount: "100.00",
      },
      {
        item_description: "Brown Bread",
        line_total_amount: "90.00",
      },
    ],
  });

  assert.equal(suggestion.category, "groceries");
  assert.ok(suggestion.reasons.includes("bread"));
});

test("suggestOrderCategory avoids substring false positives for category keywords", () => {
  const suggestion = suggestOrderCategory({
    invoice_rows: [
      {
        item_description: "Eggless Hair Serum",
        line_total_amount: "199.00",
      },
      {
        item_description: "Cookiez Body Mist",
        line_total_amount: "175.00",
      },
    ],
  });

  assert.equal(suggestion.category, "misc");
  assert.equal(suggestion.confidence, "low");
  assert.deepEqual(suggestion.reasons, []);
});

test("suggestOrderCategory does not inflate a row from overlapping keywords", () => {
  const suggestion = suggestOrderCategory({
    invoice_rows: [
      {
        item_description: "Butter Cookies 1 pack",
        line_total_amount: "55.00",
      },
      {
        item_description: "Carry Bag",
        line_total_amount: "54.00",
      },
    ],
  });

  assert.equal(suggestion.category, "snacks");
  assert.deepEqual(suggestion.reasons, ["cookies"]);
});

test("suggestOrderCategory returns misc with low confidence when there is no signal", () => {
  const suggestion = suggestOrderCategory({
    invoice_rows: [
      {
        item_description: "ZX-41 Bundle",
        line_total_amount: "37.00",
      },
      {
        item_description: "Service Unit 9",
        line_total_amount: "18.00",
      },
    ],
  });

  assert.equal(suggestion.category, "misc");
  assert.equal(suggestion.confidence, "low");
  assert.deepEqual(suggestion.reasons, []);
});

test("explainOrderMismatch classifies flyer-plus-small-delta cases as marketing inserts", () => {
  const explanation = explainOrderMismatch({
    reconciliation_status: "amount_mismatch",
    order_amount_value: 141.95,
    parsed_invoice_values: "142.96",
    invoice_rows: [
      {
        item_description: "Valentine's Day Flyer 1 pc",
        line_total_amount: "1.00",
      },
      {
        item_description: "Marlboro Advance Compact 1 pack (10 pcs)",
        line_total_amount: "95.00",
      },
    ],
  });

  assert.equal(explanation.order_amount, 141.95);
  assert.equal(explanation.invoice_amount, 142.96);
  assert.equal(explanation.delta_amount, 1.01);
  assert.equal(explanation.delta_direction, "invoice_higher");
  assert.equal(explanation.likely_reason_code, "marketing_insert_rounding");
  assert.equal(explanation.confidence, "high");
  assert.ok(Array.isArray(explanation.evidence_items));
  assert.ok(explanation.evidence_items.length > 0);
});

test("explainOrderMismatch does not use promo text alone when the promo row does not explain the delta", () => {
  const explanation = explainOrderMismatch({
    reconciliation_status: "amount_mismatch",
    order_amount_value: 270,
    parsed_invoice_values: "271.76",
    invoice_rows: [
      {
        item_description: "Country Delight Buffalo Fresh Milk | Pouch 1 pack (450 ml)",
        line_total_amount: "138.00",
      },
      {
        item_description: "Zyro by Karan Aujla Hydration Drink | Zero Sugar | Lime & Lemon 1 pc (400 ml)",
        line_total_amount: "53.00",
      },
      {
        item_description: "Nurtiburst Serene Sleep Gummies With Melatonin 1 pack (10 pcs)",
        line_total_amount: "79.00",
      },
      {
        item_description: "NOVA IVF Fertility | Hope Starts Here",
        line_total_amount: "1.00",
      },
    ],
  });

  assert.equal(explanation.likely_reason_code, "mixed_basket_unclear");
});

test("explainOrderMismatch does not treat generic insert wording as promo material by itself", () => {
  const explanation = explainOrderMismatch({
    reconciliation_status: "amount_mismatch",
    order_amount_value: 200,
    parsed_invoice_values: "201.00",
    invoice_rows: [
      {
        item_description: "Fruit Insert Gummies 1 pack",
        line_total_amount: "1.00",
      },
      {
        item_description: "Daily Use Cleanser",
        line_total_amount: "200.00",
      },
    ],
  });

  assert.equal(explanation.delta_direction, "invoice_higher");
  assert.notEqual(explanation.likely_reason_code, "marketing_insert_rounding");
  assert.equal(explanation.likely_reason_code, "mixed_basket_unclear");
});

test("explainOrderMismatch uses mixed_basket_unclear when there is no single clear cause", () => {
  const explanation = explainOrderMismatch({
    reconciliation_status: "amount_mismatch",
    order_amount_value: 270,
    parsed_invoice_values: "273.50",
    invoice_rows: [
      {
        item_description: "Country Delight Buffalo Fresh Milk | Pouch 1 pack (450 ml)",
        line_total_amount: "138.00",
      },
      {
        item_description: "Zyro by Karan Aujla Hydration Drink | Zero Sugar | Lime & Lemon 1 pc (400 ml)",
        line_total_amount: "53.00",
      },
      {
        item_description: "Nurtiburst Serene Sleep Gummies With Melatonin 1 pack (10 pcs)",
        line_total_amount: "79.00",
      },
    ],
  });

  assert.equal(explanation.delta_amount, 3.5);
  assert.equal(explanation.delta_direction, "invoice_higher");
  assert.equal(explanation.likely_reason_code, "mixed_basket_unclear");
});

test("explainOrderMismatch avoids promo-pattern false positives inside unrelated words", () => {
  const explanation = explainOrderMismatch({
    reconciliation_status: "amount_mismatch",
    order_amount_value: 100,
    parsed_invoice_values: "101.01",
    invoice_rows: [
      {
        item_description: "Promoise Face Wash",
        line_total_amount: "1.01",
      },
      {
        item_description: "Daily Use Cleanser",
        line_total_amount: "100.00",
      },
    ],
  });

  assert.equal(explanation.delta_direction, "invoice_higher");
  assert.notEqual(explanation.likely_reason_code, "marketing_insert_rounding");
  assert.equal(explanation.likely_reason_code, "mixed_basket_unclear");
});

test("explainOrderMismatch does not overuse small_extra_item for an ambiguous cheap legitimate line item", () => {
  const explanation = explainOrderMismatch({
    reconciliation_status: "amount_mismatch",
    order_amount_value: 200,
    parsed_invoice_values: "201.00",
    invoice_rows: [
      {
        item_description: "Country Delight Buffalo Fresh Milk | Pouch 1 pack (450 ml)",
        line_total_amount: "138.00",
      },
      {
        item_description: "Brown Bread",
        line_total_amount: "61.00",
      },
      {
        item_description: "Carry Bag",
        line_total_amount: "1.00",
      },
    ],
  });

  assert.equal(explanation.delta_amount, 1);
  assert.equal(explanation.delta_direction, "invoice_higher");
  assert.notEqual(explanation.likely_reason_code, "small_extra_item");
  assert.equal(explanation.likely_reason_code, "mixed_basket_unclear");
});

test("explainOrderMismatch only uses small_extra_item for specific extra-charge style rows", () => {
  const explanation = explainOrderMismatch({
    reconciliation_status: "amount_mismatch",
    order_amount_value: 300,
    parsed_invoice_values: "301.50",
    invoice_rows: [
      {
        item_description: "Service Charge",
        line_total_amount: "1.50",
      },
    ],
  });

  assert.equal(explanation.delta_amount, 1.5);
  assert.equal(explanation.likely_reason_code, "small_extra_item");
  assert.deepEqual(explanation.evidence_items, ["Service Charge"]);
});

test("explainOrderMismatch does not use marketing_insert_rounding when the order amount is higher", () => {
  const explanation = explainOrderMismatch({
    reconciliation_status: "amount_mismatch",
    order_amount_value: 142.96,
    parsed_invoice_values: "141.95",
    invoice_rows: [
      {
        item_description: "Valentine's Day Flyer 1 pc",
        line_total_amount: "1.00",
      },
      {
        item_description: "Marlboro Advance Compact 1 pack (10 pcs)",
        line_total_amount: "95.00",
      },
    ],
  });

  assert.equal(explanation.delta_amount, 1.01);
  assert.equal(explanation.delta_direction, "order_higher");
  assert.notEqual(explanation.likely_reason_code, "marketing_insert_rounding");
  assert.equal(explanation.likely_reason_code, "mixed_basket_unclear");
});

test("explainOrderMismatch does not use rounding_or_tax_adjustment when the order amount is higher", () => {
  const explanation = explainOrderMismatch({
    reconciliation_status: "amount_mismatch",
    order_amount_value: 142.96,
    parsed_invoice_values: "141.95",
    invoice_rows: [
      {
        item_description: "Country Delight Buffalo Fresh Milk | Pouch 1 pack (450 ml)",
        line_total_amount: "138.00",
      },
      {
        item_description: "Tomato Hybrid 500 g",
        line_total_amount: "3.95",
      },
    ],
  });

  assert.equal(explanation.delta_amount, 1.01);
  assert.equal(explanation.delta_direction, "order_higher");
  assert.notEqual(explanation.likely_reason_code, "rounding_or_tax_adjustment");
  assert.equal(explanation.likely_reason_code, "mixed_basket_unclear");
});

test("explainOrderMismatch does not use small_extra_item when the order amount is higher", () => {
  const explanation = explainOrderMismatch({
    reconciliation_status: "amount_mismatch",
    order_amount_value: 201.01,
    parsed_invoice_values: "200.00",
    invoice_rows: [
      {
        item_description: "Staples Combo Pack",
        line_total_amount: "199.00",
      },
      {
        item_description: "Carry Bag",
        line_total_amount: "1.00",
      },
    ],
  });

  assert.equal(explanation.delta_amount, 1.01);
  assert.equal(explanation.delta_direction, "order_higher");
  assert.notEqual(explanation.likely_reason_code, "small_extra_item");
  assert.equal(explanation.likely_reason_code, "mixed_basket_unclear");
});
