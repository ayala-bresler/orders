'use strict';

/**
 * Ensure order/item status columns use the four workflow values.
 * Safe to call repeatedly — used at boot and as a lazy repair if schema lag.
 */

const { query } = require('../db');

let ensurePromise = null;

async function ensureOrderItemStatusColumn() {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    await query(`
      ALTER TABLE order_items ADD COLUMN IF NOT EXISTS status VARCHAR(20);
      UPDATE order_items SET status = 'pending_approval' WHERE status IS NULL;
      ALTER TABLE order_items ALTER COLUMN status SET DEFAULT 'pending_approval';
      ALTER TABLE order_items ALTER COLUMN status SET NOT NULL;

      UPDATE order_items oi
         SET status = CASE
               WHEN lower(btrim(COALESCE(o.status, ''))) = 'open' THEN 'approved'
               ELSE 'pending_approval'
             END
        FROM orders o
       WHERE oi.order_id = o.order_id
         AND lower(btrim(COALESCE(o.status, ''))) NOT IN (
               'pending_approval', 'approved', 'finished', 'sent'
             );

      UPDATE orders
         SET status = CASE lower(btrim(COALESCE(status, '')))
               WHEN 'open' THEN 'approved'
               WHEN 'pending_approval' THEN 'pending_approval'
               WHEN 'approved' THEN 'approved'
               WHEN 'finished' THEN 'finished'
               WHEN 'sent' THEN 'sent'
               ELSE 'pending_approval'
             END;
      ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'pending_approval';
      ALTER TABLE orders ALTER COLUMN status SET NOT NULL;

      UPDATE order_items
         SET status = CASE lower(btrim(COALESCE(status, '')))
               WHEN 'pending_approval' THEN 'pending_approval'
               WHEN 'approved' THEN 'approved'
               WHEN 'finished' THEN 'finished'
               WHEN 'sent' THEN 'sent'
               WHEN 'open' THEN 'approved'
               ELSE 'pending_approval'
             END
       WHERE lower(btrim(COALESCE(status, ''))) NOT IN (
               'pending_approval', 'approved', 'finished', 'sent'
             );
      ALTER TABLE order_items ALTER COLUMN status SET DEFAULT 'pending_approval';

      ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
      ALTER TABLE orders ADD CONSTRAINT orders_status_check
        CHECK (status IN ('pending_approval', 'approved', 'finished', 'sent'));
      ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_status_check;
      ALTER TABLE order_items ADD CONSTRAINT order_items_status_check
        CHECK (status IN ('pending_approval', 'approved', 'finished', 'sent'));
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
