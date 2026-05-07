function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeMonth(isoString) {
  const text = String(isoString || "");
  return /^\d{4}-\d{2}/.test(text) ? text.slice(0, 7) : "";
}

function sortOrders(orders, sortMode) {
  const next = [...orders];
  switch (sortMode) {
    case "date_asc":
      next.sort((left, right) => String(left.order_date_iso || "").localeCompare(String(right.order_date_iso || "")));
      break;
    case "amount_desc":
      next.sort((left, right) => Number(right.order_amount_value || 0) - Number(left.order_amount_value || 0));
      break;
    case "amount_asc":
      next.sort((left, right) => Number(left.order_amount_value || 0) - Number(right.order_amount_value || 0));
      break;
    case "date_desc":
    default:
      next.sort((left, right) => String(right.order_date_iso || "").localeCompare(String(left.order_date_iso || "")));
      break;
  }
  return next;
}

function sortLineItems(lineItems, sortMode) {
  const next = [...lineItems];
  switch (sortMode) {
    case "date_asc":
      next.sort((left, right) => String(left.order_date_iso || "").localeCompare(String(right.order_date_iso || "")));
      break;
    case "amount_desc":
      next.sort((left, right) => Number(right.line_total_amount || 0) - Number(left.line_total_amount || 0));
      break;
    case "amount_asc":
      next.sort((left, right) => Number(left.line_total_amount || 0) - Number(right.line_total_amount || 0));
      break;
    case "date_desc":
    default:
      next.sort((left, right) => String(right.order_date_iso || "").localeCompare(String(left.order_date_iso || "")));
      break;
  }
  return next;
}

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
export const DEFAULT_PAGE_SIZE = 25;

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePageSize(value) {
  return normalizePositiveInteger(value, DEFAULT_PAGE_SIZE);
}

function buildPaginationSummary(pagination = {}, totalItems = 0) {
  const pageSize = normalizePageSize(pagination.pageSize);
  const safeTotalItems = Math.max(0, normalizePositiveInteger(totalItems, 0));
  const totalPages = Math.max(1, Math.ceil(safeTotalItems / pageSize));
  const page = Math.min(Math.max(1, normalizePositiveInteger(pagination.page, 1)), totalPages);
  const startItem = safeTotalItems === 0 ? 0 : ((page - 1) * pageSize) + 1;
  const endItem = Math.min(page * pageSize, safeTotalItems);

  return {
    page,
    pageSize,
    totalItems: safeTotalItems,
    totalPages,
    startItem,
    endItem,
    hasPrevious: page > 1,
    hasNext: page < totalPages,
  };
}

function matchesFilters(order, filters) {
  if (filters.status !== "all" && order.reconciliation_status !== filters.status) {
    return false;
  }
  if (filters.month !== "all" && order.order_month !== filters.month) {
    return false;
  }
  if (filters.orderState === "delivered" && !normalizeText(order.order_status_text).includes("delivered")) {
    return false;
  }
  if (filters.orderState === "cancelled" && !normalizeText(order.order_status_text).includes("cancelled")) {
    return false;
  }
  if (filters.invoiceMode === "invoice_only" && (!order.has_invoice || order.has_html_fallback)) {
    return false;
  }
  if (filters.invoiceMode === "html_fallback_only" && (!order.has_html_fallback || order.has_invoice)) {
    return false;
  }
  if (filters.invoiceMode === "missing_invoice_only" && order.has_invoice) {
    return false;
  }
  if (filters.readyState === "ready" && !order.annotations?.ready_for_splitwise) {
    return false;
  }
  if (filters.readyState === "not_ready" && order.annotations?.ready_for_splitwise) {
    return false;
  }
  if (filters.query && !normalizeText(order.search_text).includes(normalizeText(filters.query))) {
    return false;
  }
  return true;
}

function matchesLineItemFilters(lineItem, filters) {
  if (filters.status !== "all" && lineItem.reconciliation_status !== filters.status) {
    return false;
  }
  if (filters.month !== "all" && lineItem.order_month !== filters.month) {
    return false;
  }
  if (filters.category !== "all" && lineItem.effective_category !== filters.category) {
    return false;
  }
  if ((filters.splitType || "all") !== "all" && (lineItem.split_type || "") !== filters.splitType) {
    return false;
  }
  if (filters.orderState === "delivered" && !normalizeText(lineItem.order_status_text).includes("delivered")) {
    return false;
  }
  if (filters.orderState === "cancelled" && !normalizeText(lineItem.order_status_text).includes("cancelled")) {
    return false;
  }
  if (filters.invoiceMode === "invoice_only" && !lineItem.has_invoice) {
    return false;
  }
  if (filters.invoiceMode === "html_fallback_only" || filters.invoiceMode === "missing_invoice_only") {
    return false;
  }
  if (filters.parseQuality !== "all" && lineItem.parse_quality !== filters.parseQuality) {
    return false;
  }
  if (filters.readyState === "ready" && !lineItem.ready_for_splitwise) {
    return false;
  }
  if (filters.readyState === "not_ready" && lineItem.ready_for_splitwise) {
    return false;
  }
  if (filters.query && !normalizeText(lineItem.search_text).includes(normalizeText(filters.query))) {
    return false;
  }
  return true;
}

function matchesWorkbenchFilters(issue, order, filters) {
  if ((filters.workbenchType || "all") !== "all" && issue.issue_type !== filters.workbenchType) {
    return false;
  }
  if (filters.status !== "all" && issue.reconciliation_status !== filters.status) {
    return false;
  }
  if (filters.month !== "all" && safeMonth(issue.order_date_iso) !== filters.month) {
    return false;
  }
  if (filters.orderState === "delivered" && !normalizeText(order?.order_status_text).includes("delivered")) {
    return false;
  }
  if (filters.orderState === "cancelled" && !normalizeText(order?.order_status_text).includes("cancelled")) {
    return false;
  }
  if (filters.invoiceMode === "invoice_only" && (!issue.has_invoice || issue.has_html_fallback)) {
    return false;
  }
  if (filters.invoiceMode === "html_fallback_only" && (!issue.has_html_fallback || issue.has_invoice)) {
    return false;
  }
  if (filters.invoiceMode === "missing_invoice_only" && issue.has_invoice) {
    return false;
  }
  if (filters.readyState === "ready" && issue.issue_type === "not_ready_for_split") {
    return false;
  }
  if (filters.readyState === "not_ready" && issue.issue_type !== "not_ready_for_split") {
    return false;
  }
  if (filters.query) {
    const queryText = normalizeText([
      issue.order_id,
      issue.issue_type,
      issue.title,
      issue.detail,
      order?.search_text || "",
    ].join(" "));
    if (!queryText.includes(normalizeText(filters.query))) {
      return false;
    }
  }
  return true;
}

export function createInitialState(dataset) {
  return {
    dataset,
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
    selectedOrderId: dataset.orders[0]?.order_id || "",
    selectedLineItemKey: "",
    pagination: {
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    },
    drawerOpen: false,
    isSaving: false,
    loading: false,
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
}

export function patchState(state, patch) {
  Object.assign(state, patch);
  return state;
}

export function updateFilters(state, patch) {
  state.filters = {
    ...state.filters,
    ...patch,
  };
  return state;
}

export function updatePagination(state, patch = {}) {
  const current = state.pagination || {};
  const nextPageSize = patch.pageSize === undefined ? normalizePageSize(current.pageSize) : normalizePageSize(patch.pageSize);
  const pageSizeChanged = nextPageSize !== normalizePageSize(current.pageSize);
  state.pagination = {
    page: pageSizeChanged ? 1 : normalizePositiveInteger(patch.page ?? current.page, 1),
    pageSize: nextPageSize,
  };
  return state;
}

export function resetPagination(state) {
  state.pagination = {
    page: 1,
    pageSize: normalizePageSize(state.pagination?.pageSize),
  };
  return state;
}

export function paginateItems(items, pagination = {}) {
  const sourceItems = Array.isArray(items) ? items : [];
  const summary = buildPaginationSummary(pagination, sourceItems.length);
  const startIndex = summary.startItem === 0 ? 0 : summary.startItem - 1;
  const endIndex = summary.endItem;
  return {
    items: sourceItems.slice(startIndex, endIndex),
    summary,
  };
}

export function getAvailableMonths(dataset) {
  return [...new Set(dataset.orders.map((order) => order.order_month).filter(Boolean))].sort();
}

export function getSelectedOrder(state) {
  return state.dataset.orders.find((order) => order.order_id === state.selectedOrderId) || null;
}

export function getVisibleOrders(state) {
  let orders = state.dataset.orders.filter((order) => matchesFilters(order, state.filters));

  if (state.currentView === "exceptions") {
    orders = orders.filter((order) => order.is_exception);
  }

  if (state.currentView === "split-review") {
    orders = orders.filter((order) =>
      order.annotations?.expense_category ||
      order.annotations?.split_type ||
      order.annotations?.split_with ||
      order.annotations?.notes ||
      order.annotations?.ready_for_splitwise
    ).concat(
      orders.filter((order) =>
        !(
          order.annotations?.expense_category ||
          order.annotations?.split_type ||
          order.annotations?.split_with ||
          order.annotations?.notes ||
          order.annotations?.ready_for_splitwise
        )
      ),
    );
  }

  return sortOrders(orders, state.filters.sort);
}

export function getVisibleLineItems(state) {
  const lineItems = (state.dataset.lineItems || []).filter((lineItem) => matchesLineItemFilters(lineItem, state.filters));
  return sortLineItems(lineItems, state.filters.sort);
}

export function getVisibleWorkbenchIssues(state) {
  const ordersById = new Map((state.dataset.orders || []).map((order) => [order.order_id, order]));
  const issues = (state.dataset.workbench?.issues || []).filter((issue) =>
    matchesWorkbenchFilters(issue, ordersById.get(issue.order_id), state.filters)
  );
  return sortOrders(issues, state.filters.sort);
}

export function summarizeVisibleLineItems(lineItems) {
  return {
    lineItemCount: lineItems.length,
    uniqueOrderCount: new Set(lineItems.map((lineItem) => lineItem.order_id).filter(Boolean)).size,
    uniqueInvoiceCount: new Set(lineItems.map((lineItem) => lineItem.invoice_number).filter(Boolean)).size,
    totalSpend: Number(lineItems.reduce((sum, lineItem) => sum + safeNumber(lineItem.line_total_amount), 0).toFixed(2)),
  };
}
