-- =============================================================================
-- 'hetz-haim' ordering system - PostgreSQL schema
-- =============================================================================
-- Synced from live DB (pgAdmin): product_management / public
-- Last inspected against the running database; keep this file as source of truth.
--
-- Idempotent for development: CREATE IF NOT EXISTS + additive ALTER IF NOT EXISTS.
-- Run example:
--   psql -h localhost -U postgres -d product_management -f server/db/schema.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- actions  (lookup for product_actions.action_id)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS actions (
    action_id       INTEGER         PRIMARY KEY,
    action_name     VARCHAR(100)    NOT NULL
);

-- -----------------------------------------------------------------------------
-- stores  (optional link from customers.store_id)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stores (
    store_id                SERIAL          PRIMARY KEY,
    store_name              VARCHAR(100)    NOT NULL,
    store_address           VARCHAR(255)    NULL,
    discount_percentage     NUMERIC(5, 2)   NULL DEFAULT 0.00
);

CREATE UNIQUE INDEX IF NOT EXISTS stores_store_name_key
    ON stores (store_name);

-- Store auth + SMTP (additive; see also db/migrations/001_store_auth_and_smtp.sql)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS activation_code      VARCHAR(64)     NULL;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS password_hash        TEXT            NULL;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS percentage           NUMERIC(5, 2)   NULL DEFAULT 0.00;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS store_email          VARCHAR(255)    NULL;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS smtp_host            VARCHAR(255)    NULL;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS smtp_port            INTEGER         NULL;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS smtp_user            VARCHAR(255)    NULL;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS smtp_pass_encrypted  TEXT            NULL;

CREATE UNIQUE INDEX IF NOT EXISTS stores_activation_code_key
    ON stores (activation_code)
 WHERE activation_code IS NOT NULL;

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

-- -----------------------------------------------------------------------------
-- categories
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
    category_id         INTEGER         PRIMARY KEY,
    category_name       VARCHAR(150)    NOT NULL,
    parent_category_id  INTEGER         NULL
        REFERENCES categories (category_id)
);

-- -----------------------------------------------------------------------------
-- product_types
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_types (
    product_type_code   VARCHAR(10)     PRIMARY KEY,
    type_name           VARCHAR(50)     NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS product_types_type_name_key
    ON product_types (type_name);

-- -----------------------------------------------------------------------------
-- products
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
    product_code        VARCHAR(50)     PRIMARY KEY,
    product_name        VARCHAR(150)    NOT NULL,
    category_id         INTEGER         NULL
        REFERENCES categories (category_id),
    base_price          NUMERIC(10, 2)  NULL DEFAULT 0.00,
    length              NUMERIC(5, 2)   NULL,
    width               NUMERIC(5, 2)   NULL,
    height              NUMERIC(5, 2)   NULL,
    diameter            NUMERIC(5, 2)   NULL,
    weight              NUMERIC(9, 2)   NULL,
    warning             TEXT            NULL,
    order_action        TEXT            NULL
);

-- -----------------------------------------------------------------------------
-- models  (lookup for product_variants / accessory models)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS models (
    model_code          VARCHAR(10)     PRIMARY KEY,
    model_name          VARCHAR(150)    NOT NULL
);

-- -----------------------------------------------------------------------------
-- sizes  (lookup for product_variants.size_code / product_sizes.size_code)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sizes (
    size_code           VARCHAR(10)     PRIMARY KEY,
    size_name           VARCHAR(50)     NOT NULL
);

-- -----------------------------------------------------------------------------
-- product_sizes — selectable parchment diameters per product type + SVG template
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_sizes (
    product_type_code   VARCHAR(10)     NOT NULL
        REFERENCES product_types (product_type_code) ON DELETE SET NULL,
    size_code           VARCHAR         NOT NULL
        REFERENCES sizes (size_code) ON DELETE CASCADE,
    size_name           TEXT            NULL,
    svg_template_file   TEXT            NULL,
    diameter_mm         NUMERIC(12, 3)  NULL,
    export_scale_factor NUMERIC(12, 6)  NULL,
    sort_order          INTEGER         NOT NULL DEFAULT 0,
    supports_verses     BOOLEAN         NOT NULL DEFAULT TRUE,
    PRIMARY KEY (product_type_code, size_code)
);

ALTER TABLE product_sizes ADD COLUMN IF NOT EXISTS size_name           TEXT;
ALTER TABLE product_sizes ADD COLUMN IF NOT EXISTS svg_template_file   TEXT;
ALTER TABLE product_sizes ADD COLUMN IF NOT EXISTS diameter_mm         NUMERIC(12, 3);
ALTER TABLE product_sizes ADD COLUMN IF NOT EXISTS export_scale_factor NUMERIC(12, 6);
ALTER TABLE product_sizes ADD COLUMN IF NOT EXISTS sort_order          INTEGER NOT NULL DEFAULT 0;
ALTER TABLE product_sizes ADD COLUMN IF NOT EXISTS supports_verses     BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_product_sizes_type
    ON product_sizes (product_type_code, sort_order);

-- -----------------------------------------------------------------------------
-- product_variants
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_variants (
    sku                 VARCHAR(50)     PRIMARY KEY,
    product_code        VARCHAR(50)     NOT NULL
        REFERENCES products (product_code),
    model_code          VARCHAR(10)     NULL
        REFERENCES models (model_code),
    size_code           VARCHAR(10)     NULL
        REFERENCES sizes (size_code),
    product_type_code   VARCHAR(10)     NULL
        REFERENCES product_types (product_type_code) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_product_variants_code
    ON product_variants (product_code);

-- -----------------------------------------------------------------------------
-- product_actions  (product ↔ action mapping)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_actions (
    product_code        VARCHAR(50)     NOT NULL
        REFERENCES products (product_code) ON DELETE CASCADE,
    action_id           INTEGER         NOT NULL
        REFERENCES actions (action_id) ON DELETE CASCADE,
    file_count          INTEGER         NULL DEFAULT 0,
    action_order        INTEGER         NULL DEFAULT 1,
    PRIMARY KEY (product_code, action_id)
);

ALTER TABLE product_actions ADD COLUMN IF NOT EXISTS file_count   INTEGER DEFAULT 0;
ALTER TABLE product_actions ADD COLUMN IF NOT EXISTS action_order INTEGER DEFAULT 1;

-- -----------------------------------------------------------------------------
-- customers
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
    customer_id     SERIAL          PRIMARY KEY,
    full_name       VARCHAR(100)    NOT NULL,
    phone           VARCHAR(20)     NOT NULL,
    email           VARCHAR(100)    NULL,
    store_id        INTEGER         NULL
        REFERENCES stores (store_id),
    created_at      TIMESTAMP       NULL DEFAULT CURRENT_TIMESTAMP,
    address         TEXT            NULL
);

ALTER TABLE customers ADD COLUMN IF NOT EXISTS full_name  VARCHAR(100);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone      VARCHAR(20);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email      VARCHAR(100);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS store_id   INTEGER;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address    TEXT;

CREATE INDEX IF NOT EXISTS idx_customers_store_id ON customers (store_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_phone ON customers (phone);

-- -----------------------------------------------------------------------------
-- orders
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
    order_id                SERIAL          PRIMARY KEY,
    customer_id             INTEGER         NOT NULL
        REFERENCES customers (customer_id) ON DELETE CASCADE,
    order_date              TIMESTAMP       NULL DEFAULT CURRENT_TIMESTAMP,
    estimated_delivery_date DATE            NULL,
    total_amount            NUMERIC(10, 2)  NULL DEFAULT 0.00,
    status                  VARCHAR(50)     NULL DEFAULT 'Pending'
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_delivery_date DATE;

-- -----------------------------------------------------------------------------
-- order_items
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_items (
    item_id             SERIAL          PRIMARY KEY,
    order_id            INTEGER         NULL
        REFERENCES orders (order_id) ON DELETE CASCADE,
    product_code        VARCHAR(50)     NULL
        REFERENCES products (product_code) ON DELETE SET NULL,
    quantity            INTEGER         NOT NULL DEFAULT 1,
    price_at_purchase   NUMERIC(10, 2)  NOT NULL,
    model               VARCHAR(100)    NULL,

    parchment_diameter  NUMERIC(5, 2)   NULL,
    plate_diameter      NUMERIC(5, 2)   NULL,
    parchment_height    NUMERIC(5, 2)   NULL,
    has_stones          BOOLEAN         NULL DEFAULT FALSE,
    stones_color        VARCHAR(50)     NULL,
    has_crown           BOOLEAN         NULL DEFAULT FALSE,
    has_crown_rimmonim  BOOLEAN         NULL DEFAULT FALSE,
    has_rimmonim        BOOLEAN         NULL DEFAULT FALSE,
    has_coat            BOOLEAN         NULL DEFAULT FALSE,
    has_breastplate     BOOLEAN         NULL DEFAULT FALSE,
    has_pointer         BOOLEAN         NULL DEFAULT FALSE,
    crown_model         VARCHAR(10)     NULL
        REFERENCES models (model_code) ON DELETE SET NULL,
    crown_rimmonim_model VARCHAR(10)    NULL
        REFERENCES models (model_code) ON DELETE SET NULL,
    rimmonim_model      VARCHAR(10)     NULL
        REFERENCES models (model_code) ON DELETE SET NULL,
    coat_model          VARCHAR(10)     NULL
        REFERENCES models (model_code) ON DELETE SET NULL,
    breastplate_model   VARCHAR(10)     NULL
        REFERENCES models (model_code) ON DELETE SET NULL,
    pointer_model       VARCHAR(10)     NULL
        REFERENCES models (model_code) ON DELETE SET NULL,

    parochet_height                     NUMERIC(5, 2) NULL,
    parochet_length                     NUMERIC(5, 2) NULL,
    parochet_width                      NUMERIC(5, 2) NULL,
    parochet_inner_circle_diameter      NUMERIC(5, 2) NULL,
    parochet_center_to_center_distance  NUMERIC(5, 2) NULL,
    customer_notes      TEXT            NULL,

    -- Custom verse / text: 4 corners × 2 rings (text_1 = inner, text_2 = outer)
    verse_top_right_text_1      TEXT NULL,
    verse_top_right_text_2      TEXT NULL,
    verse_top_left_text_1       TEXT NULL,
    verse_top_left_text_2       TEXT NULL,
    verse_bottom_right_text_1   TEXT NULL,
    verse_bottom_right_text_2   TEXT NULL,
    verse_bottom_left_text_1    TEXT NULL,
    verse_bottom_left_text_2    TEXT NULL,

    customized_svg      TEXT            NULL,
    customized_svg_path TEXT            NULL,
    verse_font_scales   JSONB           NULL,
    size_code           TEXT            NULL,
    product_type_code   VARCHAR(10)     NULL,
    -- open = editable; completed = finished (DXF/PDF sent), kept on the order page
    status              VARCHAR(20)     NOT NULL DEFAULT 'open'
);

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS customized_svg      TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS customized_svg_path TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS verse_font_scales   JSONB;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS crown_model         VARCHAR(10);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS breastplate_model   VARCHAR(10);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS pointer_model       VARCHAR(10);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS has_crown_rimmonim  BOOLEAN DEFAULT FALSE;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS crown_rimmonim_model VARCHAR(10);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS has_rimmonim        BOOLEAN DEFAULT FALSE;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS rimmonim_model      VARCHAR(10);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS has_coat            BOOLEAN DEFAULT FALSE;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS coat_model          VARCHAR(10);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS customer_notes      TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS size_code           TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_type_code   VARCHAR(10);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS status              VARCHAR(20);
UPDATE order_items SET status = 'open' WHERE status IS NULL;
ALTER TABLE order_items ALTER COLUMN status SET DEFAULT 'open';
ALTER TABLE order_items ALTER COLUMN status SET NOT NULL;

-- Move legacy order-level notes onto items, then drop orders.order_notes.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_notes TEXT;
UPDATE order_items oi
   SET customer_notes = o.order_notes
  FROM orders o
 WHERE oi.order_id = o.order_id
   AND (oi.customer_notes IS NULL OR BTRIM(oi.customer_notes) = '')
   AND o.order_notes IS NOT NULL
   AND BTRIM(o.order_notes) <> '';
ALTER TABLE orders DROP COLUMN IF EXISTS order_notes;

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_status ON order_items (order_id, status);

-- Accessory product types (orderable via order_items has_* / *_model columns).
INSERT INTO product_types (product_type_code, type_name)
SELECT v.product_type_code, v.type_name
FROM (VALUES
    ('CRM', 'כתר-רימונים'),
    ('RM',  'רימונים'),
    ('ML',  'מעיל')
) AS v(product_type_code, type_name)
WHERE NOT EXISTS (SELECT 1 FROM product_types pt WHERE pt.type_name = v.type_name)
  AND NOT EXISTS (SELECT 1 FROM product_types pt WHERE pt.product_type_code = v.product_type_code);

-- All plate sizes for accessory types (no verse SVG templates).
INSERT INTO sizes (size_code, size_name)
SELECT v.size_code, v.size_name
FROM (VALUES
  ('7.5', '7.5'),
  ('9',   '9'),
  ('11',  '11'),
  ('12',  '12'),
  ('13',  '13'),
  ('14',  '14'),
  ('15',  '15'),
  ('16',  '16')
) AS v(size_code, size_name)
ON CONFLICT (size_code) DO UPDATE SET size_name = EXCLUDED.size_name;

INSERT INTO product_sizes (
  size_code, product_type_code, size_name, svg_template_file,
  diameter_mm, export_scale_factor, sort_order, supports_verses
)
SELECT
  s.size_code, t.product_type_code, s.size_name, NULL,
  s.diameter_mm, 0.352778, s.sort_order, FALSE
FROM (VALUES
  ('7.5', '7.5', 7.5, 1),
  ('9',   '9',   9,   2),
  ('11',  '11',  11,  3),
  ('12',  '12',  12,  4),
  ('13',  '13',  13,  5),
  ('14',  '14',  14,  6),
  ('15',  '15',  15,  7),
  ('16',  '16',  16,  8)
) AS s(size_code, size_name, diameter_mm, sort_order)
CROSS JOIN (VALUES ('CRM'), ('RM'), ('ML')) AS t(product_type_code)
WHERE EXISTS (SELECT 1 FROM product_types pt WHERE pt.product_type_code = t.product_type_code)
ON CONFLICT (size_code, product_type_code) DO UPDATE SET
  size_name = EXCLUDED.size_name,
  diameter_mm = EXCLUDED.diameter_mm,
  export_scale_factor = EXCLUDED.export_scale_factor,
  sort_order = EXCLUDED.sort_order,
  supports_verses = EXCLUDED.supports_verses;