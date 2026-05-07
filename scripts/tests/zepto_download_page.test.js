const test = require("node:test");
const assert = require("node:assert/strict");

const { waitForOrderDetailReady } = require("../lib/zepto_download_page");

function createFakePage(states) {
  let index = 0;
  return {
    evaluate: async () => {
      const state = states[Math.min(index, states.length - 1)];
      return state;
    },
    waitForTimeout: async () => {
      index += 1;
    },
  };
}

test("waitForOrderDetailReady waits for archived delivered pages to hydrate", async () => {
  const page = createFakePage([
    { bodyText: "Select Location Cart Log Out", buttonTexts: ["Log Out"] },
    { bodyText: "Select Location Cart Log Out Order Again", buttonTexts: ["Order Again"] },
    {
      bodyText: "Bill Summary Total Bill Download Invoice / Credit Note Order Details",
      buttonTexts: ["Bill Summary", "Download Invoice / Credit Note", "Order Again"],
    },
  ]);

  const result = await waitForOrderDetailReady(page, { timeoutMs: 2000, pollMs: 10 });

  assert.equal(result.ready, true);
  assert.equal(result.hasBillSummary, true);
  assert.equal(result.hasDownloadButton, true);
});

test("waitForOrderDetailReady returns once cancelled order details are present", async () => {
  const page = createFakePage([
    {
      bodyText: "Bill Summary Total Bill Order Details Unfortunately, your order could not be completed",
      buttonTexts: ["Bill Summary", "Order Again"],
    },
  ]);

  const result = await waitForOrderDetailReady(page, { timeoutMs: 2000, pollMs: 10 });

  assert.equal(result.ready, true);
  assert.equal(result.hasBillSummary, true);
  assert.equal(result.hasDownloadButton, false);
});

test("waitForOrderDetailReady returns false when page never hydrates", async () => {
  const page = createFakePage([
    { bodyText: "Select Location Cart", buttonTexts: ["Cart"] },
  ]);

  const result = await waitForOrderDetailReady(page, { timeoutMs: 40, pollMs: 10 });

  assert.equal(result.ready, false);
  assert.equal(result.hasBillSummary, false);
});
