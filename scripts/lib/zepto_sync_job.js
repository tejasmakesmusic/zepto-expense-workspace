const fsp = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");

const MAX_LOG_LINES = 500;

function emptySummary() {
  return {
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
}

function valueFrom(source, names, fallback) {
  for (const name of names) {
    if (source && source[name] !== undefined && source[name] !== null) {
      return source[name];
    }
  }
  return fallback;
}

function numberFrom(source, names, fallback = 0) {
  const value = valueFrom(source, names, fallback);
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function resultHtmlCaptured(result) {
  return Boolean(
    result.htmlCaptured ||
      result.html_captured ||
      result.html_path ||
      result.htmlPath ||
      result.fallback_html_path ||
      result.fallbackHtmlPath,
  );
}

function normalizeDownloadSummary(rawSummary = {}) {
  const summary = emptySummary();
  const sourceSummary = rawSummary.summary && typeof rawSummary.summary === "object" ? rawSummary.summary : {};
  const results = Array.isArray(rawSummary.results)
    ? rawSummary.results
    : Array.isArray(rawSummary.orders)
      ? rawSummary.orders
      : [];

  summary.startedFrom = valueFrom(rawSummary, ["startedFrom", "started_from"], valueFrom(sourceSummary, ["startedFrom", "started_from"], null));
  summary.ordersDiscovered = numberFrom(rawSummary, ["ordersDiscovered", "orders_discovered"], numberFrom(sourceSummary, ["ordersDiscovered", "orders_discovered"], results.length));
  summary.ordersConsidered = numberFrom(rawSummary, ["ordersConsidered", "orders_considered"], numberFrom(sourceSummary, ["ordersConsidered", "orders_considered"], results.length));
  summary.outputPaths = valueFrom(rawSummary, ["outputPaths", "output_paths"], valueFrom(sourceSummary, ["outputPaths", "output_paths"], {})) || {};

  for (const result of results) {
    const status = normalizeStatus(result.status || result.download_status);
    if (status === "already_downloaded") {
      summary.alreadyDownloaded += 1;
    } else if (status === "downloaded" || status === "success" || status === "succeeded") {
      summary.downloaded += 1;
    } else if (status === "missing_button") {
      summary.missingButton += 1;
    } else if (status === "no_download") {
      summary.noDownload += 1;
    }

    if (status === "error" || status === "failed" || result.error) {
      summary.errorCount += 1;
    }

    if (resultHtmlCaptured(result)) {
      summary.htmlCaptured += 1;
    }
  }

  summary.alreadyDownloaded = numberFrom(rawSummary, ["alreadyDownloaded", "already_downloaded"], numberFrom(sourceSummary, ["alreadyDownloaded", "already_downloaded"], summary.alreadyDownloaded));
  summary.downloaded = numberFrom(rawSummary, ["downloaded"], numberFrom(sourceSummary, ["downloaded"], summary.downloaded));
  summary.missingButton = numberFrom(rawSummary, ["missingButton", "missing_button"], numberFrom(sourceSummary, ["missingButton", "missing_button"], summary.missingButton));
  summary.noDownload = numberFrom(rawSummary, ["noDownload", "no_download"], numberFrom(sourceSummary, ["noDownload", "no_download"], summary.noDownload));
  summary.errorCount = numberFrom(rawSummary, ["errorCount", "error_count", "errors"], numberFrom(sourceSummary, ["errorCount", "error_count", "errors"], summary.errorCount));
  summary.htmlCaptured = numberFrom(rawSummary, ["htmlCaptured", "html_captured"], numberFrom(sourceSummary, ["htmlCaptured", "html_captured"], summary.htmlCaptured));
  summary.ordersPending = numberFrom(
    rawSummary,
    ["ordersPending", "orders_pending"],
    numberFrom(sourceSummary, ["ordersPending", "orders_pending"], Math.max(0, summary.ordersConsidered - summary.alreadyDownloaded)),
  );

  return summary;
}

function createInitialStatus() {
  return {
    id: "",
    status: "idle",
    startedAt: null,
    finishedAt: null,
    exitCode: null,
    error: null,
    summary: emptySummary(),
    lastSuccessfulSyncAt: null,
  };
}

function createSyncManager({ baseDir, workflowScript = path.join(baseDir, "scripts", "run_zepto_workflow.js"), nodePath = process.execPath } = {}) {
  const outputsDir = path.join(baseDir, "outputs");
  const statusPath = path.join(outputsDir, "zepto_sync_status.json");
  const logPath = path.join(outputsDir, "zepto_sync_latest.log");
  const downloadSummaryPath = path.join(outputsDir, "zepto_download_summary.json");
  let status = createInitialStatus();
  let logLines = [];
  let activeChild = null;
  let starting = false;

  function publicStatus() {
    return { ...status, summary: { ...status.summary, outputPaths: { ...status.summary.outputPaths } } };
  }

  async function ensureOutputsDir() {
    await fsp.mkdir(outputsDir, { recursive: true });
  }

  async function persistStatus() {
    await ensureOutputsDir();
    await fsp.writeFile(statusPath, JSON.stringify(publicStatus(), null, 2));
  }

  async function persistLogs() {
    await ensureOutputsDir();
    const text = logLines.map((line) => `[${line.timestamp}] ${line.stream}: ${line.message}`).join("\n");
    await fsp.writeFile(logPath, text ? `${text}\n` : "");
  }

  function appendLog(stream, message) {
    const lines = String(message).split(/\r?\n/);
    for (const line of lines) {
      if (!line) {
        continue;
      }
      logLines.push({ timestamp: new Date().toISOString(), stream, message: line });
    }
    if (logLines.length > MAX_LOG_LINES) {
      logLines = logLines.slice(logLines.length - MAX_LOG_LINES);
    }
    persistLogs().catch(() => {});
  }

  function runEventHandler(task) {
    task().catch((error) => {
      const message = error && error.message ? error.message : String(error);
      appendLog("stderr", `Sync event handler failed: ${message}`);
    });
  }

  async function removePreviousDownloadSummary() {
    try {
      await fsp.unlink(downloadSummaryPath);
    } catch (error) {
      if (!error || error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  async function readDownloadSummary() {
    try {
      return JSON.parse(await fsp.readFile(downloadSummaryPath, "utf8"));
    } catch (error) {
      if (error && error.code === "ENOENT") {
        return {};
      }
      throw error;
    }
  }

  async function failInterruptedRunningStatus() {
    status = {
      ...status,
      status: "failed",
      finishedAt: new Date().toISOString(),
      exitCode: null,
      error: status.error || "Previous sync was interrupted before completion.",
      summary: normalizeDownloadSummary(status.summary || {}),
    };
    await persistStatus().catch(() => {});
  }

  async function hydrateFromDisk() {
    if (starting || activeChild) {
      return publicStatus();
    }

    if (status.status === "running") {
      await failInterruptedRunningStatus();
      return publicStatus();
    }

    try {
      const persisted = JSON.parse(await fsp.readFile(statusPath, "utf8"));
      status = { ...createInitialStatus(), ...persisted, summary: normalizeDownloadSummary(persisted.summary || {}) };
      status.id = status.id || status.startedAt || status.finishedAt || status.lastSuccessfulSyncAt || "";
      if (status.status === "running") {
        await failInterruptedRunningStatus();
      }
    } catch (error) {
      if (!error || error.code !== "ENOENT") {
        throw error;
      }
    }
    return publicStatus();
  }

  async function startSync() {
    if (starting || activeChild) {
      const error = new Error("Sync already running");
      error.code = "SYNC_ALREADY_RUNNING";
      error.statusCode = 409;
      error.status = publicStatus();
      throw error;
    }

    starting = true;
    const startedAt = new Date().toISOString();
    logLines = [];
    status = {
      ...status,
      id: startedAt,
      status: "running",
      startedAt,
      finishedAt: null,
      exitCode: null,
      error: null,
      summary: emptySummary(),
    };
    try {
      await ensureOutputsDir();
      await removePreviousDownloadSummary();
      await persistLogs();
      await persistStatus();

      activeChild = spawn(nodePath, [workflowScript], {
        cwd: baseDir,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      starting = false;

      activeChild.stdout.on("data", (chunk) => appendLog("stdout", chunk.toString("utf8")));
      activeChild.stderr.on("data", (chunk) => appendLog("stderr", chunk.toString("utf8")));
      activeChild.on("error", (error) => {
        runEventHandler(async () => {
          appendLog("stderr", error && error.stack ? error.stack : String(error));
          activeChild = null;
          status = {
            ...status,
            status: "failed",
            finishedAt: new Date().toISOString(),
            exitCode: null,
            error: error && error.message ? error.message : String(error),
          };
          await persistStatus();
        });
      });
      activeChild.on("close", (code) => {
        runEventHandler(async () => {
          activeChild = null;
          const finishedAt = new Date().toISOString();
          let summary = emptySummary();
          let errorMessage = null;
          try {
            summary = normalizeDownloadSummary(await readDownloadSummary());
          } catch (error) {
            errorMessage = error && error.message ? error.message : String(error);
            appendLog("stderr", `Failed to read sync summary: ${errorMessage}`);
          }

          status = {
            ...status,
            status: code === 0 ? "succeeded" : "failed",
            finishedAt,
            exitCode: code,
            error: code === 0 ? errorMessage : errorMessage || `Workflow exited with code ${code}`,
            summary,
            lastSuccessfulSyncAt: code === 0 ? finishedAt : status.lastSuccessfulSyncAt,
          };
          await persistStatus();
          await persistLogs();
        });
      });

      return publicStatus();
    } catch (error) {
      starting = false;
      activeChild = null;
      status = {
        ...status,
        status: "failed",
        finishedAt: new Date().toISOString(),
        exitCode: null,
        error: error && error.message ? error.message : String(error),
      };
      await persistStatus().catch(() => {});
      throw error;
    }
  }

  function getStatus() {
    return publicStatus();
  }

  function getLogs() {
    return { lines: logLines.slice(), logPath };
  }

  return {
    startSync,
    hydrateFromDisk,
    getStatus,
    getLogs,
  };
}

module.exports = {
  createSyncManager,
  emptySummary,
  normalizeDownloadSummary,
};
