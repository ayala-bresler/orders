-- Product type '01' (עץ חיים) — plate diameters + SVG templates.
-- svg_template_file is relative to server/templates/

INSERT INTO product_types (product_type_code, type_name)
SELECT '01', 'עץ חיים'
WHERE NOT EXISTS (SELECT 1 FROM product_types WHERE product_type_code = '01');

-- Remove legacy / unused sizes from the picker (keep sizes rows if variants reference them).
DELETE FROM product_sizes
 WHERE product_type_code = '01'
   AND size_code IN ('075', '080', '085', '090');

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
  v.size_code, '01', v.size_name, v.svg_file,
  v.diameter_mm, v.scale, v.sort_order, v.supports_verses
FROM (VALUES
  ('7.5', '7.5', NULL,              7.5, 0.352778, 1, FALSE),
  ('9',   '9',   'sizes/9.svg',     9,   0.352778, 2, TRUE),
  ('11',  '11',  'sizes/11.svg',   11,   0.352778, 3, TRUE),
  ('12',  '12',  'sizes/12.svg',   12,   0.352778, 4, TRUE),
  ('13',  '13',  'sizes/13.svg',   13,   0.352778, 5, TRUE),
  ('14',  '14',  'sizes/14.svg',   14,   0.352778, 6, TRUE),
  ('15',  '15',  'sizes/15.svg',   15,   0.352778, 7, TRUE),
  -- Size 16: crown-only (no עץ חיים / verses).
  ('16',  '16',  NULL,             16,   0.352778, 8, FALSE)
) AS v(size_code, size_name, svg_file, diameter_mm, scale, sort_order, supports_verses)
ON CONFLICT (size_code, product_type_code) DO UPDATE SET
  size_name = EXCLUDED.size_name,
  svg_template_file = EXCLUDED.svg_template_file,
  diameter_mm = EXCLUDED.diameter_mm,
  export_scale_factor = EXCLUDED.export_scale_factor,
  sort_order = EXCLUDED.sort_order,
  supports_verses = EXCLUDED.supports_verses;

-- Accessory types: same plate sizes as עץ חיים (no verse SVG).
INSERT INTO product_types (product_type_code, type_name)
SELECT v.product_type_code, v.type_name
FROM (VALUES
    ('CRM', 'כתר-רימונים'),
    ('RM',  'רימונים'),
    ('ML',  'מעיל')
) AS v(product_type_code, type_name)
WHERE NOT EXISTS (SELECT 1 FROM product_types pt WHERE pt.type_name = v.type_name)
  AND NOT EXISTS (SELECT 1 FROM product_types pt WHERE pt.product_type_code = v.product_type_code);

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
