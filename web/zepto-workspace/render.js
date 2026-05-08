function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCurrency(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatQuantity(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) {
    return String(value);
  }
  return Number.isInteger(quantity) ? String(quantity) : String(quantity);
}

function formatDate(isoString) {
  if (!isoString) {
    return "-";
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function titleizeStatus(value) {
  return String(value || "")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function titleizeLabel(value) {
  return String(value || "")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatSyncTime(isoString) {
  if (!isoString) {
    return "-";
  }
  return formatDate(isoString);
}

function renderSyncMiniStatus(sync = {}) {
  const status = sync.status || "idle";
  const summary = sync.summary || {};
  const details = status === "running" || status === "starting"
    ? `Discovered ${summary.ordersDiscovered ?? 0} | pending ${summary.ordersPending ?? 0}`
    : status === "succeeded"
      ? `${summary.downloaded ?? 0} new | ${summary.alreadyDownloaded ?? 0} reused | ${(summary.missingButton ?? 0) + (summary.noDownload ?? 0) + (summary.errorCount ?? 0)} review`
      : sync.error || "Ready";
  return `
    <span class="status-chip status-${escapeHtml(status)}">${escapeHtml(titleizeStatus(status))}</span>
    <span>${escapeHtml(details)}</span>
  `;
}

function formatConfidence(value) {
  const confidence = String(value || "").trim();
  return confidence ? titleizeLabel(confidence) : "Unknown";
}

function formatParseQualityClass(value) {
  return String(value || "unknown")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
}

function isSuggestedCategorySuppressed(order) {
  return Boolean(order.annotations?.suppress_suggested_category) && !order.annotations?.expense_category;
}

function renderCategoryCell(order) {
  const isAutoCategory = !order.annotations?.expense_category
    && !isSuggestedCategorySuppressed(order)
    && order.suggested_category;
  return `
    <div class="category-cell">
      <span>${escapeHtml(order.effective_category || "-")}</span>
      ${isAutoCategory ? '<span class="mini-badge mini-badge--auto">Auto</span>' : ""}
    </div>
  `;
}

function renderCoverageBadges(order) {
  const badges = invoiceModeBadge(order);
  if (badges) {
    return `<div class="badge-stack">${badges}</div>`;
  }
  return '<div class="badge-stack"><span class="mini-badge mini-badge--missing">Missing</span></div>';
}

function orderStateLabel(order) {
  const statusText = String(order?.order_status_text || "");
  if (/cancelled/i.test(statusText) || order?.reconciliation_status === "cancelled_order") {
    return "Cancelled";
  }
  if (/delivered/i.test(statusText)) {
    return "Delivered";
  }
  return statusText || "Unknown";
}

function orderStateBadge(order) {
  const label = orderStateLabel(order);
  const modifier = label === "Cancelled" ? "mini-badge--missing" : label === "Delivered" ? "mini-badge--good" : "mini-badge--warn";
  return `<span class="mini-badge ${modifier}">${escapeHtml(label)}</span>`;
}

function invoiceStatusLabel(order) {
  if (order?.has_invoice) {
    return "Invoice available";
  }
  if (order?.has_html_fallback) {
    return "HTML fallback";
  }
  return "Missing invoice";
}

function renderSuggestionContext(order) {
  const hasSuggestion = Boolean(order.suggested_category);
  const reasons = Array.isArray(order.suggested_category_reasons) ? order.suggested_category_reasons : [];
  const topReasons = reasons.slice(0, 3);
  const manualCategoryLabel = order.annotations?.expense_category || "";
  const suggestionSuppressed = isSuggestedCategorySuppressed(order);
  const savedCategoryLabel = manualCategoryLabel || (suggestionSuppressed ? "Unassigned" : "Not saved yet");

  return `
    <div class="suggestion-block">
      <div class="suggestion-block__header">
        <div>
          <strong>Category suggestion</strong>
          <p>${hasSuggestion ? "Signals from the order still inform this review, even if you already set a manual category." : "No automatic category suggestion is available for this order yet."}</p>
        </div>
        ${hasSuggestion ? `<span class="mini-badge mini-badge--auto">${escapeHtml(formatConfidence(order.suggested_category_confidence))}</span>` : ""}
      </div>
      <div class="suggestion-grid">
        <div>
          <span>Saved category</span>
          <strong>${escapeHtml(savedCategoryLabel)}</strong>
        </div>
        <div>
          <span>Suggested category</span>
          <strong>${escapeHtml(order.suggested_category || "No suggestion")}</strong>
        </div>
      </div>
      <div class="suggestion-notes">
        <span>Why this was suggested</span>
        <ul>
          ${topReasons.length
            ? topReasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")
            : "<li>No strong category signals were detected.</li>"}
        </ul>
      </div>
    </div>
  `;
}

function renderMismatchExplainer(order) {
  if (order.reconciliation_status !== "amount_mismatch" || !order.mismatch_explainer) {
    return "";
  }

  const explainer = order.mismatch_explainer;
  const evidenceItems = Array.isArray(explainer.evidence_items) ? explainer.evidence_items : [];

  return `
    <div class="drawer-section">
      <div class="panel-header">
        <div>
          <h4>Mismatch explainer</h4>
          <p>${escapeHtml(explainer.likely_reason_summary || "No explanation available yet.")}</p>
        </div>
        <span class="mini-badge mini-badge--warn">${escapeHtml(formatConfidence(explainer.confidence))}</span>
      </div>
      <div class="mismatch-grid">
        <div>
          <span>Order amount</span>
          <strong>${escapeHtml(formatCurrency(explainer.order_amount))}</strong>
        </div>
        <div>
          <span>Invoice amount</span>
          <strong>${escapeHtml(formatCurrency(explainer.invoice_amount))}</strong>
        </div>
        <div>
          <span>Delta</span>
          <strong>${escapeHtml(formatCurrency(explainer.delta_amount))}</strong>
        </div>
        <div>
          <span>Likely cause</span>
          <strong>${escapeHtml(explainer.likely_reason_summary || titleizeLabel(explainer.likely_reason_code || "unclassified_mismatch"))}</strong>
        </div>
      </div>
      <div class="mismatch-evidence">
        <span>Supporting evidence</span>
        <ul>
          ${evidenceItems.length
            ? evidenceItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
            : "<li>No supporting evidence items were provided.</li>"}
        </ul>
      </div>
    </div>
  `;
}

function statusChip(status) {
  return `<span class="status-chip status-${escapeHtml(status || "unknown")}">${escapeHtml(titleizeStatus(status || "unknown"))}</span>`;
}

function invoiceModeBadge(order) {
  const badges = [];
  if (order.has_invoice) {
    badges.push('<span class="mini-badge mini-badge--good">Invoice</span>');
  }
  if (order.has_html_fallback) {
    badges.push('<span class="mini-badge mini-badge--warn">HTML</span>');
  }
  return badges.join("");
}

function renderMetricCard(label, value, tone = "neutral", detail = "") {
  return `
    <article class="metric-card metric-card--${tone}">
      <p>${escapeHtml(label)}</p>
      <strong>${escapeHtml(String(value))}</strong>
      ${detail ? `<span>${escapeHtml(detail)}</span>` : ""}
    </article>
  `;
}

function renderCompactMetric(label, value, detail = "") {
  return `
    <article class="compact-metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
      ${detail ? `<p>${escapeHtml(detail)}</p>` : ""}
    </article>
  `;
}

function renderPaginationControls(summary) {
  if (!summary) {
    return "";
  }
  const rangeText = summary.totalItems === 0
    ? "No records"
    : `Showing ${summary.startItem}-${summary.endItem} of ${summary.totalItems}`;
  const pageSizeOptions = [10, 25, 50, 100];

  return `
    <div class="pagination-bar" aria-label="Pagination">
      <div class="pagination-meta">
        <strong>${escapeHtml(rangeText)}</strong>
        <span>Page ${escapeHtml(summary.page)} of ${escapeHtml(summary.totalPages)}</span>
      </div>
      <div class="pagination-controls">
        <label class="pagination-size">
          <span>Rows per page</span>
          <select id="pagination-page-size">
            ${pageSizeOptions.map((pageSize) => `
              <option value="${pageSize}" ${summary.pageSize === pageSize ? "selected" : ""}>${pageSize}</option>
            `).join("")}
          </select>
        </label>
        <div class="pagination-actions">
          <button class="pagination-button" data-page-action="previous" type="button" ${summary.hasPrevious ? "" : "disabled"}>Previous</button>
          <button class="pagination-button" data-page-action="next" type="button" ${summary.hasNext ? "" : "disabled"}>Next</button>
        </div>
      </div>
    </div>
  `;
}

function viewTabClass(state, view) {
  return state.currentView === view ? "view-tab is-active" : "view-tab";
}

function renderViewTabs(state) {
  const tabs = [
    ["orders", "All orders"],
    ["exceptions", "Exceptions"],
    ["line-items", "Line items"],
    ["split-review", "Split review"],
    ["ai-assistant", "AI assistant"],
    ["data-sources", "Data sources"],
  ];
  return `
    <div class="view-tabs">
      ${tabs.map(([view, label]) => `
        <button class="${viewTabClass(state, view)}" data-view-tab="${escapeHtml(view)}" type="button">${escapeHtml(label)}</button>
      `).join("")}
    </div>
  `;
}

function renderToolbar(state, months) {
  const statusOptions = [
    ["all", "All statuses"],
    ...Object.keys(state.dataset.summary.statusCounts).map((status) => [status, titleizeStatus(status)]),
  ];
  const lineItemFilterMarkup = state.currentView === "line-items"
    ? `
      <label>
        <span>Category</span>
        <select id="filter-category">
          <option value="all" ${state.filters.category === "all" ? "selected" : ""}>All</option>
          ${["groceries", "household", "personal", "medicines", "snacks", "misc"].map((value) => `
            <option value="${value}" ${state.filters.category === value ? "selected" : ""}>${escapeHtml(titleizeLabel(value))}</option>
          `).join("")}
        </select>
      </label>
      <label>
        <span>Split type</span>
        <select id="filter-split-type">
          <option value="all" ${state.filters.splitType === "all" ? "selected" : ""}>All</option>
          ${["personal", "shared", "exclude", "needs_review", ""].map((value) => `
            <option value="${escapeHtml(value)}" ${state.filters.splitType === value ? "selected" : ""}>${escapeHtml(value ? titleizeLabel(value) : "Unassigned")}</option>
          `).join("")}
        </select>
      </label>
      <label>
        <span>Parse quality</span>
        <select id="filter-parse-quality">
          <option value="all" ${state.filters.parseQuality === "all" ? "selected" : ""}>All</option>
          <option value="parsed_line_item" ${state.filters.parseQuality === "parsed_line_item" ? "selected" : ""}>Parsed line item</option>
          <option value="partial_line_item" ${state.filters.parseQuality === "partial_line_item" ? "selected" : ""}>Partial line item</option>
          <option value="invoice_fallback" ${state.filters.parseQuality === "invoice_fallback" ? "selected" : ""}>Invoice fallback</option>
          <option value="" ${state.filters.parseQuality === "" ? "selected" : ""}>Blank</option>
        </select>
      </label>
    `
    : "";
  const workbenchFilterMarkup = state.currentView === "workbench"
    ? `
      <label>
        <span>Issue type</span>
        <select id="filter-workbench-type">
          <option value="all" ${state.filters.workbenchType === "all" ? "selected" : ""}>All</option>
          ${Object.keys(state.dataset.workbench?.issueCounts || {}).map((value) => `
            <option value="${escapeHtml(value)}" ${state.filters.workbenchType === value ? "selected" : ""}>${escapeHtml(titleizeLabel(value))}</option>
          `).join("")}
        </select>
      </label>
    `
    : "";
  return `
    <div class="view-toolbar">
      <label class="toolbar-search">
        <input id="filter-query" type="search" placeholder="Order ID, invoice, item, notes" value="${escapeHtml(state.filters.query)}">
      </label>
      <div class="filter-grid">
      <label>
        <span>Month</span>
        <select id="filter-month">
          <option value="all">All months</option>
          ${months.map((month) => `<option value="${escapeHtml(month)}" ${state.filters.month === month ? "selected" : ""}>${escapeHtml(month)}</option>`).join("")}
        </select>
      </label>
      <label>
        <span>Reconciliation</span>
        <select id="filter-status">
          ${statusOptions.map(([value, label]) => `<option value="${escapeHtml(value)}" ${state.filters.status === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}
        </select>
      </label>
      <label>
        <span>Order state</span>
        <select id="filter-order-state">
          <option value="all" ${state.filters.orderState === "all" ? "selected" : ""}>All</option>
          <option value="delivered" ${state.filters.orderState === "delivered" ? "selected" : ""}>Delivered</option>
          <option value="cancelled" ${state.filters.orderState === "cancelled" ? "selected" : ""}>Cancelled</option>
        </select>
      </label>
      <label>
        <span>Invoice mode</span>
        <select id="filter-invoice-mode">
          <option value="all" ${state.filters.invoiceMode === "all" ? "selected" : ""}>All</option>
          <option value="invoice_only" ${state.filters.invoiceMode === "invoice_only" ? "selected" : ""}>Invoice only</option>
          <option value="html_fallback_only" ${state.filters.invoiceMode === "html_fallback_only" ? "selected" : ""}>HTML fallback only</option>
          <option value="missing_invoice_only" ${state.filters.invoiceMode === "missing_invoice_only" ? "selected" : ""}>Missing invoice only</option>
        </select>
      </label>
      <label>
        <span>Split review</span>
        <select id="filter-ready-state">
          <option value="all" ${state.filters.readyState === "all" ? "selected" : ""}>All</option>
          <option value="ready" ${state.filters.readyState === "ready" ? "selected" : ""}>Ready</option>
          <option value="not_ready" ${state.filters.readyState === "not_ready" ? "selected" : ""}>Not ready</option>
        </select>
      </label>
      ${lineItemFilterMarkup}
      ${workbenchFilterMarkup}
      <label>
        <span>Sort</span>
        <select id="filter-sort">
          <option value="date_desc" ${state.filters.sort === "date_desc" ? "selected" : ""}>Newest first</option>
          <option value="date_asc" ${state.filters.sort === "date_asc" ? "selected" : ""}>Oldest first</option>
          <option value="amount_desc" ${state.filters.sort === "amount_desc" ? "selected" : ""}>Highest amount</option>
          <option value="amount_asc" ${state.filters.sort === "amount_asc" ? "selected" : ""}>Lowest amount</option>
        </select>
      </label>
      </div>
    </div>
  `;
}

function renderSyncPanel(sync = {}) {
  const summary = sync.summary || {};
  const logs = Array.isArray(sync.logs) ? sync.logs.slice(-8) : [];
  const status = sync.status || "idle";
  return `
    <section class="sync-panel">
      <div class="panel-header">
        <div>
          <h3>Zepto sync</h3>
          <p>${escapeHtml(status)}${sync.error ? ` | ${escapeHtml(sync.error)}` : ""}</p>
        </div>
        <span class="status-chip status-${escapeHtml(status)}">${escapeHtml(titleizeStatus(status))}</span>
      </div>
      <div class="sync-grid">
        ${renderCompactMetric("Last success", formatSyncTime(sync.lastSuccessfulSyncAt), "Most recent completed run")}
        ${renderCompactMetric("Downloaded", summary.downloaded ?? 0, "New invoices")}
        ${renderCompactMetric("Already had", summary.alreadyDownloaded ?? 0, "Incremental reuse")}
        ${renderCompactMetric("Needs attention", (summary.missingButton ?? 0) + (summary.noDownload ?? 0) + (summary.errorCount ?? 0), "Missing or failed")}
      </div>
      <div class="sync-log">
        ${logs.length
          ? logs.map((line) => `<p><span>${escapeHtml(line.stream || "log")}</span>${escapeHtml(line.message || "")}</p>`).join("")
          : '<p><span>log</span>No sync log yet.</p>'}
      </div>
    </section>
  `;
}

function renderOverview(state) {
  const { summary, featureSuggestions } = state.dataset;
  return `
    <section class="view-section">
      ${renderSyncPanel(state.sync)}
      <div class="metrics-grid">
        ${renderMetricCard("In-scope orders", summary.totalOrders, "neutral", "Feb 2026 onward")}
        ${renderMetricCard("Invoice complete", summary.invoiceCompleteCount, "good", `${summary.totalOrders - summary.invoiceCompleteCount} unresolved`)}
        ${renderMetricCard("HTML fallback", summary.htmlFallbackCount, "warn", "Cancelled or unavailable invoices")}
        ${renderMetricCard("Amount mismatch", summary.amountMismatchCount, "danger", "Needs review")}
        ${renderMetricCard("Data capture", summary.dataCaptureComplete ? "Complete" : "Incomplete", summary.dataCaptureComplete ? "good" : "danger")}
        ${renderMetricCard("Strict invoice completeness", summary.datasetComplete ? "Complete" : "Incomplete", summary.datasetComplete ? "good" : "warn")}
      </div>

      <div class="two-column">
        <section class="panel">
          <div class="panel-header">
            <h3>Spend by month</h3>
            <p>Total spend: ${escapeHtml(formatCurrency(summary.totalSpend))}</p>
          </div>
          <div class="simple-table">
            <div class="simple-row simple-row--head"><span>Month</span><span>Spend</span></div>
            ${summary.monthlySpend.map((row) => `
              <div class="simple-row">
                <span>${escapeHtml(row.month)}</span>
                <span>${escapeHtml(formatCurrency(row.amount))}</span>
              </div>
            `).join("")}
          </div>
        </section>

        <section class="panel">
          <div class="panel-header">
            <h3>Reconciliation health</h3>
            <p>Current status distribution</p>
          </div>
          <div class="simple-table">
            <div class="simple-row simple-row--head"><span>Status</span><span>Orders</span></div>
            ${Object.entries(summary.statusCounts).map(([status, count]) => `
              <div class="simple-row">
                <span>${statusChip(status)}</span>
                <span>${escapeHtml(String(count))}</span>
              </div>
            `).join("")}
          </div>
        </section>
      </div>

      <div class="two-column">
        <section class="panel">
          <div class="panel-header">
            <h3>Immediate attention</h3>
            <p>Newest unresolved orders</p>
          </div>
          <div class="queue-list">
            ${state.dataset.orders
              .filter((order) => order.is_exception)
              .sort((left, right) => String(right.order_date_iso || "").localeCompare(String(left.order_date_iso || "")))
              .slice(0, 8)
              .map((order) => `
              <button class="queue-item" data-order-id="${escapeHtml(order.order_id)}" type="button">
                <div>
                  <strong>${escapeHtml(order.order_id)}</strong>
                  <p>${escapeHtml(formatDate(order.order_date_iso))}</p>
                </div>
                <div class="queue-item-meta">
                  ${statusChip(order.reconciliation_status)}
                  <span>${escapeHtml(formatCurrency(order.order_amount_value))}</span>
                </div>
              </button>
            `).join("") || '<p class="muted-text">No exceptions right now.</p>'}
          </div>
        </section>

        <section class="panel">
          <div class="panel-header">
            <h3>Suggested next features</h3>
            <p>Most useful additions after v1</p>
          </div>
          <ul class="feature-list">
            ${featureSuggestions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </section>
      </div>
    </section>
  `;
}

function renderTable(orders, emptyMessage) {
  if (!orders.length) {
    return `<div class="empty-state"><h3>No matching orders</h3><p>${escapeHtml(emptyMessage)}</p></div>`;
  }
  return `
    <div class="table-shell table-shell--orders">
      <table class="orders-table record-table">
        <thead>
          <tr>
            <th class="record-select-column"></th>
            <th>Date</th>
            <th>Order</th>
            <th>Order state</th>
            <th>Invoice status</th>
            <th>Status</th>
            <th>Amount</th>
            <th>Category</th>
            <th>Split</th>
            <th>Ready</th>
          </tr>
        </thead>
        <tbody>
          ${orders.map((order) => `
            <tr class="${order.is_exception ? "is-exception" : ""}">
              <td><input class="record-checkbox" type="checkbox" aria-label="Select ${escapeHtml(order.order_id)}"></td>
              <td>${escapeHtml(formatDate(order.order_date_iso))}</td>
              <td>
                <button class="row-button" data-order-id="${escapeHtml(order.order_id)}" type="button">
                  <strong>${escapeHtml(order.order_id)}</strong>
                  <span>${escapeHtml((order.order_numbers || []).join(", ") || order.order_status_text || "-")}</span>
                </button>
              </td>
              <td>${orderStateBadge(order)}</td>
              <td>${renderCoverageBadges(order)}</td>
              <td>${statusChip(order.reconciliation_status)}</td>
              <td>${escapeHtml(formatCurrency(order.order_amount_value))}</td>
              <td>${renderCategoryCell(order)}</td>
              <td>${escapeHtml(order.annotations?.split_type || "-")}</td>
              <td>${order.annotations?.ready_for_splitwise ? '<span class="mini-badge mini-badge--good">Ready</span>' : '<span class="mini-badge">Pending</span>'}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderOrdersView(state, orders, paginationSummary) {
  const totalOrders = paginationSummary?.totalItems ?? orders.length;
  let description = `${totalOrders} orders match the current filters.`;
  if (state.currentView === "exceptions") {
    description = `${totalOrders} unresolved orders need attention.`;
  }
  if (state.currentView === "split-review") {
    description = `${totalOrders} orders are available for split tagging and notes.`;
  }
  return `
    <section class="view-section">
      ${renderViewTabs(state)}
      <div class="panel-header panel-header--space">
        <div>
          <h3>${state.currentView === "exceptions" ? "Exception queue" : state.currentView === "split-review" ? "Split review queue" : "Orders"}</h3>
          <p>${escapeHtml(description)}</p>
        </div>
      </div>
      ${renderTable(orders, "Try widening the filters or searching a different term.")}
      ${renderPaginationControls(paginationSummary)}
    </section>
  `;
}

function renderWorkbenchView(state, issues, paginationSummary) {
  const counts = state.dataset.workbench?.issueCounts || {};
  const totalIssues = paginationSummary?.totalItems ?? issues.length;
  const issueEvidence = (issue, order) => {
    const coreEvidence = [
      `Status: ${titleizeStatus(issue.reconciliation_status || "unknown")}`,
      `Order state: ${orderStateLabel(order)}`,
      `Invoice status: ${invoiceStatusLabel(issue)}`,
      `Review: ${issue.review_status ? titleizeLabel(issue.review_status) : "unreviewed"}`,
      `Category: ${order?.effective_category || order?.suggested_category || "unassigned"}`,
      `Split: ${[order?.annotations?.split_type, order?.annotations?.split_with].filter(Boolean).join(" / ") || "unassigned"}`,
    ];
    const mismatchEvidence = [];
    if (issue.mismatch_explainer?.delta_amount !== undefined) {
      mismatchEvidence.push(`Delta: ${formatCurrency(issue.mismatch_explainer.delta_amount)}`);
    }
    if (issue.mismatch_explainer?.likely_reason_summary) {
      mismatchEvidence.push(issue.mismatch_explainer.likely_reason_summary);
    }
    return [
      ...coreEvidence,
      ...mismatchEvidence,
      ...(issue.mismatch_explainer?.evidence_items || []),
    ];
  };
  return `
    <section class="view-section">
      <div class="compact-metric-strip">
        ${renderCompactMetric("Issues", totalIssues, "Matching filters")}
        ${renderCompactMetric("Mismatches", counts.amount_mismatch || 0, "Amount review")}
        ${renderCompactMetric("Missing invoices", (counts.missing_invoice_html_captured || 0) + (counts.missing_invoice_without_fallback || 0), "Invoice review")}
        ${renderCompactMetric("Manual follow-up", counts.needs_manual_followup || 0, "Marked by review")}
      </div>
      <div class="workbench-list">
        ${issues.length ? issues.map((issue) => {
          const order = state.dataset.orders.find((entry) => entry.order_id === issue.order_id) || {};
          const evidenceItems = issueEvidence(issue, order);
          return `
            <article class="workbench-card">
              <div class="workbench-card__main">
                <div>
                  <span class="mini-badge">${escapeHtml(titleizeLabel(issue.issue_type))}</span>
                  <h3>${escapeHtml(issue.title)}</h3>
                  <p>${escapeHtml(issue.detail || order.notes || "Open the order to review source evidence.")}</p>
                </div>
                <div class="workbench-card__meta">
                  ${statusChip(issue.reconciliation_status)}
                  <strong>${escapeHtml(formatCurrency(issue.order_amount_value))}</strong>
                  <span>${escapeHtml(formatDate(issue.order_date_iso))}</span>
                </div>
              </div>
              <div class="workbench-evidence">
                ${evidenceItems.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
              </div>
              <div class="workbench-actions">
                <button class="secondary-button" data-order-id="${escapeHtml(issue.order_id)}" type="button">Open order</button>
                <button class="secondary-button" data-review-order-id="${escapeHtml(issue.order_id)}" data-review-status="reviewed" type="button">Mark reviewed</button>
                <button class="secondary-button" data-review-order-id="${escapeHtml(issue.order_id)}" data-review-status="needs_retry" type="button">Needs retry</button>
                <button class="secondary-button" data-review-order-id="${escapeHtml(issue.order_id)}" data-review-status="needs_manual_followup" type="button">Follow up</button>
                <button class="secondary-button" data-review-order-id="${escapeHtml(issue.order_id)}" data-review-status="ignored" type="button">Ignore</button>
              </div>
            </article>
          `; 
        }).join("") : '<div class="empty-state"><h3>No workbench issues</h3><p>Try widening the filters.</p></div>'}
      </div>
      ${renderPaginationControls(paginationSummary)}
    </section>
  `;
}

function renderLineItemsTable(lineItems) {
  return `
    <div class="table-shell table-shell--line-items">
      <table class="orders-table record-table line-items-table">
        <thead>
          <tr>
            <th class="record-select-column"></th>
            <th>Date</th>
            <th>Item description</th>
            <th>Order state</th>
            <th>Invoice status</th>
            <th>Qty</th>
            <th>Line total</th>
            <th>Category</th>
            <th>Split type</th>
            <th>Split with</th>
            <th>Ready</th>
            <th>Tag source</th>
            <th>Action</th>
            <th>Parse quality</th>
            <th>Invoice number</th>
            <th>Order ID</th>
          </tr>
        </thead>
        <tbody>
          ${lineItems.map((lineItem) => `
            <tr>
              <td><input class="record-checkbox" type="checkbox" aria-label="Select ${escapeHtml(lineItem.item_description || "line item")}"></td>
              <td>${escapeHtml(formatDate(lineItem.order_date_iso || lineItem.invoice_date_iso || lineItem.date))}</td>
              <td>
                <button class="row-button row-button--line-item" data-order-id="${escapeHtml(lineItem.order_id || "")}" type="button">
                  <strong>${escapeHtml(lineItem.item_description || "Unnamed item")}</strong>
                  <span>${escapeHtml(lineItem.seller_name || lineItem.order_status_text || "Open order detail")}</span>
                </button>
              </td>
              <td>${orderStateBadge(lineItem)}</td>
              <td>${renderCoverageBadges(lineItem)}</td>
              <td>${escapeHtml(formatQuantity(lineItem.quantity))}</td>
              <td>${escapeHtml(formatCurrency(lineItem.line_total_amount || 0))}</td>
              <td>${escapeHtml(lineItem.effective_category || "-")}</td>
              <td>${escapeHtml(lineItem.split_type || "-")}</td>
              <td>${escapeHtml(lineItem.split_with || "-")}</td>
              <td>${lineItem.ready_for_splitwise ? '<span class="mini-badge mini-badge--good">Ready</span>' : '<span class="mini-badge">Pending</span>'}</td>
              <td><span class="mini-badge mini-badge--auto">${escapeHtml(titleizeLabel(lineItem.split_tag_source || "suggested"))}</span></td>
              <td><button class="secondary-button line-edit-button" data-line-item-key="${escapeHtml(lineItem.line_item_key || "")}" type="button">Edit</button></td>
              <td><span class="mini-badge parse-quality-chip parse-quality-chip--${formatParseQualityClass(lineItem.parse_quality)}">${escapeHtml(formatConfidence(lineItem.parse_quality))}</span></td>
              <td>${escapeHtml(lineItem.invoice_number || "-")}</td>
              <td><span class="mono-text">${escapeHtml(lineItem.order_id || "-")}</span></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderLineItemEditor(state) {
  const selected = (state.dataset.lineItems || []).find((item) => item.line_item_key === state.selectedLineItemKey);
  if (!selected) {
    return '<div class="line-item-editor muted-editor">Select a line item to edit split tags.</div>';
  }

  return `
    <form class="line-item-editor" id="line-item-annotation-form" data-line-item-key="${escapeHtml(selected.line_item_key)}">
      <div class="line-item-editor__item">
        <strong>${escapeHtml(selected.item_description || "Unnamed item")}</strong>
        <p>${escapeHtml(`${selected.order_id} | ${formatCurrency(selected.line_total_amount || 0)} | ${orderStateLabel(selected)} | ${invoiceStatusLabel(selected)}`)}</p>
      </div>
      <label>
        <span>Category</span>
        <select name="expense_category">
          <option value="">Unassigned</option>
          ${["groceries", "household", "personal", "medicines", "snacks", "misc"].map((value) => `
            <option value="${value}" ${selected.effective_category === value ? "selected" : ""}>${escapeHtml(titleizeLabel(value))}</option>
          `).join("")}
        </select>
      </label>
      <label>
        <span>Split type</span>
        <select name="split_type">
          <option value="">Unassigned</option>
          ${["personal", "shared", "exclude", "needs_review"].map((value) => `
            <option value="${value}" ${selected.split_type === value ? "selected" : ""}>${escapeHtml(titleizeLabel(value))}</option>
          `).join("")}
        </select>
      </label>
      <label>
        <span>Split with</span>
        <input name="split_with" type="text" value="${escapeHtml(selected.split_with || "")}">
      </label>
      <label>
        <span>Notes</span>
        <input name="notes" type="text" value="${escapeHtml(selected.notes || "")}">
      </label>
      <label class="checkbox-row">
        <input name="ready_for_splitwise" type="checkbox" ${selected.ready_for_splitwise ? "checked" : ""}>
        <span>Ready</span>
      </label>
      <button class="primary-button" type="submit" ${state.isSaving ? "disabled" : ""}>${state.isSaving ? "Saving..." : "Save line item"}</button>
    </form>
  `;
}

function renderLineItemsView(state, lineItems, summary, paginationSummary) {
  const invoiceMode = state.filters.invoiceMode;
  if (!lineItems.length) {
    const emptyMessage = invoiceMode === "html_fallback_only" || invoiceMode === "missing_invoice_only"
      ? "No parsed invoice rows match this view. Line items only exist when invoice rows were parsed, so HTML fallback and missing-invoice filters do not produce line-item rows."
      : "No line items match the current filters. Try widening the filters or searching a different term.";

    return `
      <section class="view-section">
        ${renderViewTabs(state)}
        <div class="panel-header panel-header--space">
          <div>
            <h3>Line items</h3>
            <p>Parsed invoice rows across the current Zepto dataset.</p>
          </div>
        </div>
        ${renderLineItemEditor(state)}
        <div class="empty-state">
          <h3>No matching line items</h3>
          <p>${escapeHtml(emptyMessage)}</p>
        </div>
        ${renderPaginationControls(paginationSummary)}
      </section>
    `;
  }

  return `
    <section class="view-section">
      ${renderViewTabs(state)}
      <div class="panel-header panel-header--space">
        <div>
          <h3>Line items</h3>
          <p>${escapeHtml(`${summary.lineItemCount} parsed invoice rows match the current filters.`)}</p>
        </div>
      </div>
      <div class="compact-metric-strip">
        ${renderCompactMetric("Rows", summary.lineItemCount, "Parsed invoice rows")}
        ${renderCompactMetric("Orders", summary.uniqueOrderCount, "Distinct Zepto orders")}
        ${renderCompactMetric("Invoices", summary.uniqueInvoiceCount, "Distinct invoice numbers")}
      ${renderCompactMetric("Line total", formatCurrency(summary.totalSpend), "Visible line-item spend")}
      </div>
      ${renderLineItemEditor(state)}
      ${renderLineItemsTable(lineItems)}
      ${renderPaginationControls(paginationSummary)}
    </section>
  `;
}

function renderAiSettings(state) {
  const settings = state.ai?.settings || {};
  const running = Boolean(state.ai?.runningAction);
  return `
    <section class="panel ai-settings-panel">
      <div class="panel-header">
        <div>
          <h3>AI settings</h3>
          <p>Bring your own OpenAI or Anthropic key. Settings are stored locally in ignored output files for this dashboard version.</p>
        </div>
        <span class="mini-badge ${settings.hasApiKey ? "mini-badge--good" : "mini-badge--warn"}">${settings.hasApiKey ? "Key saved" : "No key"}</span>
      </div>
      <form class="ai-settings-form" id="ai-settings-form">
        <label>
          <span>Provider</span>
          <select name="provider">
            <option value="">Choose provider</option>
            <option value="openai" ${settings.provider === "openai" ? "selected" : ""}>OpenAI</option>
            <option value="anthropic" ${settings.provider === "anthropic" ? "selected" : ""}>Anthropic</option>
          </select>
        </label>
        <label>
          <span>Model</span>
          <input name="model" type="text" value="${escapeHtml(settings.model || "")}" placeholder="gpt-4.1-mini or claude-3-5-haiku-latest">
        </label>
        <label>
          <span>API key ${settings.apiKeyPreview ? `(${escapeHtml(settings.apiKeyPreview)})` : ""}</span>
          <input name="api_key" type="password" placeholder="${settings.hasApiKey ? "Leave blank to keep saved key" : "Paste API key"}">
        </label>
        <label class="checkbox-row">
          <input name="redact_private_fields" type="checkbox" ${settings.redactPrivateFields !== false ? "checked" : ""}>
          <span>Redact names, addresses, GSTINs, and raw invoice fields by default</span>
        </label>
        <label class="checkbox-row">
          <input name="allow_raw_html_fallback" type="checkbox" ${settings.allowRawHtmlFallback ? "checked" : ""}>
          <span>Allow raw HTML fallback text in AI prompts</span>
        </label>
        <div class="ai-settings-actions">
          <button class="primary-button" type="submit" ${running ? "disabled" : ""}>Save settings</button>
          <button class="secondary-button" type="button" data-ai-test ${running || !settings.hasApiKey ? "disabled" : ""}>Test connection</button>
        </div>
      </form>
    </section>
  `;
}

function renderAiActions(state) {
  const runningAction = state.ai?.runningAction || "";
  const busy = Boolean(runningAction);
  const actionButtons = [
    ["categorize", "Auto-categorize line items", "Suggest categories, split types, and readiness tags."],
    ["mismatches", "Explain mismatches", "Explain invoice/order mismatches and next actions."],
    ["monthlySummary", "Summarize monthly spending", "Generate a compact month/category summary."],
    ["anomalies", "Detect unusual or duplicate items", "Find repeated invoices, odd amounts, and review risks."],
    ["htmlFallback", "Structure HTML fallbacks", "Turn messy fallback captures into structured order context."],
  ];
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h3>AI actions</h3>
          <p>Suggestions are staged for review. They do not overwrite annotations until you apply them.</p>
        </div>
      </div>
      <div class="ai-action-grid">
        ${actionButtons.map(([action, label, detail]) => `
          <button class="ai-action-card" data-ai-action="${escapeHtml(action)}" type="button" ${busy ? "disabled" : ""}>
            <strong>${escapeHtml(label)}</strong>
            <span>${escapeHtml(runningAction === action ? "Running..." : detail)}</span>
          </button>
        `).join("")}
      </div>
      <div class="ai-query-box">
        <label>
          <span>Ask a question about local data</span>
          <input id="ai-query-input" type="text" value="${escapeHtml(state.ai?.query || "")}" placeholder="show shared grocery expenses from March">
        </label>
        <button class="primary-button" data-ai-action="query" type="button" ${busy ? "disabled" : ""}>Ask</button>
      </div>
    </section>
  `;
}

function renderAiResult(state) {
  const result = state.ai?.result;
  const error = state.ai?.error || "";
  const runningAction = state.ai?.runningAction || "";
  if (error) {
    return `<section class="panel ai-result-panel"><h3>AI result</h3><div class="empty-state"><h3>AI request failed</h3><p>${escapeHtml(error)}</p></div></section>`;
  }
  if (runningAction) {
    return `<section class="panel ai-result-panel"><h3>AI result</h3><div class="empty-state"><h3>Working...</h3><p>${escapeHtml(titleizeLabel(runningAction))} is running.</p></div></section>`;
  }
  if (!result) {
    return `<section class="panel ai-result-panel"><h3>AI result</h3><div class="empty-state"><h3>No result yet</h3><p>Run an AI action to stage suggestions or generate an answer.</p></div></section>`;
  }
  if (result.action === "categorize") {
    const suggestions = Array.isArray(result.suggestions) ? result.suggestions : [];
    return `
      <section class="panel ai-result-panel">
        <div class="panel-header">
          <div>
            <h3>Line-item suggestions</h3>
            <p>${escapeHtml(`${suggestions.length} suggestions ready for review.`)}</p>
          </div>
          <button class="primary-button" data-ai-apply-line-items type="button" ${suggestions.length ? "" : "disabled"}>Apply all</button>
        </div>
        <div class="table-shell">
          <table class="orders-table ai-suggestions-table">
            <thead>
              <tr>
                <th>Item key</th>
                <th>Category</th>
                <th>Split</th>
                <th>Ready</th>
                <th>Confidence</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              ${suggestions.map((suggestion) => `
                <tr>
                  <td><span class="mono-text">${escapeHtml(suggestion.line_item_key)}</span></td>
                  <td>${escapeHtml(suggestion.expense_category || "-")}</td>
                  <td>${escapeHtml(suggestion.split_type || "-")}</td>
                  <td>${suggestion.ready_for_splitwise ? '<span class="mini-badge mini-badge--good">Ready</span>' : '<span class="mini-badge mini-badge--warn">Review</span>'}</td>
                  <td>${escapeHtml(formatConfidence(suggestion.confidence))}</td>
                  <td>${escapeHtml(suggestion.reason || suggestion.notes || "-")}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }
  if (result.action === "mismatches") {
    const explanations = Array.isArray(result.explanations) ? result.explanations : [];
    return `
      <section class="panel ai-result-panel">
        <h3>Mismatch explanations</h3>
        <div class="ai-card-list">
          ${explanations.map((item) => `
            <article class="ai-result-card">
              <strong>${escapeHtml(item.order_id)}</strong>
              <p>${escapeHtml(item.summary || item.likely_reason || "-")}</p>
              <span>${escapeHtml(item.suggested_action || "")}</span>
            </article>
          `).join("") || '<p class="muted-text">No explanations returned.</p>'}
        </div>
      </section>
    `;
  }
  if (result.action === "anomalies") {
    const anomalies = Array.isArray(result.anomalies) ? result.anomalies : [];
    return `
      <section class="panel ai-result-panel">
        <h3>Anomalies and duplicates</h3>
        <div class="ai-card-list">
          ${anomalies.map((item) => `
            <article class="ai-result-card">
              <strong>${escapeHtml(item.title || item.type)}</strong>
              <p>${escapeHtml(item.detail || "-")}</p>
              <span>${escapeHtml(formatConfidence(item.severity))}</span>
            </article>
          `).join("") || '<p class="muted-text">No anomalies returned.</p>'}
        </div>
      </section>
    `;
  }
  if (result.action === "apply" || result.action === "settings" || result.action === "test") {
    return `<section class="panel ai-result-panel"><h3>AI result</h3><div class="empty-state"><h3>Done</h3><p>${escapeHtml(result.message || "Complete.")}</p></div></section>`;
  }
  const answer = result.answer || result.summary || "";
  const rows = Array.isArray(result.rows) ? result.rows : [];
  return `
    <section class="panel ai-result-panel">
      <h3>${escapeHtml(result.action === "query" ? "Answer" : "AI summary")}</h3>
      <p class="ai-answer">${escapeHtml(answer || JSON.stringify(result))}</p>
      ${rows.length ? `
        <div class="simple-table">
          ${rows.map((row) => `
            <div class="simple-row"><span>${escapeHtml(row.label || row.order_id || row.line_item_key || "-")}</span><span>${escapeHtml(row.value || "")}</span></div>
          `).join("")}
        </div>
      ` : ""}
      ${Array.isArray(result.highlights) ? `<ul class="feature-list">${result.highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
      ${Array.isArray(result.recommended_actions) ? `<ul class="feature-list">${result.recommended_actions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
    </section>
  `;
}

function renderAiAssistant(state) {
  return `
    <section class="view-section">
      ${renderAiSettings(state)}
      ${renderAiActions(state)}
      ${renderAiResult(state)}
    </section>
  `;
}

function renderDataSources(state) {
  const { sources } = state.dataset;
  return `
    <section class="view-section">
      <div class="two-column">
        <section class="panel">
          <div class="panel-header">
            <h3>Artifact counts</h3>
            <p>Current local source files</p>
          </div>
          <div class="simple-table">
            <div class="simple-row simple-row--head"><span>Source</span><span>Rows</span></div>
            <div class="simple-row"><span>Reconciliation</span><span>${escapeHtml(String(sources.reconciliation.rowCount))}</span></div>
            <div class="simple-row"><span>Orders ledger</span><span>${escapeHtml(String(sources.ordersLedger.rowCount))}</span></div>
            <div class="simple-row"><span>Invoice rows</span><span>${escapeHtml(String(sources.invoiceRows.rowCount))}</span></div>
            <div class="simple-row"><span>HTML fallbacks</span><span>${escapeHtml(String(sources.htmlFallbacks.rowCount))}</span></div>
            <div class="simple-row"><span>Order annotations</span><span>${escapeHtml(String(sources.annotations.orderCount))}</span></div>
            <div class="simple-row"><span>Line-item annotations</span><span>${escapeHtml(String(sources.annotations.lineItemCount || 0))}</span></div>
          </div>
        </section>
        <section class="panel">
          <div class="panel-header">
            <h3>Linked outputs</h3>
            <p>Open the generated files directly</p>
          </div>
          <ul class="link-list">
            <li><a href="/files/outputs%2Fzepto_reconciliation.json" target="_blank" rel="noreferrer">Reconciliation JSON</a></li>
            <li><a href="/files/outputs%2Fzepto_orders_ledger.json" target="_blank" rel="noreferrer">Orders ledger JSON</a></li>
            <li><a href="/files/outputs%2Fzepto_invoice_rows.json" target="_blank" rel="noreferrer">Invoice rows JSON</a></li>
            <li><a href="/files/outputs%2Fzepto_html_fallbacks.json" target="_blank" rel="noreferrer">HTML fallback JSON</a></li>
            <li><a href="${escapeHtml(sources.workbook.url)}" target="_blank" rel="noreferrer">Expense workbook</a></li>
          </ul>
        </section>
      </div>
    </section>
  `;
}

function renderInvoiceRows(invoiceRows) {
  if (!invoiceRows.length) {
    return '<p class="muted-text">No parsed invoice line items for this order.</p>';
  }
  return `
    <div class="line-items">
      ${invoiceRows.map((row) => `
        <div class="line-item-row">
          <div>
            <strong>${escapeHtml(row.item_description || "Unnamed item")}</strong>
            <p>${escapeHtml(`Qty ${row.quantity || "-"} | Rate ${row.product_rate || "-"} | GSTIN ${row.seller_gstin || "-"}`)}</p>
          </div>
          <span>${escapeHtml(formatCurrency(row.line_total_amount || 0))}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderDetailLinks(order) {
  const links = [];
  if (order.links.invoice) {
    links.push(`<a href="${escapeHtml(order.links.invoice)}" target="_blank" rel="noreferrer">Open invoice PDF</a>`);
  }
  if (order.links.html) {
    links.push(`<a href="${escapeHtml(order.links.html)}" target="_blank" rel="noreferrer">Open HTML fallback</a>`);
  }
  if (order.links.htmlJson) {
    links.push(`<a href="${escapeHtml(order.links.htmlJson)}" target="_blank" rel="noreferrer">Open fallback JSON</a>`);
  }
  return links.length ? `<div class="drawer-links">${links.join("")}</div>` : "";
}

export function renderApp(elements, state, visibleOrders = [], months = [], lineItems = null, lineItemSummary = null, workbenchIssues = [], paginationSummary = null) {
  const selectedOrder = state.dataset.orders.find((order) => order.order_id === state.selectedOrderId) || null;
  const selectedCategoryValue = selectedOrder?.annotations?.expense_category || selectedOrder?.effective_category || "";
  const selectedManualCategoryValue = selectedOrder?.annotations?.expense_category || "";
  const selectedSuppressedCategory = selectedOrder?.annotations?.suppress_suggested_category ? "true" : "false";
  const pageTitles = {
    overview: "Overview",
    workbench: "Workbench",
    orders: "Orders",
    "line-items": "Line Items",
    "ai-assistant": "AI Assistant",
    exceptions: "Exceptions",
    "split-review": "Split Review",
    "data-sources": "Data Sources",
  };
  const subtitles = {
    overview: "Health, coverage, and the next useful places to spend attention.",
    workbench: "Resolve invoice, reconciliation, retry, and split-readiness issues from one queue.",
    orders: "Browse every in-scope order with invoice, fallback, and split review context in one place.",
    "line-items": "Inspect parsed invoice rows, line totals, categories, and parse coverage across orders.",
    "ai-assistant": "Use your own AI key to stage categories, split tags, summaries, anomaly checks, and local-data answers.",
    exceptions: "A focused queue for mismatches and missing-invoice cases.",
    "split-review": "Capture the categorization and split decisions you want to keep separate from the raw Zepto exports.",
    "data-sources": "Audit where the current dataset came from and open the source artifacts directly.",
  };
  elements.pageKicker.textContent = state.currentView === "overview"
    ? "Review workflow"
    : state.currentView === "line-items"
      ? "Parsed invoice rows"
      : state.currentView === "workbench"
        ? "Reconciliation queue"
      : "Working dataset";
  elements.pageTitle.textContent = pageTitles[state.currentView] || "Zepto Data Workspace";
  elements.pageSubtitle.textContent = subtitles[state.currentView] || "Review the current Zepto dataset.";
  if (elements.syncMiniStatus) {
    elements.syncMiniStatus.innerHTML = renderSyncMiniStatus(state.sync);
  }

  elements.sidebarSummary.innerHTML = `
    <div class="sidebar-summary-card">
      <span>Strict invoice completeness</span>
      <strong>${state.dataset.summary.datasetComplete ? "Complete" : "Incomplete"}</strong>
    </div>
    <div class="sidebar-summary-card">
      <span>Unresolved orders</span>
      <strong>${escapeHtml(String(state.dataset.summary.exceptionCount))}</strong>
    </div>
    <div class="sidebar-summary-card">
      <span>Last sync</span>
      <strong>${escapeHtml(state.sync?.lastSuccessfulSyncAt ? formatSyncTime(state.sync.lastSuccessfulSyncAt) : titleizeStatus(state.sync?.status || "idle"))}</strong>
    </div>
    <div class="sidebar-summary-card">
      <span>Sync run</span>
      <strong>${escapeHtml(titleizeStatus(state.sync?.status || "idle"))}</strong>
      <small>${escapeHtml(state.sync?.status === "running" || state.sync?.status === "starting"
        ? `Started ${formatSyncTime(state.sync?.startedAt)}`
        : state.sync?.finishedAt
          ? `Finished ${formatSyncTime(state.sync.finishedAt)}`
          : "Ready")}</small>
    </div>
  `;

  elements.toolbar.innerHTML = renderToolbar(state, months);

  if (state.currentView === "overview") {
    elements.content.innerHTML = renderOverview(state);
  } else if (state.currentView === "line-items") {
    elements.content.innerHTML = renderLineItemsView(
      state,
      Array.isArray(lineItems) ? lineItems : [],
      lineItemSummary || {
        lineItemCount: 0,
        uniqueOrderCount: 0,
        uniqueInvoiceCount: 0,
        totalSpend: 0,
      },
      paginationSummary,
    );
  } else if (state.currentView === "workbench") {
    elements.content.innerHTML = renderWorkbenchView(state, workbenchIssues, paginationSummary);
  } else if (state.currentView === "ai-assistant") {
    elements.content.innerHTML = renderAiAssistant(state);
  } else if (state.currentView === "data-sources") {
    elements.content.innerHTML = renderDataSources(state);
  } else {
    elements.content.innerHTML = renderOrdersView(state, visibleOrders, paginationSummary);
  }

  if (!state.drawerOpen || !selectedOrder) {
    elements.drawer.classList.add("is-hidden");
    elements.drawer.innerHTML = "";
    return;
  }

  elements.drawer.classList.remove("is-hidden");
  elements.drawer.innerHTML = `
    <div class="record-panel">
    <div class="drawer-header">
      <div>
        <p class="eyebrow">Order detail</p>
        <h3>${escapeHtml(selectedOrder.order_id)}</h3>
      </div>
      <button class="icon-button" id="drawer-close-button" type="button">Close</button>
    </div>

    <div class="drawer-section">
      <div class="kv-grid">
        <div><span>Date</span><strong>${escapeHtml(formatDate(selectedOrder.order_date_iso))}</strong></div>
        <div><span>Amount</span><strong>${escapeHtml(formatCurrency(selectedOrder.order_amount_value))}</strong></div>
        <div><span>Order state</span><strong>${escapeHtml(selectedOrder.order_status_text || "-")}</strong></div>
        <div><span>Reconciliation</span><strong>${escapeHtml(titleizeStatus(selectedOrder.reconciliation_status))}</strong></div>
      </div>
      ${renderDetailLinks(selectedOrder)}
    </div>

    <div class="drawer-section">
      <div class="panel-header">
        <h4>Invoice summary</h4>
        <p>${escapeHtml((selectedOrder.invoice_numbers || []).join(", ") || "No invoice number")}</p>
      </div>
      ${renderInvoiceRows(selectedOrder.invoice_rows || [])}
    </div>

    <div class="drawer-section">
      <div class="panel-header">
        <h4>HTML fallback</h4>
        <p>${selectedOrder.has_html_fallback ? "Captured from order page HTML" : "No fallback record for this order"}</p>
      </div>
      ${selectedOrder.has_html_fallback ? `
        <div class="text-block">
          <strong>Bill summary</strong>
          <p>${escapeHtml(selectedOrder.html_fallback?.html_bill_summary_text || "-")}</p>
        </div>
        <div class="text-block">
          <strong>Items</strong>
          <p>${escapeHtml(selectedOrder.html_fallback?.html_items_text || "-")}</p>
        </div>
      ` : '<p class="muted-text">This order is backed by invoice data instead.</p>'}
    </div>

    <div class="drawer-section">
      <div class="panel-header">
        <h4>Split review</h4>
        <p>These fields stay in a separate annotations file.</p>
      </div>
      <form id="annotation-form" data-order-id="${escapeHtml(selectedOrder.order_id)}" class="annotation-form">
        <label>
          <span>Expense category</span>
          <select
            name="expense_category"
            data-manual-category="${escapeHtml(selectedManualCategoryValue)}"
            data-effective-category="${escapeHtml(selectedOrder.effective_category || "")}"
            data-suggested-category="${escapeHtml(selectedOrder.suggested_category || "")}"
            data-prefill-source="${selectedOrder.annotations?.expense_category ? "manual" : selectedOrder.effective_category ? "suggestion" : "none"}"
            data-suppress-suggested-category="${selectedSuppressedCategory}"
          >
            <option value="">Unassigned</option>
            ${["groceries", "household", "personal", "medicines", "snacks", "misc"].map((value) => `
              <option value="${value}" ${selectedCategoryValue === value ? "selected" : ""}>${escapeHtml(value)}</option>
            `).join("")}
          </select>
        </label>
        <label>
          <span>Split type</span>
          <select name="split_type">
            <option value="">Unassigned</option>
            ${["personal", "shared", "exclude", "needs_review"].map((value) => `
              <option value="${value}" ${selectedOrder.annotations?.split_type === value ? "selected" : ""}>${escapeHtml(value)}</option>
            `).join("")}
          </select>
        </label>
        <label>
          <span>Split with</span>
          <input name="split_with" type="text" value="${escapeHtml(selectedOrder.annotations?.split_with || "")}" placeholder="family, flatmate, roommate">
        </label>
        <label class="annotation-form__wide">
          <span>Notes</span>
          <textarea name="notes" rows="4" placeholder="Why this should be split or excluded">${escapeHtml(selectedOrder.annotations?.notes || "")}</textarea>
        </label>
        <label class="checkbox-row annotation-form__wide">
          <input name="ready_for_splitwise" type="checkbox" ${selectedOrder.annotations?.ready_for_splitwise ? "checked" : ""}>
          <span>Ready for Splitwise entry</span>
        </label>
        <button class="primary-button annotation-form__wide" type="submit" ${state.isSaving ? "disabled" : ""}>${state.isSaving ? "Saving..." : "Save review"}</button>
      </form>
      ${renderSuggestionContext(selectedOrder)}
    </div>

    ${renderMismatchExplainer(selectedOrder)}
    </div>
  `;
}
