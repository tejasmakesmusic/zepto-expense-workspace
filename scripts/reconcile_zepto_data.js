const fs = require("fs/promises");
const path = require("path");

const {
  buildReconciliation,
  reconciliationRowsToCsv,
} = require("./lib/zepto_reconciliation");

const ROOT = path.resolve(__dirname, "..");
const OUTPUTS_DIR = path.join(ROOT, "outputs");
const LEDGER_JSON_PATH = path.join(OUTPUTS_DIR, "zepto_orders_ledger.json");
const SUMMARY_JSON_PATH = path.join(OUTPUTS_DIR, "zepto_download_summary.json");
const INVOICE_ROWS_JSON_PATH = path.join(OUTPUTS_DIR, "zepto_invoice_rows.json");
const RECONCILIATION_JSON_PATH = path.join(OUTPUTS_DIR, "zepto_reconciliation.json");
const RECONCILIATION_CSV_PATH = path.join(OUTPUTS_DIR, "zepto_reconciliation.csv");

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function main() {
  const ledgerPayload = await readJson(LEDGER_JSON_PATH);
  const downloadSummary = await readJson(SUMMARY_JSON_PATH);
  const invoiceRows = await readJson(INVOICE_ROWS_JSON_PATH);

  const reconciliation = buildReconciliation({
    startedFrom: ledgerPayload.startedFrom || downloadSummary.startedFrom || "",
    ordersDiscovered: ledgerPayload.ordersDiscovered || (Array.isArray(ledgerPayload.orders) ? ledgerPayload.orders.length : 0),
    orders: Array.isArray(ledgerPayload.orders) ? ledgerPayload.orders : ledgerPayload,
    downloadSummary,
    invoiceRows,
  });

  await fs.writeFile(RECONCILIATION_JSON_PATH, JSON.stringify(reconciliation, null, 2), "utf8");
  await fs.writeFile(RECONCILIATION_CSV_PATH, reconciliationRowsToCsv(reconciliation.rows), "utf8");

  console.log(JSON.stringify({
    reconciliation_json: RECONCILIATION_JSON_PATH,
    reconciliation_csv: RECONCILIATION_CSV_PATH,
    summary: reconciliation.summary,
  }));
}

main().catch((error) => {
  console.error(JSON.stringify({ error: String(error && error.message ? error.message : error) }));
  process.exitCode = 1;
});
