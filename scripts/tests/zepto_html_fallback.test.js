const test = require("node:test");
const assert = require("node:assert/strict");

const { buildHtmlFallbackRecord } = require("../lib/zepto_html_fallback");

test("buildHtmlFallbackRecord extracts useful sections from order-page text", () => {
  const record = buildHtmlFallbackRecord({
    order: {
      order_id: "order-1",
      order_url: "https://www.zepto.com/order/order-1?isArchived=false",
      order_date_iso: "2026-04-15T23:16:00+05:30",
      order_amount_display: "467",
      order_status_text: "Order cancelled",
    },
    pageState: {
      bodyText:
        "Order #JLOKOVNWR58336 4 items Cancelled Unfortunately, your order could not be completed. " +
        "4 items in order Country Delight Buffalo Fresh Milk 3 units Rs 138 Rs 177 Coca-Cola Diet Coke 4 units Rs 152 Rs 160 " +
        "Bill Summary Item Total Rs 562 Rs 467 Delivery Fee Rs 30 FREE Handling Fee Rs 10 FREE Late Night Fee Rs 35 FREE Total Bill Rs 637 Rs 467 " +
        "Order Details Order ID #JLOKOVNWR58336 Receiver Details tejaswa sharma, +91 9350932084 Delivery Address First Floor, 934, I Block " +
        "Order Placed at 15 Apr 2026, 11:16 PM Order Again",
      buttonTexts: ["Bill Summary", "Order Again"],
      hasBillSummary: true,
      hasOrderDetails: true,
      hasDownloadButton: false,
      ready: true,
    },
    htmlPath: "C:\\tmp\\order-1.html",
    jsonPath: "C:\\tmp\\order-1.json",
  });

  assert.equal(record.order_id, "order-1");
  assert.equal(record.html_capture_status, "captured");
  assert.equal(record.html_order_number, "JLOKOVNWR58336");
  assert.match(record.html_items_text, /Country Delight Buffalo Fresh Milk/i);
  assert.match(record.html_bill_summary_text, /Total Bill/i);
  assert.match(record.html_delivery_address_text, /First Floor/i);
  assert.equal(record.html_html_path, "C:\\tmp\\order-1.html");
});
