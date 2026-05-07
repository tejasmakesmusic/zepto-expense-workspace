import {
  fetchDataset,
  fetchSyncLogs,
  fetchSyncStatus,
  saveAnnotation,
  saveLineItemAnnotation,
  startSync,
} from "/api.js";
import {
  createInitialState,
  getAvailableMonths,
  getVisibleLineItems,
  getVisibleOrders,
  getVisibleWorkbenchIssues,
  paginateItems,
  patchState,
  resetPagination,
  summarizeVisibleLineItems,
  updateFilters,
  updatePagination,
} from "/state.js";
import { renderApp } from "/render.js";

const elements = {
  shell: document.getElementById("workspace-shell"),
  content: document.getElementById("content"),
  toolbar: document.getElementById("toolbar"),
  drawer: document.getElementById("detail-drawer"),
  pageTitle: document.getElementById("page-title"),
  pageSubtitle: document.getElementById("page-subtitle"),
  pageKicker: document.getElementById("page-kicker"),
  sidebarSummary: document.getElementById("sidebar-summary"),
  syncMiniStatus: document.getElementById("sync-mini-status"),
  refreshButton: document.getElementById("refresh-button"),
  syncButton: document.getElementById("sync-button"),
  commandSearch: document.getElementById("command-search"),
  sidebarToggle: document.getElementById("sidebar-toggle"),
  navButtons: [...document.querySelectorAll(".nav-button")],
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "zeptoWorkspace.sidebarCollapsed";

const bootstrapDataset = {
  summary: {
    totalOrders: 0,
    invoiceCompleteCount: 0,
    htmlFallbackCount: 0,
    amountMismatchCount: 0,
    dataCaptureComplete: false,
    datasetComplete: false,
    totalSpend: 0,
    exceptionCount: 0,
    monthlySpend: [],
    statusCounts: {},
  },
  orders: [],
  lineItems: [],
  workbench: {
    issues: [],
    issueCounts: {},
  },
  featureSuggestions: [],
  sources: {
    reconciliation: { rowCount: 0 },
    ordersLedger: { rowCount: 0 },
    invoiceRows: { rowCount: 0 },
    htmlFallbacks: { rowCount: 0 },
    annotations: { orderCount: 0, lineItemCount: 0 },
    workbook: { url: "#" },
  },
};

const state = {
  dataset: bootstrapDataset,
  currentView: "overview",
  filters: {
    query: "",
    month: "all",
    category: "all",
    splitType: "all",
    parseQuality: "all",
    status: "all",
    orderState: "all",
    invoiceMode: "all",
    readyState: "all",
    workbenchType: "all",
    sort: "date_desc",
  },
  selectedOrderId: "",
  selectedLineItemKey: "",
  pagination: {
    page: 1,
    pageSize: 25,
  },
  drawerOpen: false,
  isSaving: false,
  loading: true,
  error: "",
  sync: {
    id: "",
    status: "idle",
    startedAt: null,
    finishedAt: null,
    lastSuccessfulSyncAt: null,
    summary: {},
    logs: [],
    error: "",
  },
};

let syncPollTimer = null;
let lastRefreshedSyncId = "";

function readSidebarCollapsedPreference() {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function persistSidebarCollapsedPreference(isCollapsed) {
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(isCollapsed));
  } catch {
    // Private browsing and embedded shells can deny storage; the control still works for this session.
  }
}

function applySidebarCollapsedState(isCollapsed) {
  elements.shell.classList.toggle("sidebar-collapsed", isCollapsed);
  elements.sidebarToggle.setAttribute("aria-expanded", String(!isCollapsed));
  elements.sidebarToggle.setAttribute("aria-label", isCollapsed ? "Expand sidebar" : "Collapse sidebar");
  elements.sidebarToggle.title = isCollapsed ? "Expand sidebar" : "Collapse sidebar";
}

function toggleSidebarCollapsed() {
  const isCollapsed = !elements.shell.classList.contains("sidebar-collapsed");
  applySidebarCollapsedState(isCollapsed);
  persistSidebarCollapsedPreference(isCollapsed);
}

function buildEffectiveCategory(order, annotations) {
  if (annotations?.expense_category) {
    return annotations.expense_category;
  }
  if (annotations?.suppress_suggested_category) {
    return "";
  }
  return order?.suggested_category || "";
}

function buildOrderSearchText(order) {
  return [
    order.order_id,
    order.order_status_text,
    ...(order.invoice_numbers || []),
    ...(order.order_numbers || []),
    ...(order.invoice_rows || []).map((row) => row.item_description || ""),
    order.html_fallback?.html_items_text || "",
    order.html_fallback?.html_bill_summary_text || "",
    order.annotations?.expense_category || "",
    order.annotations?.split_type || "",
    order.annotations?.split_with || "",
    order.annotations?.notes || "",
  ]
    .join(" ")
    .toLowerCase();
}

function updateOrderInState(orderId, transformOrder) {
  const currentOrders = state.dataset.orders || [];
  const nextOrders = currentOrders.map((order) => (
    order.order_id === orderId ? transformOrder(order) : order
  ));
  state.dataset = {
    ...state.dataset,
    orders: nextOrders,
  };
}

function applyAnnotationToOrder(order, annotation) {
  const nextAnnotations = {
    ...(order.annotations || {}),
    ...(annotation || {}),
  };
  const nextOrder = {
    ...order,
    annotations: nextAnnotations,
  };
  nextOrder.effective_category = buildEffectiveCategory(nextOrder, nextAnnotations);
  nextOrder.search_text = buildOrderSearchText(nextOrder);
  return nextOrder;
}

function applyLocalAnnotation(orderId, annotation) {
  updateOrderInState(orderId, (order) => applyAnnotationToOrder(order, annotation));
}

function applyLocalOrder(orderId, nextOrder) {
  updateOrderInState(orderId, (order) => ({
    ...order,
    ...(nextOrder || {}),
  }));
}

function getOrderSnapshot(orderId) {
  const order = (state.dataset.orders || []).find((entry) => entry.order_id === orderId);
  return order ? { ...order, annotations: { ...(order.annotations || {}) } } : null;
}

function normalizeSyncState(status = {}, logs = []) {
  const syncId = status.id || status.startedAt || status.finishedAt || status.lastSuccessfulSyncAt || "";
  return {
    id: syncId,
    status: status.status || "idle",
    startedAt: status.startedAt || null,
    finishedAt: status.finishedAt || null,
    exitCode: status.exitCode ?? null,
    lastSuccessfulSyncAt: status.lastSuccessfulSyncAt || null,
    summary: status.summary || {},
    logs,
    error: status.error || "",
  };
}

function replaceDataset(dataset, patch = {}) {
  const nextState = createInitialState(dataset);
  const currentView = patch.currentView ?? state.currentView;
  const filters = reconcilePreservedFilters(state.filters, dataset);
  const selectedOrderId = patch.selectedOrderId ?? state.selectedOrderId;
  const selectedOrderExists = dataset.orders.some((order) => order.order_id === selectedOrderId);
  const selectedLineItemKey = patch.selectedLineItemKey ?? state.selectedLineItemKey;
  const selectedLineItemExists = (dataset.lineItems || []).some((lineItem) => lineItem.line_item_key === selectedLineItemKey);

  Object.assign(state, nextState, {
    currentView,
    filters,
    pagination: state.pagination,
    selectedOrderId: selectedOrderExists ? selectedOrderId : dataset.orders[0]?.order_id || "",
    selectedLineItemKey: selectedLineItemExists ? selectedLineItemKey : "",
    drawerOpen: state.drawerOpen && selectedOrderExists,
    isSaving: false,
    loading: false,
    sync: state.sync,
    ...patch,
  });
}

function reconcilePreservedFilters(filters, dataset) {
  const nextFilters = {
    ...filters,
  };
  const availableMonths = new Set(getAvailableMonths(dataset));
  const availableStatuses = new Set(Object.keys(dataset?.summary?.statusCounts || {}));
  const availableWorkbenchTypes = new Set(Object.keys(dataset?.workbench?.issueCounts || {}));

  if (nextFilters.month !== "all" && !availableMonths.has(nextFilters.month)) {
    nextFilters.month = "all";
  }
  if (nextFilters.status !== "all" && !availableStatuses.has(nextFilters.status)) {
    nextFilters.status = "all";
  }
  if (nextFilters.workbenchType !== "all" && !availableWorkbenchTypes.has(nextFilters.workbenchType)) {
    nextFilters.workbenchType = "all";
  }

  return nextFilters;
}

function stopSyncPolling() {
  if (syncPollTimer) {
    clearTimeout(syncPollTimer);
    syncPollTimer = null;
  }
}

function scheduleSyncPolling() {
  stopSyncPolling();
  syncPollTimer = window.setTimeout(() => {
    refreshSyncStatus({ poll: true });
  }, 1800);
}

async function refreshSyncStatus({ poll = false } = {}) {
  try {
    const [status, logsPayload] = await Promise.all([
      fetchSyncStatus(),
      fetchSyncLogs(),
    ]);
    const logs = Array.isArray(logsPayload?.lines) ? logsPayload.lines : [];
    patchState(state, { sync: normalizeSyncState(status, logs) });

    if (state.sync.status === "running" || state.sync.status === "starting") {
      scheduleSyncPolling();
    } else {
      stopSyncPolling();
      if (poll && state.sync.status === "succeeded" && state.sync.id && state.sync.id !== lastRefreshedSyncId) {
        lastRefreshedSyncId = state.sync.id;
        const dataset = await fetchDataset();
        replaceDataset(dataset);
      }
    }
  } catch (error) {
    stopSyncPolling();
    patchState(state, {
      sync: {
        ...state.sync,
        status: state.sync.status || "idle",
        error: error.message || "Could not refresh sync status.",
      },
    });
  }
  render();
}

function syncNavButtons() {
  for (const button of elements.navButtons) {
    button.classList.toggle("is-active", button.dataset.view === state.currentView);
  }
}

function render() {
  const months = getAvailableMonths(state.dataset);
  const visibleOrders = getVisibleOrders(state);
  const visibleLineItems = getVisibleLineItems(state);
  const visibleWorkbenchIssues = getVisibleWorkbenchIssues(state);
  const currentItems = state.currentView === "line-items"
    ? visibleLineItems
    : state.currentView === "workbench"
      ? visibleWorkbenchIssues
      : ["orders", "exceptions", "split-review"].includes(state.currentView)
        ? visibleOrders
        : [];
  const paginated = paginateItems(currentItems, state.pagination);
  state.pagination = {
    page: paginated.summary.page,
    pageSize: paginated.summary.pageSize,
  };
  const paginatedOrders = ["orders", "exceptions", "split-review"].includes(state.currentView) ? paginated.items : visibleOrders;
  const paginatedLineItems = state.currentView === "line-items" ? paginated.items : visibleLineItems;
  const paginatedWorkbenchIssues = state.currentView === "workbench" ? paginated.items : visibleWorkbenchIssues;
  const paginationSummary = currentItems.length || ["orders", "exceptions", "split-review", "line-items", "workbench"].includes(state.currentView)
    ? paginated.summary
    : null;
  const lineItemSummary = summarizeVisibleLineItems(visibleLineItems);
  syncNavButtons();
  const syncRunning = state.sync.status === "running" || state.sync.status === "starting";
  elements.refreshButton.disabled = state.isSaving || state.loading || syncRunning;
  elements.syncButton.disabled = state.isSaving || state.loading || syncRunning;
  elements.syncButton.textContent = syncRunning ? "Syncing..." : "Sync from Zepto";
  elements.commandSearch.value = state.filters.query || "";
  renderApp(elements, state, paginatedOrders, months, paginatedLineItems, lineItemSummary, paginatedWorkbenchIssues, paginationSummary);

  elements.toolbar.querySelector("#filter-query")?.addEventListener("input", (event) => {
    updateFilters(state, { query: event.target.value });
    resetPagination(state);
    render();
  });
  elements.toolbar.querySelector("#filter-month")?.addEventListener("change", (event) => {
    updateFilters(state, { month: event.target.value });
    resetPagination(state);
    render();
  });
  elements.toolbar.querySelector("#filter-status")?.addEventListener("change", (event) => {
    updateFilters(state, { status: event.target.value });
    resetPagination(state);
    render();
  });
  elements.toolbar.querySelector("#filter-order-state")?.addEventListener("change", (event) => {
    updateFilters(state, { orderState: event.target.value });
    resetPagination(state);
    render();
  });
  elements.toolbar.querySelector("#filter-invoice-mode")?.addEventListener("change", (event) => {
    updateFilters(state, { invoiceMode: event.target.value });
    resetPagination(state);
    render();
  });
  elements.toolbar.querySelector("#filter-ready-state")?.addEventListener("change", (event) => {
    updateFilters(state, { readyState: event.target.value });
    resetPagination(state);
    render();
  });
  elements.toolbar.querySelector("#filter-category")?.addEventListener("change", (event) => {
    updateFilters(state, { category: event.target.value });
    resetPagination(state);
    render();
  });
  elements.toolbar.querySelector("#filter-split-type")?.addEventListener("change", (event) => {
    updateFilters(state, { splitType: event.target.value });
    resetPagination(state);
    render();
  });
  elements.toolbar.querySelector("#filter-parse-quality")?.addEventListener("change", (event) => {
    updateFilters(state, { parseQuality: event.target.value });
    resetPagination(state);
    render();
  });
  elements.toolbar.querySelector("#filter-workbench-type")?.addEventListener("change", (event) => {
    updateFilters(state, { workbenchType: event.target.value });
    resetPagination(state);
    render();
  });
  elements.toolbar.querySelector("#filter-sort")?.addEventListener("change", (event) => {
    updateFilters(state, { sort: event.target.value });
    resetPagination(state);
    render();
  });

  elements.content.querySelectorAll("[data-view-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      patchState(state, {
        currentView: button.dataset.viewTab,
        drawerOpen: button.dataset.viewTab === "overview" ? false : state.drawerOpen,
      });
      resetPagination(state);
      render();
    });
  });

  elements.content.querySelector("#pagination-page-size")?.addEventListener("change", (event) => {
    updatePagination(state, { pageSize: event.target.value });
    render();
  });

  elements.content.querySelectorAll("[data-page-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const direction = button.dataset.pageAction === "next" ? 1 : -1;
      updatePagination(state, { page: state.pagination.page + direction });
      render();
    });
  });

  elements.content.querySelectorAll("[data-order-id]").forEach((button) => {
    button.addEventListener("click", () => {
      patchState(state, {
        selectedOrderId: button.dataset.orderId,
        drawerOpen: true,
      });
      render();
    });
  });

  elements.content.querySelectorAll("[data-review-order-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (state.isSaving) {
        return;
      }
      const orderId = button.dataset.reviewOrderId;
      const reviewStatus = button.dataset.reviewStatus;
      const previousOrderSnapshot = getOrderSnapshot(orderId);
      const reviewReasonByStatus = {
        reviewed: "Reviewed from workbench",
        needs_retry: "Retry requested from workbench",
        ignored: "Ignored from workbench",
        needs_manual_followup: "Manual follow-up requested from workbench",
      };
      const patch = {
        review_status: reviewStatus,
        review_reason: reviewReasonByStatus[reviewStatus] || "Updated from workbench",
      };

      applyLocalAnnotation(orderId, patch);
      patchState(state, { isSaving: true });
      render();
      try {
        const saveResult = await saveAnnotation(orderId, patch);
        if (saveResult?.order) {
          applyLocalOrder(orderId, saveResult.order);
        }
        const dataset = await fetchDataset();
        replaceDataset(dataset, {
          currentView: "workbench",
          selectedOrderId: orderId,
        });
        render();
      } catch (error) {
        if (previousOrderSnapshot) {
          applyLocalOrder(orderId, previousOrderSnapshot);
        }
        patchState(state, { isSaving: false });
        window.alert(error.message || "Could not save review status.");
        render();
      }
    });
  });

  elements.content.querySelectorAll("button[data-line-item-key]").forEach((button) => {
    button.addEventListener("click", () => {
      patchState(state, { selectedLineItemKey: button.dataset.lineItemKey });
      render();
    });
  });

  elements.content.querySelector("#line-item-annotation-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.isSaving) {
      return;
    }

    const form = new FormData(event.currentTarget);
    const lineItemKey = event.currentTarget.dataset.lineItemKey;
    const patch = {
      expense_category: form.get("expense_category") || "",
      split_type: form.get("split_type") || "",
      split_with: form.get("split_with") || "",
      notes: form.get("notes") || "",
      ready_for_splitwise: form.get("ready_for_splitwise") === "on",
      review_status: form.get("ready_for_splitwise") === "on" ? "reviewed" : "unreviewed",
    };

    patchState(state, { isSaving: true });
    render();
    try {
      await saveLineItemAnnotation(lineItemKey, patch);
      const dataset = await fetchDataset();
      replaceDataset(dataset, {
        currentView: "line-items",
        selectedLineItemKey: lineItemKey,
      });
      render();
    } catch (error) {
      patchState(state, { isSaving: false });
      window.alert(error.message || "Could not save line item annotation.");
      render();
    }
  });

  elements.drawer.querySelector("#drawer-close-button")?.addEventListener("click", () => {
    patchState(state, { drawerOpen: false });
    render();
  });

  elements.drawer.querySelector("#annotation-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.isSaving) {
      return;
    }

    const form = new FormData(event.currentTarget);
    const categorySelect = event.currentTarget.querySelector('select[name="expense_category"]');
    const selectedExpenseCategory = String(form.get("expense_category") || "");
    const manualCategory = categorySelect?.dataset.manualCategory || "";
    const effectiveCategory = categorySelect?.dataset.effectiveCategory || "";
    const suggestedCategory = categorySelect?.dataset.suggestedCategory || "";
    const prefillSource = categorySelect?.dataset.prefillSource || "none";
    const suppressSuggestedCategory = categorySelect?.dataset.suppressSuggestedCategory === "true";
    const isUntouchedSuggestedCategory =
      !manualCategory
      && !suppressSuggestedCategory
      && prefillSource === "suggestion"
      && selectedExpenseCategory === effectiveCategory;
    const isExplicitCategoryClear =
      !selectedExpenseCategory
      && (
        suppressSuggestedCategory
        || Boolean(manualCategory)
        || Boolean(suggestedCategory)
      );
    const expenseCategoryToSave = isUntouchedSuggestedCategory ? "" : selectedExpenseCategory;
    const annotationPatch = {
      expense_category: expenseCategoryToSave,
      split_type: form.get("split_type") || "",
      split_with: form.get("split_with") || "",
      notes: form.get("notes") || "",
      ready_for_splitwise: form.get("ready_for_splitwise") === "on",
    };

    if (selectedExpenseCategory) {
      annotationPatch.suppress_suggested_category = false;
    } else if (isExplicitCategoryClear) {
      annotationPatch.suppress_suggested_category = Boolean(suggestedCategory);
    }

    const orderId = event.currentTarget.dataset.orderId;
    const previousOrderSnapshot = getOrderSnapshot(orderId);

    applyLocalAnnotation(orderId, annotationPatch);
    patchState(state, { isSaving: true });
    render();
    try {
      const saveResult = await saveAnnotation(orderId, annotationPatch);
      if (saveResult?.order) {
        applyLocalOrder(orderId, saveResult.order);
      } else if (saveResult?.annotation) {
        applyLocalAnnotation(orderId, saveResult.annotation);
      }
      let dataset;
      try {
        dataset = await fetchDataset();
      } catch (error) {
        patchState(state, { isSaving: false });
        window.alert(`Saved annotation, but could not refresh the workspace. ${error.message || ""}`.trim());
        render();
        return;
      }
      replaceDataset(dataset, {
        currentView: state.currentView,
        selectedOrderId: state.selectedOrderId,
      });
      render();
    } catch (error) {
      if (previousOrderSnapshot) {
        applyLocalOrder(orderId, previousOrderSnapshot);
      }
      patchState(state, { isSaving: false });
      window.alert(error.message || "Could not save annotation.");
      render();
    }
  });
}

async function load() {
  if (state.isSaving) {
    return;
  }
  patchState(state, { loading: true, error: "" });
  try {
    const [dataset, syncStatus, syncLogs] = await Promise.all([
      fetchDataset(),
      fetchSyncStatus().catch(() => null),
      fetchSyncLogs().catch(() => ({ lines: [] })),
    ]);
    const previousView = state.currentView;
    const previousSync = state.sync;
    replaceDataset(dataset, {
      currentView: previousView,
      sync: syncStatus
        ? normalizeSyncState(syncStatus, Array.isArray(syncLogs?.lines) ? syncLogs.lines : [])
        : previousSync,
    });
    if (state.sync.status === "running" || state.sync.status === "starting") {
      scheduleSyncPolling();
    }
    render();
  } catch (error) {
    patchState(state, {
      loading: false,
      error: error.message || "Unknown error",
    });
    elements.content.innerHTML = `<div class="empty-state"><h3>Could not load the workspace</h3><p>${error.message || "Unknown error"}</p></div>`;
    elements.refreshButton.disabled = state.isSaving || state.loading;
  }
}

for (const button of elements.navButtons) {
  button.addEventListener("click", () => {
    patchState(state, {
      currentView: button.dataset.view,
      drawerOpen: button.dataset.view === "overview" ? false : state.drawerOpen,
    });
    resetPagination(state);
    render();
  });
}

elements.commandSearch.addEventListener("input", (event) => {
  updateFilters(state, { query: event.target.value });
  resetPagination(state);
  render();
});

window.addEventListener("keydown", (event) => {
  if (event.key !== "/" || event.target.matches("input, select, textarea")) {
    return;
  }
  event.preventDefault();
  elements.commandSearch.focus();
});

elements.refreshButton.addEventListener("click", () => {
  load();
});

elements.syncButton.addEventListener("click", async () => {
  if (state.isSaving || state.loading || state.sync.status === "running" || state.sync.status === "starting") {
    return;
  }
  patchState(state, {
    sync: {
      ...state.sync,
      status: "starting",
      error: "",
    },
  });
  render();
  try {
    const status = await startSync();
    patchState(state, { sync: normalizeSyncState(status, state.sync.logs || []) });
    lastRefreshedSyncId = "";
    if (state.sync.status === "running" || state.sync.status === "starting") {
      scheduleSyncPolling();
    } else if (state.sync.status === "succeeded") {
      lastRefreshedSyncId = state.sync.id || "";
      const dataset = await fetchDataset();
      replaceDataset(dataset);
    }
    render();
  } catch (error) {
    patchState(state, {
      sync: {
        ...state.sync,
        status: "failed",
        error: error.message || "Could not start Zepto sync.",
      },
    });
    window.alert(error.message || "Could not start Zepto sync.");
    render();
  }
});

elements.sidebarToggle.addEventListener("click", () => {
  toggleSidebarCollapsed();
});

applySidebarCollapsedState(readSidebarCollapsedPreference());
load();
