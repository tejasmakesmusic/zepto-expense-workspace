const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseOrderCardText,
  sourceOrderIdFromFileName,
} = require("../lib/zepto_workflow_utils");

test("parseOrderCardText extracts delivered order fields", () => {
  const parsed = parseOrderCardText(
    "Order delivered Placed at 4th May 2026, 09:09 pm ₹212 Rate your order",
    "https://www.zepto.com/order/019df3a4-9f8b-7fdd-bb36-98bd70326b15?isArchived=false",
    new Date("2026-02-01T00:00:00+05:30"),
  );

  assert.equal(parsed.order_id, "019df3a4-9f8b-7fdd-bb36-98bd70326b15");
  assert.equal(parsed.order_status_text, "Order delivered");
  assert.equal(parsed.order_amount_display, "212");
  assert.equal(parsed.order_amount_value, 212);
  assert.equal(parsed.order_date_iso.slice(0, 10), "2026-05-04");
  assert.equal(parsed.in_scope_from_start_date, true);
});

test("parseOrderCardText extracts cancelled order fields", () => {
  const parsed = parseOrderCardText(
    "Order cancelled Placed at 20th Feb 2026, 01:54 am ₹152 REFUND COMPLETED",
    "https://www.zepto.com/order/019c7793-779d-71c7-809c-09e886c02e08?isArchived=false",
    new Date("2026-02-01T00:00:00+05:30"),
  );

  assert.equal(parsed.order_id, "019c7793-779d-71c7-809c-09e886c02e08");
  assert.equal(parsed.order_status_text, "Order cancelled");
  assert.equal(parsed.order_amount_display, "152");
  assert.equal(parsed.order_amount_value, 152);
  assert.equal(parsed.order_date_iso.slice(0, 10), "2026-02-20");
  assert.equal(parsed.in_scope_from_start_date, true);
});

test("sourceOrderIdFromFileName returns the prefixed Zepto order id", () => {
  const sourceOrderId = sourceOrderIdFromFileName(
    "019df3a4-9f8b-7fdd-bb36-98bd70326b15-088812e8-be18-407d-8398-9f13c5a6e3b1-order-invoice-019df3a4-9f8c-7c3c-bd0b-d3565ea2f5db.pdf",
  );

  assert.equal(sourceOrderId, "019df3a4-9f8b-7fdd-bb36-98bd70326b15");
});
