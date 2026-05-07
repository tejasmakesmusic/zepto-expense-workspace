const fs = require("fs/promises");
const path = require("path");
const { chromium } = require("playwright");
const {
  sanitizeFilename,
  orderIdFromHref,
  sourceOrderIdFromFileName,
  parseOrderDate,
  parseOrderCardText,
  toCsv,
} = require("./lib/zepto_workflow_utils");
const { waitForOrderDetailReady } = require("./lib/zepto_download_page");
const {
  buildHtmlFallbackRecord,
  htmlFallbackRowsToCsv,
} = require("./lib/zepto_html_fallback");

const ROOT = path.resolve(__dirname, "..");
const BASE_URL = "https://www.zepto.com";
const ORDERS_URL = `${BASE_URL}/account/orders`;
const PROFILE_DIR = path.join(ROOT, "work", "playwright-zepto-profile");
const INVOICES_DIR = path.join(ROOT, "invoices");
const OUTPUTS_DIR = path.join(ROOT, "outputs");
const SUMMARY_PATH = path.join(OUTPUTS_DIR, "zepto_download_summary.json");
const LEDGER_JSON_PATH = path.join(OUTPUTS_DIR, "zepto_orders_ledger.json");
const LEDGER_CSV_PATH = path.join(OUTPUTS_DIR, "zepto_orders_ledger.csv");
const HTML_FALLBACK_DIR = path.join(OUTPUTS_DIR, "html_fallback");
const HTML_FALLBACK_JSON_PATH = path.join(OUTPUTS_DIR, "zepto_html_fallbacks.json");
const HTML_FALLBACK_CSV_PATH = path.join(OUTPUTS_DIR, "zepto_html_fallbacks.csv");
const START_DATE = new Date("2026-02-01T00:00:00+05:30");

function log(message, extra) {
  const prefix = `[${new Date().toISOString()}] ${message}`;
  if (extra) {
    console.log(`${prefix} ${JSON.stringify(extra)}`);
  } else {
    console.log(prefix);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureUniquePath(filePath) {
  const parsed = path.parse(filePath);
  let attempt = 0;
  let candidate = filePath;
  while (true) {
    try {
      await fs.access(candidate);
      attempt += 1;
      candidate = path.join(parsed.dir, `${parsed.name}-${attempt}${parsed.ext}`);
    } catch {
      return candidate;
    }
  }
}

async function waitForOrdersUi(page, timeoutMs) {
  log("Chrome window opened. Log into Zepto there if prompted.");
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const hrefCount = await page.locator('a[href^="/order/"], a[href*="/order/"]').count().catch(() => 0);
    const deliveredCount = await page.getByText("Order delivered").count().catch(() => 0);
    const onOrderPage = page.url().includes("/order/");
    if (hrefCount > 0 || deliveredCount > 0 || onOrderPage) {
      log("Detected Zepto order UI", {
        url: page.url(),
        hrefCount,
        deliveredCount,
      });
      return true;
    }
    await sleep(2000);
  }
  return false;
}

async function writeOrderLedger(orders, totalDiscovered) {
  const payload = {
    startedFrom: START_DATE.toISOString(),
    capturedAt: new Date().toISOString(),
    ordersDiscovered: totalDiscovered,
    ordersInScope: orders.length,
    orders,
  };
  const headers = [
    "order_id",
    "order_url",
    "order_date_iso",
    "order_amount_display",
    "order_amount_value",
    "order_status_text",
    "order_card_text",
    "in_scope_from_start_date",
  ];

  await fs.writeFile(LEDGER_JSON_PATH, JSON.stringify(payload, null, 2), "utf8");
  await fs.writeFile(LEDGER_CSV_PATH, toCsv(headers, orders), "utf8");
}

async function collectOrderLinks(page) {
  log("Collecting order links from the orders page");
  await page.goto(ORDERS_URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await sleep(3000);

  const seen = new Map();
  let stablePasses = 0;
  let reachedStartDate = false;

  for (let pass = 0; pass < 80; pass += 1) {
    const result = await page.evaluate(() => {
      const selector = 'a[href^="/order/"], a[href*="/order/"]';

      let scroller = document.querySelector("[data-codex-orders-scroller='1']");
      if (!scroller) {
        const candidates = [...document.querySelectorAll("*")].filter((el) => {
          const style = window.getComputedStyle(el);
          return /(auto|scroll)/.test(style.overflowY || "") &&
            el.scrollHeight > el.clientHeight + 120 &&
            el.querySelector(selector);
        });
        candidates.sort((a, b) => {
          const linkDiff = b.querySelectorAll(selector).length - a.querySelectorAll(selector).length;
          if (linkDiff !== 0) {
            return linkDiff;
          }
          return b.scrollHeight - a.scrollHeight;
        });
        scroller = candidates[0] || null;
        if (scroller) {
          scroller.setAttribute("data-codex-orders-scroller", "1");
        }
      }

      const links = [...document.querySelectorAll(selector)].map((anchor) => ({
        href: anchor.href || anchor.getAttribute("href") || "",
        text: (anchor.innerText || anchor.textContent || "").replace(/\s+/g, " ").trim(),
      })).filter((item) => item.href);

      const target = scroller || document.scrollingElement || document.documentElement;
      const before = target ? target.scrollTop || 0 : 0;
      const max = target ? target.scrollHeight || 0 : 0;
      const client = target ? target.clientHeight || 0 : 0;
      if (target) {
        target.scrollTop = Math.min(max, before + Math.max(400, client * 0.9));
      }
      const after = target ? target.scrollTop || 0 : before;

      return {
        links,
        before,
        after,
        max,
        client,
        hasLoadMore: [...document.querySelectorAll("*")].some((el) =>
          (el.innerText || "").trim() === "Load More"
        ),
      };
    });

    let added = 0;
    for (const link of result.links) {
      const href = link.href.startsWith("http") ? link.href : new URL(link.href, BASE_URL).toString();
      const parsed = parseOrderCardText(link.text, href, START_DATE);
      if (!seen.has(href)) {
        seen.set(href, parsed);
        added += 1;
      } else if (link.text && link.text.length > (seen.get(href)?.order_card_text || "").length) {
        seen.set(href, parsed);
      }
    }

    const collectedDates = [...seen.values()]
      .map((order) => (order.order_date_iso ? new Date(order.order_date_iso) : null))
      .filter(Boolean)
      .sort((a, b) => a - b);
    const earliest = collectedDates[0] || null;
    if (earliest && earliest < START_DATE) {
      reachedStartDate = true;
    }

    log("Order scroll pass", {
      pass: pass + 1,
      visibleLinks: result.links.length,
      collected: seen.size,
      added,
      earliest: earliest ? earliest.toISOString().slice(0, 10) : null,
      hasLoadMore: result.hasLoadMore,
    });

    const loadMore = page.getByText("Load More", { exact: true });
    if (await loadMore.isVisible().catch(() => false)) {
      await loadMore.scrollIntoViewIfNeeded().catch(() => {});
      await sleep(400);
      await loadMore.click({ timeout: 5000 }).catch(() => {});
      await sleep(2500);
      stablePasses = 0;
      continue;
    }

    const atBottom = result.after + result.client + 20 >= result.max;
    const noMovement = Math.abs(result.after - result.before) < 5;
    if (added === 0 && (atBottom || noMovement)) {
      stablePasses += 1;
    } else {
      stablePasses = 0;
    }

    if (reachedStartDate && stablePasses >= 2) {
      break;
    }
    if (stablePasses >= 4) {
      break;
    }

    await sleep(1200);
  }

  const orders = [...seen.values()];
  const filtered = orders.filter((order) => order.in_scope_from_start_date !== false);
  filtered.sort((a, b) => {
    const aTime = a.order_date_iso ? new Date(a.order_date_iso).getTime() : 0;
    const bTime = b.order_date_iso ? new Date(b.order_date_iso).getTime() : 0;
    return bTime - aTime;
  });

  log("Collected candidate orders", {
    total: orders.length,
    fromStartDate: filtered.length,
  });
  await writeOrderLedger(filtered, orders.length);
  return { allOrders: orders, inScopeOrders: filtered };
}

async function findDownloadButton(page) {
  const candidates = [
    page.locator('button:has-text("Download Invoice / Credit Note")'),
    page.locator('text=Download Invoice / Credit Note').locator("xpath=ancestor::button[1]"),
  ];

  for (const locator of candidates) {
    const count = await locator.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      const visible = await candidate.isVisible().catch(() => false);
      if (visible) {
        return candidate;
      }
    }
  }
  return null;
}

async function tryBottomSheetDownload(page) {
  const invoiceButton = page.locator('button:has-text("Invoice"), button:has-text("invoice")');
  const buttonCount = await invoiceButton.count().catch(() => 0);
  for (let index = 0; index < buttonCount; index += 1) {
    const button = invoiceButton.nth(index);
    const text = await button.innerText().catch(() => "");
    if (!/download invoice \/ credit note/i.test(text)) {
      const visible = await button.isVisible().catch(() => false);
      if (visible) {
        const downloadPromise = page.waitForEvent("download", { timeout: 10000 }).catch(() => null);
        await button.click({ timeout: 5000 }).catch(() => {});
        const download = await downloadPromise;
        if (download) {
          return download;
        }
      }
    }
  }
  return null;
}

async function captureHtmlFallback(page, order, pageState) {
  const orderId = orderIdFromHref(order.order_url, order.order_id || "unknown-order");
  const htmlPath = path.join(HTML_FALLBACK_DIR, `${orderId}-order-page.html`);
  const jsonPath = path.join(HTML_FALLBACK_DIR, `${orderId}-order-page.json`);
  const pageHtml = await page.content().catch(() => "");
  const record = buildHtmlFallbackRecord({
    order,
    pageState,
    htmlPath,
    jsonPath,
  });

  await fs.mkdir(HTML_FALLBACK_DIR, { recursive: true });
  await fs.writeFile(htmlPath, pageHtml, "utf8");
  await fs.writeFile(jsonPath, JSON.stringify(record, null, 2), "utf8");
  return record;
}

async function downloadOrderInvoice(page, order, index) {
  log("Opening order", {
    index: index + 1,
    href: order.order_url,
    text: order.order_card_text,
  });

  try {
    await page.goto(order.order_url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    const pageState = await waitForOrderDetailReady(page, { timeoutMs: 12000, pollMs: 500 });
    log("Order page readiness", {
      order_id: order.order_id,
      ready: pageState.ready,
      hasBillSummary: pageState.hasBillSummary,
      hasOrderDetails: pageState.hasOrderDetails,
      hasDownloadButton: pageState.hasDownloadButton,
    });

    const button = await findDownloadButton(page);
    if (!button) {
      const htmlFallback = await captureHtmlFallback(page, order, pageState);
      return {
        order_id: order.order_id,
        href: order.order_url,
        order_url: order.order_url,
        text: order.order_card_text,
        order_date_iso: order.order_date_iso,
        order_amount_display: order.order_amount_display,
        status: "missing_button",
        ...htmlFallback,
      };
    }

    const downloadPromise = page.waitForEvent("download", { timeout: 12000 }).catch(() => null);
    await button.click({ timeout: 5000 }).catch(() => {});
    let download = await downloadPromise;

    if (!download) {
      download = await tryBottomSheetDownload(page);
    }

    if (!download) {
      const htmlFallback = await captureHtmlFallback(page, order, pageState);
      return {
        order_id: order.order_id,
        href: order.order_url,
        order_url: order.order_url,
        text: order.order_card_text,
        order_date_iso: order.order_date_iso,
        order_amount_display: order.order_amount_display,
        status: "no_download",
        ...htmlFallback,
      };
    }

    const orderId = orderIdFromHref(order.order_url, `order-${index + 1}`);
    const suggested = sanitizeFilename(download.suggestedFilename() || `${orderId}.pdf`);
    const fileName = suggested.toLowerCase().endsWith(".pdf") ? `${orderId}-${suggested}` : `${orderId}-${suggested}.pdf`;
    const destination = await ensureUniquePath(path.join(INVOICES_DIR, fileName));
    await download.saveAs(destination);

    log("Saved invoice", {
      orderId,
      file: destination,
    });

    await sleep(1000);
    return {
      order_id: order.order_id,
      href: order.order_url,
      order_url: order.order_url,
      text: order.order_card_text,
      order_date_iso: order.order_date_iso,
      order_amount_display: order.order_amount_display,
      status: "downloaded",
      file: destination,
    };
  } catch (error) {
    return {
      order_id: order.order_id,
      href: order.order_url,
      order_url: order.order_url,
      text: order.order_card_text,
      order_date_iso: order.order_date_iso,
      order_amount_display: order.order_amount_display,
      status: "error",
      error: String(error && error.message ? error.message : error),
    };
  }
}

async function main() {
  await fs.mkdir(PROFILE_DIR, { recursive: true });
  await fs.mkdir(INVOICES_DIR, { recursive: true });
  await fs.mkdir(OUTPUTS_DIR, { recursive: true });
  await fs.mkdir(HTML_FALLBACK_DIR, { recursive: true });

  const existingFiles = await fs.readdir(INVOICES_DIR).catch(() => []);
  const existingFilesByOrderId = new Map();
  for (const name of existingFiles) {
    const orderId = sourceOrderIdFromFileName(name);
    if (!orderId) {
      continue;
    }
    const matches = existingFilesByOrderId.get(orderId) || [];
    matches.push(path.join(INVOICES_DIR, name));
    existingFilesByOrderId.set(orderId, matches);
  }

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: "chrome",
    headless: false,
    acceptDownloads: true,
    viewport: { width: 1280, height: 1000 },
  });

  try {
    const page = context.pages()[0] || await context.newPage();
    await page.goto(ORDERS_URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});

    const ready = await waitForOrdersUi(page, 10 * 60 * 1000);
    if (!ready) {
      throw new Error("Timed out waiting for the Zepto orders UI. Log into the Playwright Chrome window and retry.");
    }

    const { allOrders, inScopeOrders } = await collectOrderLinks(page);
    const pendingOrders = inScopeOrders.filter((order) => !existingFilesByOrderId.has(order.order_id));
    log("Orders pending download after existing-file check", {
      total: inScopeOrders.length,
      pending: pendingOrders.length,
    });

    const results = [];
    for (const order of inScopeOrders) {
      const existingMatches = existingFilesByOrderId.get(order.order_id);
      if (existingMatches && existingMatches.length > 0) {
        results.push({
          order_id: order.order_id,
          href: order.order_url,
          order_url: order.order_url,
          text: order.order_card_text,
          order_date_iso: order.order_date_iso,
          order_amount_display: order.order_amount_display,
          status: "already_downloaded",
          file: existingMatches[0],
        });
        continue;
      }
      const result = await downloadOrderInvoice(page, order, results.length);
      results.push(result);
    }

    const summary = {
      startedFrom: START_DATE.toISOString(),
      ordersDiscovered: allOrders.length,
      ordersConsidered: inScopeOrders.length,
      ordersPending: pendingOrders.length,
      alreadyDownloaded: results.filter((item) => item.status === "already_downloaded").length,
      downloaded: results.filter((item) => item.status === "downloaded").length,
      missingButton: results.filter((item) => item.status === "missing_button").length,
      noDownload: results.filter((item) => item.status === "no_download").length,
      errorCount: results.filter((item) => item.status === "error").length,
      htmlCaptured: results.filter((item) => item.html_capture_status === "captured").length,
      orderLedgerJson: LEDGER_JSON_PATH,
      orderLedgerCsv: LEDGER_CSV_PATH,
      htmlFallbackJson: HTML_FALLBACK_JSON_PATH,
      htmlFallbackCsv: HTML_FALLBACK_CSV_PATH,
      results,
    };
    const htmlFallbackRows = results.filter((item) => item.html_capture_status === "captured");
    await fs.writeFile(HTML_FALLBACK_JSON_PATH, JSON.stringify(htmlFallbackRows, null, 2), "utf8");
    await fs.writeFile(HTML_FALLBACK_CSV_PATH, htmlFallbackRowsToCsv(htmlFallbackRows), "utf8");
    await fs.writeFile(SUMMARY_PATH, JSON.stringify(summary, null, 2), "utf8");
    log("Download run completed", summary);
  } finally {
    await context.close();
  }
}

main().catch(async (error) => {
  log("Invoice download automation failed", { error: String(error && error.message ? error.message : error) });
  process.exitCode = 1;
});
