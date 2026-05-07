const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const NODE = process.execPath;

function findBundledPython() {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  if (!home) {
    return "";
  }
  const executable = process.platform === "win32" ? "python.exe" : "python";
  const candidate = path.join(
    home,
    ".cache",
    "codex-runtimes",
    "codex-primary-runtime",
    "dependencies",
    "python",
    executable,
  );
  return fs.existsSync(candidate) ? candidate : "";
}

const PYTHON = process.env.PYTHON || findBundledPython() || "python";

function runStep(label, command, args) {
  return new Promise((resolve, reject) => {
    console.log(`\n=== ${label} ===`);
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: "inherit",
      shell: false,
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${label} failed with exit code ${code}`));
      }
    });
    child.on("error", reject);
  });
}

async function main() {
  const skipDownload = process.argv.includes("--skip-download");

  if (!skipDownload) {
    await runStep("Download invoices and capture order ledger", NODE, [path.join("scripts", "zepto_download_invoices.js")]);
  }
  await runStep("Parse invoices", PYTHON, [path.join("scripts", "extract_zepto_invoices.py")]);
  await runStep("Reconcile order ledger with invoice data", NODE, [path.join("scripts", "reconcile_zepto_data.js")]);
  await runStep("Build expense workbook", PYTHON, [path.join("scripts", "build_zepto_expense_workbook.py")]);
}

main().catch((error) => {
  console.error(String(error && error.message ? error.message : error));
  process.exitCode = 1;
});
