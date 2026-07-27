-- =============================================================================
-- Migration 001: Store activation/auth, SMTP settings, long-lived store sessions
-- Idempotent — safe to re-run.
-- Apply:
--   node server/scripts/apply-store-migration.js
--   (or: npm --prefix server run db:migrate-stores)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- stores — auth + SMTP profile columns
-- -----------------------------------------------------------------------------
ALTER TABLE stores ADD COLUMN IF NOT EXISTS activation_code      VARCHAR(64)     NULL;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS password_hash        TEXT            NULL;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS percentage           NUMERIC(5, 2)   NULL DEFAULT 0.00;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS store_email          VARCHAR(255)    NULL;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS smtp_host            VARCHAR(255)    NULL;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS smtp_port            INTEGER         NULL;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS smtp_user            VARCHAR(255)    NULL;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS smtp_pass_encrypted  TEXT            NULL;

-- Backfill percentage from legacy discount_percentage when present
UPDATE stores
   SET percentage = discount_percentage
 WHERE percentage IS NULL
   AND discount_percentage IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS stores_activation_code_key
    ON stores (activation_code)
 WHERE activation_code IS NOT NULL;

-- -----------------------------------------------------------------------------
-- customers — ensure store_id link exists
-- -----------------------------------------------------------------------------
ALTER TABLE customers ADD COLUMN IF NOT EXISTS store_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_store_id_fkey'
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT customers_store_id_fkey
      FOREIGN KEY (store_id) REFERENCES stores (store_id);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_customers_store_id ON customers (store_id);

-- -----------------------------------------------------------------------------
-- store_sessions — HTTP-only cookie tokens (no practical expiry)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS store_sessions (
    session_id      SERIAL          PRIMARY KEY,
    store_id        INTEGER         NOT NULL
        REFERENCES stores (store_id) ON DELETE CASCADE,
    token_hash      VARCHAR(128)    NOT NULL,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS store_sessions_token_hash_key
    ON store_sessions (token_hash);

CREATE INDEX IF NOT EXISTS idx_store_sessions_store_id
    ON store_sessions (store_id);

-- Keep SERIAL in sync when rows were inserted with explicit store_id values
SELECT setval(
  pg_get_serial_sequence('stores', 'store_id'),
  COALESCE((SELECT MAX(store_id) FROM stores), 1),
  true
);

-- Drop legacy per-store SMTP credentials (mail uses system SMTP + store_email only)
UPDATE stores
   SET smtp_host = NULL,
       smtp_port = NULL,
       smtp_user = NULL,
       smtp_pass_encrypted = NULL;


