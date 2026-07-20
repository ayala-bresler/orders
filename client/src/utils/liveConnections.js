/**
 * Registry for long-lived connections (WebSocket / EventSource / AbortController).
 * Closed actively on session timeout / logout so Cloud Run does not hold idle sockets.
 */

const connections = new Set();

function safeClose(entry) {
  try {
    if (!entry) return;
    if (typeof entry.abort === 'function') {
      entry.abort();
      return;
    }
    if (typeof entry.close === 'function') {
      entry.close();
      return;
    }
    if (entry.readyState !== undefined && typeof entry.close === 'function') {
      entry.close();
    }
  } catch {
    /* ignore */
  }
}

/** Register a live connection; returns an unregister function. */
export function registerLiveConnection(conn) {
  if (!conn) return () => {};
  connections.add(conn);
  return () => {
    connections.delete(conn);
  };
}

/** Close and clear all registered connections. */
export function closeAllLiveConnections() {
  for (const conn of [...connections]) {
    safeClose(conn);
    connections.delete(conn);
  }
}
