-- =============================================================================
-- OPTIONAL demo/seed data for the personalization flow.
--
-- NOT needed if the real data is already imported from Z:\תיק מוצר\איילי\data.
-- Written defensively (WHERE NOT EXISTS) so it is a harmless no-op on a DB that
-- already contains category 4 / the 'עץ חיים' type / products.
-- =============================================================================

-- Category 4 = סת"ם (only added if missing).
INSERT INTO categories (category_id, category_name, parent_category_id)
SELECT 4, 'סת"ם', NULL
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE category_id = 4);

-- Product types (guarded on the natural-unique type_name to avoid collisions
-- with real data that may use different codes, e.g. '01' for עץ חיים).
INSERT INTO product_types (product_type_code, type_name)
SELECT 'EC', 'עץ חיים'
WHERE NOT EXISTS (SELECT 1 FROM product_types WHERE type_name = 'עץ חיים');

-- Sample products in category 4 (only if the category has none yet).
INSERT INTO products (product_code, product_name, category_id, base_price)
SELECT v.product_code, v.product_name, 4, 0
FROM (VALUES
    ('DEMO-EC-01', 'עץ חיים לדוגמה'),
    ('DEMO-GB-01', 'גביע לדוגמה')
) AS v(product_code, product_name)
WHERE NOT EXISTS (SELECT 1 FROM products WHERE category_id = 4)
  AND NOT EXISTS (SELECT 1 FROM products p WHERE p.product_code = v.product_code);

-- Sample variants for the demo products (link the עץ חיים demo to the עץ חיים type).
INSERT INTO product_variants (sku, product_code, product_type_code, model_code, size_code)
SELECT 'DEMO-EC-01-075', 'DEMO-EC-01',
       (SELECT product_type_code FROM product_types WHERE type_name = 'עץ חיים' LIMIT 1),
       '01', '075'
WHERE EXISTS (SELECT 1 FROM products WHERE product_code = 'DEMO-EC-01')
  AND NOT EXISTS (SELECT 1 FROM product_variants WHERE sku = 'DEMO-EC-01-075');
