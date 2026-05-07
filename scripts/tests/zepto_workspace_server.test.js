const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { createSyncManager } = require("../lib/zepto_sync_job");
const { createWorkspaceServer } = require("../serve_zepto_workspace");

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

async function waitForSyncStatus(baseUrl, expectedStatus) {
  const deadline = Date.now() + 5000;
  let latest;
  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/api/sync/status`);
    latest = await response.json();
    if (latest.status === expectedStatus) {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(`Timed out waiting for sync status ${expectedStatus}; latest=${JSON.stringify(latest)}`);
}

async function waitForManagerStatus(syncManager, expectedStatus) {
  const deadline = Date.now() + 5000;
  let latest;
  while (Date.now() < deadline) {
    latest = await syncManager.hydrateFromDisk();
    if (latest.status === expectedStatus) {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(`Timed out waiting for sync status ${expectedStatus}; latest=${JSON.stringify(latest)}`);
}

const EMPTY_SYNC_SUMMARY = {
  startedFrom: null,
  ordersDiscovered: 0,
  ordersConsidered: 0,
  ordersPending: 0,
  alreadyDownloaded: 0,
  downloaded: 0,
  missingButton: 0,
  noDownload: 0,
  errorCount: 0,
  htmlCaptured: 0,
  outputPaths: {},
};

async function makeFixtureWorkspace() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "zepto-workspace-"));
  const outputsDir = path.join(rootDir, "outputs");
  const invoicesDir = path.join(rootDir, "invoices");
  const htmlFallbackDir = path.join(outputsDir, "html_fallback");
  const webDir = path.join(rootDir, "web", "zepto-workspace");
  await fs.mkdir(outputsDir, { recursive: true });
  await fs.mkdir(invoicesDir, { recursive: true });
  await fs.mkdir(htmlFallbackDir, { recursive: true });
  await fs.mkdir(webDir, { recursive: true });

  await fs.writeFile(path.join(webDir, "index.html"), "<!doctype html><html><body>ok</body></html>");
  await fs.writeFile(path.join(webDir, "app.js"), "console.log('ok');");
  await fs.writeFile(path.join(webDir, "styles.css"), "body{}");
  await fs.writeFile(path.join(webDir, "api.js"), "export {};");
  await fs.writeFile(path.join(webDir, "render.js"), "export {};");
  await fs.writeFile(path.join(webDir, "state.js"), "export {};");

  await fs.writeFile(
    path.join(outputsDir, "zepto_reconciliation.json"),
    JSON.stringify({
      summary: {
        total_in_scope_orders: 1,
        data_capture_complete: true,
        dataset_complete: true,
        status_counts: { complete: 1 },
      },
      rows: [
        {
          order_id: "order-1",
          order_date_iso: "2026-05-04T21:09:00+05:30",
          order_amount_value: 212,
          order_status_text: "Order delivered",
          reconciliation_status: "complete",
          download_file: path.join(invoicesDir, "order-1.pdf"),
        },
      ],
    }),
  );
  await fs.writeFile(
    path.join(outputsDir, "zepto_orders_ledger.json"),
    JSON.stringify({ capturedAt: "2026-05-06T05:53:44.249Z", ordersDiscovered: 1, orders: [{ order_id: "order-1" }] }),
  );
  await fs.writeFile(
    path.join(outputsDir, "zepto_invoice_rows.json"),
    JSON.stringify([{ source_order_id: "order-1", source_file: "order-1.pdf", item_description: "Milk" }]),
  );
  await fs.writeFile(
    path.join(outputsDir, "zepto_html_fallbacks.json"),
    JSON.stringify([]),
  );
  await fs.writeFile(
    path.join(outputsDir, "zepto_download_summary.json"),
    JSON.stringify({ results: [{ order_id: "order-1", status: "already_downloaded" }] }),
  );
  await fs.writeFile(path.join(invoicesDir, "order-1.pdf"), "pdf");

  return rootDir;
}

test("workspace server exposes health, dataset, and annotation update endpoints", async () => {
  const fixtureRoot = await makeFixtureWorkspace();
  const server = createWorkspaceServer({ baseDir: fixtureRoot });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const healthResponse = await fetch(`${baseUrl}/api/health`);
    const health = await healthResponse.json();
    assert.equal(health.ok, true);

    const appRouteResponse = await fetch(`${baseUrl}/workbench`);
    assert.equal(appRouteResponse.status, 200);
    assert.match(await appRouteResponse.text(), /<html><body>ok<\/body><\/html>/);

    const missingApiResponse = await fetch(`${baseUrl}/api/does-not-exist`);
    assert.equal(missingApiResponse.status, 404);
    assert.deepEqual(await missingApiResponse.json(), { error: "Not found" });

    const ordersResponse = await fetch(`${baseUrl}/api/orders`);
    const orders = await ordersResponse.json();
    assert.equal(orders.length, 1);
    assert.equal(orders[0].order_id, "order-1");

    const datasetResponse = await fetch(`${baseUrl}/api/dataset`);
    const dataset = await datasetResponse.json();
    assert.ok(Array.isArray(dataset.lineItems));
    assert.ok(dataset.lineItems.length >= 1);
    assert.equal(dataset.lineItems[0].order_id, "order-1");
    assert.equal(dataset.lineItems[0].item_description, "Milk");
    assert.equal(dataset.lineItems[0].line_item_key, "order-1::::0");

    const saveResponse = await fetch(`${baseUrl}/api/annotations/order-1`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ split_type: "shared" }),
    });
    const saved = await saveResponse.json();
    assert.equal(saved.annotation.split_type, "shared");

    const orderResponse = await fetch(`${baseUrl}/api/orders/order-1`);
    const orderDetail = await orderResponse.json();
    assert.equal(orderDetail.annotations.split_type, "shared");

    const lineSaveResponse = await fetch(`${baseUrl}/api/line-item-annotations/${encodeURIComponent("order-1::::0")}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expense_category: "personal", notes: "line-only tag" }),
    });
    const lineSaved = await lineSaveResponse.json();
    assert.equal(lineSaved.ok, true);
    assert.equal(lineSaved.annotation.expense_category, "personal");
    assert.equal(lineSaved.lineItem.line_item_key, "order-1::::0");
    assert.equal(lineSaved.lineItem.effective_category, "personal");
    assert.equal(lineSaved.lineItem.notes, "line-only tag");
    assert.equal(lineSaved.lineItem.split_tag_source, "line_item");
  } finally {
    await closeServer(server);
  }
});

test("workspace server runs sync workflow and exposes normalized status and logs", async () => {
  const fixtureRoot = await makeFixtureWorkspace();
  const workflowScript = path.join(fixtureRoot, "fake_sync_workflow.js");
  await fs.writeFile(
    workflowScript,
    `
const fs = require("node:fs/promises");
const path = require("node:path");

async function main() {
  console.log("fake workflow stdout line");
  console.error("fake workflow stderr line");
  await fs.writeFile(
    path.join(process.cwd(), "outputs", "zepto_download_summary.json"),
    JSON.stringify({
      startedFrom: "order-1",
      ordersDiscovered: 5,
      outputPaths: { invoices: "invoices", summary: "outputs/zepto_download_summary.json" },
      results: [
        { order_id: "order-1", status: "already_downloaded" },
        { order_id: "order-2", status: "downloaded", htmlCaptured: true },
        { order_id: "order-3", status: "missing_button" },
        { order_id: "order-4", status: "no_download" },
        { order_id: "order-5", status: "error" }
      ]
    })
  );
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
`,
  );

  const server = createWorkspaceServer({ baseDir: fixtureRoot, workflowScript });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const startResponse = await fetch(`${baseUrl}/api/sync/start`, { method: "POST" });
    assert.equal(startResponse.status, 202);
    const started = await startResponse.json();
    assert.equal(started.status, "running");
    assert.ok(started.id);
    assert.equal(started.id, started.startedAt);

    const status = await waitForSyncStatus(baseUrl, "succeeded");
    assert.equal(status.id, status.startedAt);
    assert.equal(status.summary.startedFrom, "order-1");
    assert.equal(status.summary.ordersDiscovered, 5);
    assert.equal(status.summary.ordersConsidered, 5);
    assert.equal(status.summary.ordersPending, 4);
    assert.equal(status.summary.alreadyDownloaded, 1);
    assert.equal(status.summary.downloaded, 1);
    assert.equal(status.summary.missingButton, 1);
    assert.equal(status.summary.noDownload, 1);
    assert.equal(status.summary.errorCount, 1);
    assert.equal(status.summary.htmlCaptured, 1);
    assert.deepEqual(status.summary.outputPaths, { invoices: "invoices", summary: "outputs/zepto_download_summary.json" });
    assert.ok(status.lastSuccessfulSyncAt);

    const logsResponse = await fetch(`${baseUrl}/api/sync/logs`);
    const logs = await logsResponse.json();
    assert.ok(logs.lines.some((line) => line.stream === "stdout" && line.message.includes("fake workflow stdout line")));
    assert.ok(logs.lines.some((line) => line.stream === "stderr" && line.message.includes("fake workflow stderr line")));
  } finally {
    await closeServer(server);
  }
});

test("workspace server rejects duplicate sync starts while running", async () => {
  const fixtureRoot = await makeFixtureWorkspace();
  const workflowScript = path.join(fixtureRoot, "slow_fake_sync_workflow.js");
  await fs.writeFile(
    workflowScript,
    `
const fs = require("node:fs/promises");
const path = require("node:path");

async function main() {
  console.log("slow workflow started");
  await new Promise((resolve) => setTimeout(resolve, 500));
  await fs.writeFile(
    path.join(process.cwd(), "outputs", "zepto_download_summary.json"),
    JSON.stringify({ results: [{ order_id: "order-1", status: "downloaded" }] })
  );
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
`,
  );

  const server = createWorkspaceServer({ baseDir: fixtureRoot, workflowScript });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const firstResponse = await fetch(`${baseUrl}/api/sync/start`, { method: "POST" });
    assert.equal(firstResponse.status, 202);

    const secondResponse = await fetch(`${baseUrl}/api/sync/start`, { method: "POST" });
    assert.equal(secondResponse.status, 409);
    const duplicate = await secondResponse.json();
    assert.equal(duplicate.status.status, "running");

    await waitForSyncStatus(baseUrl, "succeeded");
  } finally {
    await closeServer(server);
  }
});

test("sync manager rejects concurrent starts before async setup completes", async () => {
  const fixtureRoot = await makeFixtureWorkspace();
  const workflowScript = path.join(fixtureRoot, "concurrent_fake_sync_workflow.js");
  await fs.writeFile(
    workflowScript,
    `
const fs = require("node:fs/promises");
const path = require("node:path");

async function main() {
  await new Promise((resolve) => setTimeout(resolve, 200));
  await fs.writeFile(
    path.join(process.cwd(), "outputs", "zepto_download_summary.json"),
    JSON.stringify({ results: [{ order_id: "order-1", status: "downloaded" }] })
  );
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
`,
  );

  const syncManager = createSyncManager({ baseDir: fixtureRoot, workflowScript });
  const firstStart = syncManager.startSync();
  const secondStartRejected = assert.rejects(syncManager.startSync(), (error) => {
    assert.equal(error.code, "SYNC_ALREADY_RUNNING");
    assert.equal(error.status.status, "running");
    return true;
  });

  await firstStart;
  await secondStartRejected;
  await waitForManagerStatus(syncManager, "succeeded");
});

test("sync manager marks persisted running status as interrupted after restart", async () => {
  const fixtureRoot = await makeFixtureWorkspace();
  const workflowScript = path.join(fixtureRoot, "restart_fake_sync_workflow.js");
  await fs.writeFile(
    path.join(fixtureRoot, "outputs", "zepto_sync_status.json"),
    JSON.stringify({
      status: "running",
      startedAt: "2026-05-06T09:00:00.000Z",
      finishedAt: null,
      exitCode: null,
      error: null,
      summary: {
        results: [
          { order_id: "order-1", status: "already_downloaded" },
          { order_id: "order-2", status: "downloaded" },
        ],
      },
      lastSuccessfulSyncAt: "2026-05-05T09:00:00.000Z",
    }),
  );
  await fs.writeFile(
    workflowScript,
    `
const fs = require("node:fs/promises");
const path = require("node:path");

async function main() {
  await fs.writeFile(
    path.join(process.cwd(), "outputs", "zepto_download_summary.json"),
    JSON.stringify({ results: [{ order_id: "order-1", status: "downloaded" }] })
  );
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
`,
  );

  const syncManager = createSyncManager({ baseDir: fixtureRoot, workflowScript });

  const restartedStatus = await syncManager.hydrateFromDisk();
  assert.equal(restartedStatus.status, "failed");
  assert.equal(restartedStatus.id, "2026-05-06T09:00:00.000Z");
  assert.equal(restartedStatus.startedAt, "2026-05-06T09:00:00.000Z");
  assert.match(restartedStatus.error, /interrupted/i);
  assert.equal(restartedStatus.summary.ordersConsidered, 2);
  assert.equal(restartedStatus.summary.alreadyDownloaded, 1);
  assert.equal(restartedStatus.summary.downloaded, 1);
  assert.equal(restartedStatus.lastSuccessfulSyncAt, "2026-05-05T09:00:00.000Z");

  const started = await syncManager.startSync();
  assert.equal(started.status, "running");
  await waitForManagerStatus(syncManager, "succeeded");
});

test("workspace server clears stale download summary at sync start", async () => {
  const fixtureRoot = await makeFixtureWorkspace();
  const workflowScript = path.join(fixtureRoot, "no_summary_sync_workflow.js");
  await fs.writeFile(
    workflowScript,
    `
async function main() {
  console.log("workflow intentionally wrote no summary");
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
`,
  );

  const server = createWorkspaceServer({ baseDir: fixtureRoot, workflowScript });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const startResponse = await fetch(`${baseUrl}/api/sync/start`, { method: "POST" });
    assert.equal(startResponse.status, 202);

    const status = await waitForSyncStatus(baseUrl, "succeeded");
    assert.deepEqual(status.summary, EMPTY_SYNC_SUMMARY);
  } finally {
    await closeServer(server);
  }
});

test("workspace server treats code-zero sync as succeeded when summary cannot be parsed", async () => {
  const fixtureRoot = await makeFixtureWorkspace();
  const workflowScript = path.join(fixtureRoot, "invalid_summary_sync_workflow.js");
  await fs.writeFile(
    workflowScript,
    `
const fs = require("node:fs/promises");
const path = require("node:path");

async function main() {
  console.log("invalid summary workflow completed");
  await fs.writeFile(path.join(process.cwd(), "outputs", "zepto_download_summary.json"), "{not valid json");
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
`,
  );

  const server = createWorkspaceServer({ baseDir: fixtureRoot, workflowScript });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const startResponse = await fetch(`${baseUrl}/api/sync/start`, { method: "POST" });
    assert.equal(startResponse.status, 202);

    const status = await waitForSyncStatus(baseUrl, "succeeded");
    assert.equal(status.exitCode, 0);
    assert.ok(status.lastSuccessfulSyncAt);
    assert.deepEqual(status.summary, EMPTY_SYNC_SUMMARY);
    assert.match(status.error, /Expected property name|JSON/i);

    const logsResponse = await fetch(`${baseUrl}/api/sync/logs`);
    const logs = await logsResponse.json();
    assert.ok(logs.lines.some((line) => line.stream === "stderr" && line.message.includes("Failed to read sync summary")));
  } finally {
    await closeServer(server);
  }
});
