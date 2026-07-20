-- =============================================================================
-- 'hetz-haim' ordering system - PostgreSQL schema
-- =============================================================================
-- Target: Databases -> [DB_NAME] -> Schemas -> public -> Tables
--
-- This schema is idempotent-ish for development: it creates tables only if they
-- do not already exist. Run it against a fresh database, e.g.:
--   psql -h localhost -U postgres -d hetz_haim -f server/db/schema.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1.1 categories
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
    category_id         INTEGER PRIMARY KEY,                 -- Original ID
    category_name       TEXT        NOT NULL,
    parent_category_id  INTEGER     NULL
        REFERENCES categories (category_id) ON DELETE SET NULL
    -- NOTE: legacy "generalName" column intentionally removed.
);

-- -----------------------------------------------------------------------------
-- 1.3 product_types
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_types (
    product_type_code   VARCHAR(10) PRIMARY KEY,             -- e.g. 'GB', 'PR'
    type_name           TEXT        NOT NULL                 -- e.g. 'גביע', 'פרוכת'
);

-- -----------------------------------------------------------------------------
-- 1.2 products
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
    product_code        TEXT        PRIMARY KEY,             -- SKU/Code, NOT serial
    product_name        TEXT        NOT NULL,
    order_action        TEXT        NULL,                    -- action list configuration
    category_id         INTEGER     NULL
        REFERENCES categories (category_id) ON DELETE SET NULL,
    base_price          NUMERIC(12, 2) NOT NULL DEFAULT 0,   -- initialized to 0
    -- physical dimensions
    length              NUMERIC(12, 3) NULL,
    width               NUMERIC(12, 3) NULL,
    height              NUMERIC(12, 3) NULL,
    diameter            NUMERIC(12, 3) NULL,
    weight              NUMERIC(12, 3) NULL,
    warning             TEXT        NULL
);

-- -----------------------------------------------------------------------------
-- models  (lookup for product_variants.model_code)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS models (
    model_code          TEXT        PRIMARY KEY,
    model_name          TEXT        NOT NULL
);

-- -----------------------------------------------------------------------------
-- sizes  (lookup for product_variants.size_code)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sizes (
    size_code           TEXT        PRIMARY KEY,
    size_name           TEXT        NOT NULL
);

-- -------------------------------------------------------------------------
-- product_sizes — selectable parchment diameters per product type + SVG template
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_sizes (
    size_code           TEXT        NOT NULL,
    product_type_code   VARCHAR(10) NOT NULL
        REFERENCES product_types (product_type_code) ON DELETE CASCADE,
    size_name           TEXT        NOT NULL,
    svg_template_file   TEXT        NOT NULL,
    diameter_mm         NUMERIC(12, 3) NULL,
    export_scale_factor NUMERIC(12, 6) NULL,
    sort_order          INTEGER     NOT NULL DEFAULT 0,
    PRIMARY KEY (size_code, product_type_code)
);

-- Reconcile pre-existing product_sizes tables (missing columns from partial migrations).
ALTER TABLE product_sizes ADD COLUMN IF NOT EXISTS size_name           TEXT;
ALTER TABLE product_sizes ADD COLUMN IF NOT EXISTS svg_template_file   TEXT;
ALTER TABLE product_sizes ADD COLUMN IF NOT EXISTS diameter_mm         NUMERIC(12, 3) NULL;
ALTER TABLE product_sizes ADD COLUMN IF NOT EXISTS export_scale_factor NUMERIC(12, 6) NULL;
ALTER TABLE product_sizes ADD COLUMN IF NOT EXISTS sort_order          INTEGER NOT NULL DEFAULT 0;
ALTER TABLE product_sizes ADD COLUMN IF NOT EXISTS supports_verses     BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_product_sizes_type
    ON product_sizes (product_type_code, sort_order);

-- -----------------------------------------------------------------------------
-- 1.4 product_variants
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_variants (
    sku                 VARCHAR(50) PRIMARY KEY,             -- e.g. '4-01-01-075'
    product_code        TEXT        NOT NULL
        REFERENCES products (product_code) ON DELETE CASCADE,
    product_type_code   VARCHAR(10) NULL
        REFERENCES product_types (product_type_code) ON DELETE SET NULL,
    model_code          TEXT        NULL,
    size_code           TEXT        NULL
);

-- -----------------------------------------------------------------------------
-- 1.5 product_actions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_actions (
    action_id           SERIAL      PRIMARY KEY,
    product_code        TEXT        NOT NULL
        REFERENCES products (product_code) ON DELETE CASCADE,
    file_count          INTEGER     NOT NULL DEFAULT 0       -- dynamic action mapping from CSV
);

-- -----------------------------------------------------------------------------
-- customers  (extension: not in the original CSV set, but required so a client
-- can identify with name + phone and find their order on a later visit).
-- orders.customer_id references this table.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
    customer_id     INTEGER     PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
    full_name       TEXT        NOT NULL,
    phone           TEXT        NOT NULL,          -- normalized (digits only)
    email           TEXT        NULL,
    address         TEXT        NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reconcile pre-existing customers tables (add any missing columns/constraints).
ALTER TABLE customers ADD COLUMN IF NOT EXISTS full_name  TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone      TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email      TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address    TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
-- Unique phone: required for find-or-create (ON CONFLICT (phone)).
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_phone ON customers (phone);

-- -----------------------------------------------------------------------------
-- 1.6 orders
-- -----------------------------------------------------------------------------
-- Live/imported DB (product_management) uses this shape. Optional columns such as
-- delivery_method, shipping_address, payment_method, is_paid are NOT present there.
CREATE TABLE IF NOT EXISTS orders (
    order_id                INTEGER     PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
    customer_id             INTEGER     NULL
        REFERENCES customers (customer_id) ON DELETE SET NULL,
    order_date              TIMESTAMPTZ NOT NULL DEFAULT now(),
    estimated_delivery_date DATE        NULL,
    total_amount            NUMERIC(12, 2) NOT NULL DEFAULT 0,
    status                  TEXT        NOT NULL DEFAULT 'draft',
    order_notes             TEXT        NULL
);

-- -----------------------------------------------------------------------------
-- 1.7 order_items  (matches the live/imported table: PK is item_id)
-- -----------------------------------------------------------------------------
-- Each order item is fully customized/unique, so the personalized dimensions,
-- verses/texts and accessories are stored directly on the line item.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_items (
    item_id             INTEGER     PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
    order_id            INTEGER     NOT NULL
        REFERENCES orders (order_id) ON DELETE CASCADE,
    product_code        VARCHAR     NULL
        REFERENCES products (product_code) ON DELETE SET NULL,
    quantity            INTEGER     NOT NULL DEFAULT 1,
    price_at_purchase   NUMERIC     NOT NULL DEFAULT 0,
    model               VARCHAR     NULL,

    -- Manufacturing parameters / accessories
    parchment_diameter  NUMERIC     NULL,
    plate_diameter      NUMERIC     NULL,
    parchment_height    NUMERIC     NULL,
    has_stones          BOOLEAN     NULL,
    stones_color        VARCHAR     NULL,
    has_crown           BOOLEAN     NULL,
    crown_model         VARCHAR     NULL,
    has_breastplate     BOOLEAN     NULL,
    breastplate_model   VARCHAR     NULL,
    has_pointer         BOOLEAN     NULL,
    pointer_model       VARCHAR     NULL,
    parochet_height             NUMERIC NULL,
    parochet_length             NUMERIC NULL,
    parochet_width              NUMERIC NULL,
    parochet_inner_circle_diameter      NUMERIC NULL,
    parochet_center_to_center_distance  NUMERIC NULL,
    customer_notes      TEXT        NULL,

    -- Custom verse / text placement: 4 corners x 2 text zones = 8 columns.
    -- text_1 = inner ring, text_2 = outer ring (see server/src/config/template.js)
    verse_top_right_text_1      TEXT NULL,
    verse_top_right_text_2      TEXT NULL,
    verse_top_left_text_1       TEXT NULL,
    verse_top_left_text_2       TEXT NULL,
    verse_bottom_right_text_1   TEXT NULL,
    verse_bottom_right_text_2   TEXT NULL,
    verse_bottom_left_text_1    TEXT NULL,
    verse_bottom_left_text_2    TEXT NULL,

    -- Serialized customized SVG snapshot (the "new copy") linked to this line.
    -- The master template itself is never modified.
    customized_svg      TEXT        NULL,
    customized_svg_path TEXT        NULL,
    -- Per-verse font scale multipliers (field key -> 0.4..1.0), preview + snapshot.
    verse_font_scales   JSONB       NULL
);

-- Additive reconciliation for a pre-existing order_items table: only the SVG
-- snapshot columns are new (the 8 verse columns already exist in the live DB).
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS customized_svg      TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS customized_svg_path TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS verse_font_scales   JSONB;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS crown_model        VARCHAR;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS breastplate_model  VARCHAR;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS pointer_model      VARCHAR;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS size_code          TEXT NULL;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_type_code  VARCHAR(10) NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_order_id  ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_code ON product_variants (product_code);
