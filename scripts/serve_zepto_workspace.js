const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { URL } = require("node:url");

const { loadWorkspaceDataset } = require("./lib/zepto_workspace_data");
const { readAnnotations, writeOrderAnnotation, writeLineItemAnnotation } = require("./lib/zepto_review_annotations");
const { createSyncManager } = require("./lib/zepto_sync_job");
const {
  publicSettings,
  readAiSettings,
  runAiAction,
  testAiSettings,
  writeAiSettings,
} = require("./lib/zepto_ai_assistant");

function json(res, statusCode, payload) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function notFound(res) {
  json(res, 404, { error: "Not found" });
}

function badRequest(res, message) {
  json(res, 400, { error: message });
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".pdf":
      return "application/pdf";
    case ".csv":
      return "text/csv; charset=utf-8";
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    default:
      return "application/octet-stream";
  }
}

function getProjectPaths(baseDir) {
  return {
    baseDir,
    outputsDir: path.join(baseDir, "outputs"),
    webDir: path.join(baseDir, "web", "zepto-workspace"),
    annotationsPath: path.join(baseDir, "outputs", "zepto_review_annotations.json"),
  };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function resolveSafeWorkspacePath(baseDir, relativePath) {
  const decodedPath = decodeURIComponent(relativePath || "");
  const normalized = decodedPath.replace(/\//g, path.sep);
  const absolutePath = path.resolve(baseDir, normalized);
  const relativeToBase = path.relative(baseDir, absolutePath);
  if (relativeToBase.startsWith("..") || path.isAbsolute(relativeToBase)) {
    return "";
  }
  return absolutePath;
}

async function serveFile(res, filePath) {
  try {
    await fsp.access(filePath);
  } catch {
    notFound(res);
    return;
  }

  res.writeHead(200, { "content-type": contentType(filePath) });
  fs.createReadStream(filePath).pipe(res);
}

function shouldServeAppShell(req, url) {
  if (req.method !== "GET") {
    return false;
  }
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/files/")) {
    return false;
  }
  return !path.extname(url.pathname);
}

async function handleApiRequest(req, res, url, paths, syncManager) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    json(res, 200, { ok: true });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/sync/start") {
    try {
      json(res, 202, await syncManager.startSync());
    } catch (error) {
      if (error && error.code === "SYNC_ALREADY_RUNNING") {
        json(res, error.statusCode || 409, { error: error.message, status: error.status });
        return true;
      }
      throw error;
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/sync/status") {
    json(res, 200, await syncManager.hydrateFromDisk());
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/sync/logs") {
    json(res, 200, syncManager.getLogs());
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/annotations") {
    json(res, 200, await readAnnotations(paths.annotationsPath));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/dataset") {
    json(res, 200, await loadWorkspaceDataset({ baseDir: paths.baseDir }));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/ai/settings") {
    json(res, 200, publicSettings(await readAiSettings(paths.baseDir)));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/ai/settings") {
    const rawBody = await readBody(req);
    let patch;
    try {
      patch = JSON.parse(rawBody || "{}");
    } catch {
      badRequest(res, "Invalid JSON body");
      return true;
    }
    json(res, 200, publicSettings(await writeAiSettings(paths.baseDir, patch)));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/ai/test") {
    try {
      json(res, 200, await testAiSettings(paths.baseDir));
    } catch (error) {
      json(res, error.statusCode || 400, { error: error.message || String(error) });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/ai/run/")) {
    const action = decodeURIComponent(url.pathname.slice("/api/ai/run/".length));
    const rawBody = await readBody(req);
    let requestBody;
    try {
      requestBody = JSON.parse(rawBody || "{}");
    } catch {
      badRequest(res, "Invalid JSON body");
      return true;
    }
    try {
      const dataset = await loadWorkspaceDataset({ baseDir: paths.baseDir });
      json(res, 200, await runAiAction({
        baseDir: paths.baseDir,
        dataset,
        action,
        requestBody,
      }));
    } catch (error) {
      json(res, error.statusCode || 500, { error: error.message || String(error) });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/ai/apply-line-item-suggestions") {
    const rawBody = await readBody(req);
    let requestBody;
    try {
      requestBody = JSON.parse(rawBody || "{}");
    } catch {
      badRequest(res, "Invalid JSON body");
      return true;
    }
    const suggestions = Array.isArray(requestBody.suggestions) ? requestBody.suggestions : [];
    const applied = [];
    for (const suggestion of suggestions) {
      const lineItemKey = String(suggestion.line_item_key || "");
      if (!lineItemKey) {
        continue;
      }
      const patch = {
        expense_category: suggestion.expense_category || "",
        split_type: suggestion.split_type || "",
        split_with: suggestion.split_with || "",
        notes: suggestion.notes || suggestion.reason || "",
        ready_for_splitwise: suggestion.ready_for_splitwise === true,
        review_status: suggestion.ready_for_splitwise === true ? "reviewed" : "needs_review",
        review_reason: suggestion.reason || "Suggested by AI assistant",
      };
      const annotations = await writeLineItemAnnotation(paths.annotationsPath, lineItemKey, patch);
      applied.push({ line_item_key: lineItemKey, annotation: annotations.lineItems[lineItemKey] || {} });
    }
    json(res, 200, {
      ok: true,
      applied,
      dataset: await loadWorkspaceDataset({ baseDir: paths.baseDir }),
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/orders") {
    const dataset = await loadWorkspaceDataset({ baseDir: paths.baseDir });
    json(res, 200, dataset.orders);
    return true;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/orders/")) {
    const dataset = await loadWorkspaceDataset({ baseDir: paths.baseDir });
    const orderId = decodeURIComponent(url.pathname.slice("/api/orders/".length));
    const order = dataset.orders.find((entry) => entry.order_id === orderId);
    if (!order) {
      notFound(res);
      return true;
    }
    json(res, 200, order);
    return true;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/annotations/")) {
    const orderId = decodeURIComponent(url.pathname.slice("/api/annotations/".length));
    const rawBody = await readBody(req);
    let patch;
    try {
      patch = JSON.parse(rawBody || "{}");
    } catch {
      badRequest(res, "Invalid JSON body");
      return true;
    }
    const annotations = await writeOrderAnnotation(paths.annotationsPath, orderId, patch);
    const dataset = await loadWorkspaceDataset({ baseDir: paths.baseDir });
    const order = dataset.orders.find((entry) => entry.order_id === orderId) || null;
    json(res, 200, { ok: true, annotation: annotations.orders[orderId] || {}, order });
    return true;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/line-item-annotations/")) {
    const lineItemKey = decodeURIComponent(url.pathname.slice("/api/line-item-annotations/".length));
    const rawBody = await readBody(req);
    let patch;
    try {
      patch = JSON.parse(rawBody || "{}");
    } catch {
      badRequest(res, "Invalid JSON body");
      return true;
    }
    const annotations = await writeLineItemAnnotation(paths.annotationsPath, lineItemKey, patch);
    const dataset = await loadWorkspaceDataset({ baseDir: paths.baseDir });
    const lineItem = dataset.lineItems.find((entry) => entry.line_item_key === lineItemKey) || null;
    json(res, 200, { ok: true, annotation: annotations.lineItems[lineItemKey] || {}, lineItem });
    return true;
  }

  return false;
}

function createWorkspaceServer({
  baseDir = path.resolve(__dirname, ".."),
  workflowScript,
  syncManager = createSyncManager({ baseDir, workflowScript }),
} = {}) {
  const paths = getProjectPaths(baseDir);

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");

      if (await handleApiRequest(req, res, url, paths, syncManager)) {
        return;
      }

      if (url.pathname.startsWith("/files/")) {
        const absolutePath = resolveSafeWorkspacePath(paths.baseDir, url.pathname.slice("/files/".length));
        if (!absolutePath) {
          notFound(res);
          return;
        }
        await serveFile(res, absolutePath);
        return;
      }

      const requestedAsset = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const assetPath = path.join(paths.webDir, requestedAsset);
      const normalizedAssetPath = path.resolve(assetPath);
      if (!normalizedAssetPath.startsWith(path.resolve(paths.webDir))) {
        notFound(res);
        return;
      }
      try {
        await fsp.access(normalizedAssetPath);
        await serveFile(res, normalizedAssetPath);
      } catch {
        if (shouldServeAppShell(req, url)) {
          await serveFile(res, path.join(paths.webDir, "index.html"));
          return;
        }
        notFound(res);
      }
    } catch (error) {
      json(res, 500, {
        error: "Server error",
        message: error && error.message ? error.message : String(error),
      });
    }
  });
}

if (require.main === module) {
  const server = createWorkspaceServer({ baseDir: path.resolve(__dirname, "..") });
  const port = Number(process.env.PORT || 4317);
  server.listen(port, "127.0.0.1", () => {
    console.log(`Zepto workspace running at http://127.0.0.1:${port}`);
  });
}

module.exports = {
  createWorkspaceServer,
};
