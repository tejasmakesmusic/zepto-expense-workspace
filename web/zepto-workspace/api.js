async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  return response.json();
}

export function fetchDataset() {
  return fetchJson("/api/dataset");
}

export function startSync() {
  return fetchJson("/api/sync/start", { method: "POST" });
}

export function fetchSyncStatus() {
  return fetchJson("/api/sync/status");
}

export function fetchSyncLogs() {
  return fetchJson("/api/sync/logs");
}

export function saveAnnotation(orderId, patch) {
  return fetchJson(`/api/annotations/${encodeURIComponent(orderId)}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(patch),
  });
}

export function saveLineItemAnnotation(lineItemKey, patch) {
  return fetchJson(`/api/line-item-annotations/${encodeURIComponent(lineItemKey)}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(patch),
  });
}

export function fetchAiSettings() {
  return fetchJson("/api/ai/settings");
}

export function saveAiSettings(patch) {
  return fetchJson("/api/ai/settings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(patch),
  });
}

export function testAiConnection() {
  return fetchJson("/api/ai/test", { method: "POST" });
}

export function runAiAction(action, payload = {}) {
  return fetchJson(`/api/ai/run/${encodeURIComponent(action)}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export function applyLineItemSuggestions(suggestions) {
  return fetchJson("/api/ai/apply-line-item-suggestions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ suggestions }),
  });
}
