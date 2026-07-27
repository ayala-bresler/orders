-- =============================================================================
-- Delta only — for DBs that ALREADY have base tables (stores, customers, …)
-- Synced to current local pgAdmin DB: product_management (2026-07-27)
--
-- Does NOT create stores / customers from scratch.
-- Idempotent — safe to re-run on Railway / local.
--
-- Apply (Railway): paste into Query Tool, or:
--   set DATABASE_URL=... && node server/scripts/apply-store-delta.js
-- =============================================================================

-- -----------------------------------------------------------------------------
-- stores — auth / email columns (additive)
-- Live columns after this: store_id, store_name, store_address,
--   activation_code, password_hash, percentage, store_email,
--   smtp_host, smtp_port, smtp_user, smtp_pass_encrypted
-- -----------------------------------------------------------------------------
ALTER TABLE stores ADD COLUMN IF NOT EXISTS activation_code      VARCHAR(64)     NULL;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS password_hash        TEXT            NULL;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS percentage           NUMERIC(5, 2)   NULL DEFAULT 0.00;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS store_email          VARCHAR(255)    NULL;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS smtp_host            VARCHAR(255)    NULL;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS smtp_port            INTEGER         NULL;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS smtp_user            VARCHAR(255)    NULL;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS smtp_pass_encrypted  TEXT            NULL;

-- If legacy discount_percentage exists, copy into percentage once
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'stores'
       AND column_name = 'discount_percentage'
  ) THEN
    UPDATE stores
       SET percentage = discount_percentage
     WHERE percentage IS NULL
       AND discount_percentage IS NOT NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS stores_activation_code_key
    ON stores (activation_code)
 WHERE activation_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS stores_store_name_key
    ON stores (store_name);

-- -----------------------------------------------------------------------------
-- customers — link to store
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
-- store_sessions — long-lived store cookie sessions
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

-- Keep SERIAL in sync if store_id was inserted manually
SELECT setval(
  pg_get_serial_sequence('stores', 'store_id'),
  COALESCE((SELECT MAX(store_id) FROM stores), 1),
  true
);
