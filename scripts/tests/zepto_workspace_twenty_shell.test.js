const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "../..");
const indexHtml = fs.readFileSync(path.join(rootDir, "web", "zepto-workspace", "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(rootDir, "web", "zepto-workspace", "app.js"), "utf8");
const renderJs = fs.readFileSync(path.join(rootDir, "web", "zepto-workspace", "render.js"), "utf8");
const stylesCss = fs.readFileSync(path.join(rootDir, "web", "zepto-workspace", "styles.css"), "utf8");

test("workspace shell exposes Twenty-style navigation and record table affordances", () => {
  assert.match(indexHtml, /class="workspace-switcher"/);
  assert.match(indexHtml, /id="command-search"/);
  assert.match(indexHtml, /Favorites/);
  assert.match(indexHtml, /Objects/);

  assert.match(renderJs, /view-tabs/);
  assert.match(renderJs, /All orders/);
  assert.match(renderJs, /record-checkbox/);
  assert.match(renderJs, /record-panel/);
  assert.match(renderJs, /pagination-bar/);
  assert.match(renderJs, /pagination-page-size/);
  assert.match(renderJs, /data-page-action/);

  assert.match(stylesCss, /--twenty-bg/);
  assert.match(stylesCss, /\.workspace-shell:has\(\.detail-drawer:not\(\.is-hidden\)\)/);
  assert.match(stylesCss, /\.view-tab\.is-active/);
  assert.match(stylesCss, /\.record-table/);
  assert.match(stylesCss, /\.content-panel \.table-shell/);
  assert.match(stylesCss, /\.command-search/);
  assert.match(stylesCss, /\.pagination-bar/);
  assert.match(stylesCss, /\.pagination-button:disabled/);
});

test("workspace shell supports a collapsible sidebar rail", () => {
  assert.match(indexHtml, /id="workspace-shell"/);
  assert.match(indexHtml, /id="sidebar-toggle"/);
  assert.match(indexHtml, /aria-expanded="true"/);
  assert.match(indexHtml, /class="nav-label"/);

  assert.match(appJs, /SIDEBAR_COLLAPSED_STORAGE_KEY/);
  assert.match(appJs, /toggleSidebarCollapsed/);
  assert.match(appJs, /aria-expanded/);

  assert.match(stylesCss, /\.workspace-shell\.sidebar-collapsed/);
  assert.match(stylesCss, /\.workspace-shell\.sidebar-collapsed \.sidebar/);
  assert.match(stylesCss, /\.workspace-shell\.sidebar-collapsed \.nav-label/);
  assert.match(stylesCss, /\.sidebar-toggle/);
});
