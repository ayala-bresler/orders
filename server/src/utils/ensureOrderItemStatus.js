'use strict';

/**
 * Ensure order_items.status exists (open | completed).
 * Safe to call repeatedly — used at boot and as a lazy repair if schema lag.
 */

const { query } = require('../db');

let ensurePromise = null;

async function ensureOrderItemStatusColumn() {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    await query(`
      ALTER TABLE order_items ADD COLUMN IF NOT EXISTS status VARCHAR(20);
      UPDATE order_items SET status = 'open' WHERE status IS NULL;
      ALTER TABLE order_items ALTER COLUMN status SET DEFAULT 'open';
      ALTER TABLE order_items ALTER COLUMN status SET NOT NULL;
    `);
    try {
      await query(
        `CREATE INDEX IF NOT EXISTS idx_order_items_status ON order_items (order_id, status)`
      );
    } catch {
      /* index may already exist under another definition */
    }
  })().catch((err) => {
    ensurePromise = null;
    throw err;
  });
  return ensurePromise;
}

function isMissingStatusColumnError(err) {
  const msg = String(err && err.message ? err.message : err);
  return (
    err?.code === '42703' ||
    /column\s+.*status.*does not exist/i.test(msg) ||
    /oi\.status/i.test(msg)
  );
}

module.exports = {
  ensureOrderItemStatusColumn,
  isMissingStatusColumnError,
};
