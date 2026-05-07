function normalizeWhitespace(text = "") {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

async function getOrderPageState(page) {
  const snapshot = await page.evaluate(() => ({
    bodyText: document.body?.innerText || "",
    buttonTexts: [...document.querySelectorAll("button")].map((el) => el.innerText || ""),
  }));

  const bodyText = normalizeWhitespace(snapshot.bodyText);
  const buttonTexts = snapshot.buttonTexts.map((text) => normalizeWhitespace(text)).filter(Boolean);
  const hasDownloadButton = buttonTexts.some((text) => /download invoice \/ credit note/i.test(text));
  const hasBillSummary = /bill summary/i.test(bodyText) || buttonTexts.some((text) => /bill summary/i.test(text));
  const hasOrderDetails = /order details/i.test(bodyText);

  return {
    bodyText,
    buttonTexts,
    hasDownloadButton,
    hasBillSummary,
    hasOrderDetails,
    ready: hasDownloadButton || hasBillSummary || hasOrderDetails,
  };
}

async function waitForOrderDetailReady(page, options = {}) {
  const timeoutMs = options.timeoutMs ?? 12000;
  const pollMs = options.pollMs ?? 500;
  const start = Date.now();
  let lastState = {
    bodyText: "",
    buttonTexts: [],
    hasDownloadButton: false,
    hasBillSummary: false,
    hasOrderDetails: false,
    ready: false,
  };

  while (Date.now() - start <= timeoutMs) {
    lastState = await getOrderPageState(page);
    if (lastState.ready) {
      return lastState;
    }
    await page.waitForTimeout(pollMs);
  }

  return lastState;
}

module.exports = {
  getOrderPageState,
  waitForOrderDetailReady,
};
