# 'hetz-haim' Ordering System — XML/SVG Personalization Module

A sub-system for personalizing a **read-only master SVG template** (an
Illustrator-exported layout of four circular medallions, each with an inner and
outer curved verse). Clients may edit **only** the eight verse strings; the
template's layout, structure, styling and every non-verse node stay locked.

On save, the personalization is persisted twice:

1. Into the eight `verse_*` columns on `order_items` (structured).
2. As a serialized customized SVG snapshot — stored in `order_items.customized_svg`
   **and** written to disk under `server/storage/orders/<orderId>/item-<itemId>.svg`.

The master file itself is **never** modified.

---

## Layout → column mapping

Four medallions × two rings = eight editable verses:

| Corner       | Inner ring (`text_1`)         | Outer ring (`text_2`)         |
|--------------|-------------------------------|-------------------------------|
| Top right    | `verse_top_right_text_1`      | `verse_top_right_text_2`      |
| Top left     | `verse_top_left_text_1`       | `verse_top_left_text_2`       |
| Bottom right | `verse_bottom_right_text_1`   | `verse_bottom_right_text_2`   |
| Bottom left  | `verse_bottom_left_text_1`    | `verse_bottom_left_text_2`    |

Each verse maps to one `<textPath>` in the master via its `xlink:href` id.
The authoritative mapping lives in `server/src/config/template.js`.

---

## How immutability is enforced

- The master is only ever **read** (`svgService.loadMasterSvg`, cached by mtime).
- The client never uploads SVG. It sends at most 8 `{ fieldKey: text }` strings.
- `renderCustomizedSvg` re-parses a fresh master and rewrites **only** the text
  content of the 8 whitelisted `<textPath>` nodes. Unknown keys are rejected
  (HTTP 400); newlines/tabs are stripped; length is capped.
- `server/scripts/verify-svg.js` asserts the customized copy has identical
  `<g>/<ellipse>/<rect>/<path>/<text>/<textPath>` counts to the master.

---

## Project structure

```
server/
  db/schema.sql              full PostgreSQL schema
  templates/order.svg        bundled read-only master (fallback)
  src/
    config/template.js       MASTER_SVG_PATH + 8-field href→column map
    db.js                    pg pool
    services/svgService.js   immutable load, extract, safe render
    services/orderService.js persist verses + svg snapshot
    routes/template.js       GET /api/template, POST /api/template/preview
    routes/orders.js         GET/PUT .../verses, GET .../svg
    index.js                 Express app
  scripts/
    apply-schema.js          npm run db:schema
    verify-svg.js            npm run verify   (no DB required)
client/
  src/
    components/SvgCanvas.jsx     live preview (text-only mutation)
    components/VerseForm.jsx     the 8 inputs, grouped by corner
    components/TemplateEditor.jsx orchestration + save
    App.jsx, api.js, styles.css
```

---

## Setup

### 1. Backend

```bash
cd server
npm install
cp .env.example .env         # then edit DB creds / MASTER_SVG_PATH
npm run verify               # offline SVG round-trip check (no DB)
npm run db:schema            # create tables (needs a reachable PostgreSQL)
npm run db:seed              # demo catalog: category 4 + עץ חיים products
npm run dev                  # http://localhost:4000
```

Point at the golden template on the network drive by setting in `.env`:

```
MASTER_SVG_PATH=Z:\תיק מוצר\documents\order.svg
```

If unset, the bundled `server/templates/order.svg` is used.

### 2. Frontend

```bash
cd client
npm install
npm run dev                  # http://localhost:5173  (proxies /api -> :4000)
```

Open `http://localhost:5173/?orderId=1&itemId=1` to edit a specific order item.

---

## Client flow

1. **Identify** — client enters name + phone. First visit creates a `customers`
   row and a draft `orders` row; a return visit (same phone) reloads the
   existing open order and its items.
2. **Choose product** — only category `4` (סת"ם) products are listed. A product
   is verse-personalizable only when it has an **עץ חיים** variant
   (`product_types.type_name = 'עץ חיים'`) → `supports_verses = true`.
3. **Verse editor** — opens only for עץ חיים items; saves the 8 verses + SVG
   snapshot to that `order_items` line.

`customers` is an added table (the CSV set has none) so name/phone can be stored
and an order retrieved on return. `orders.customer_id` references it.

## API

| Method | Path                                          | Purpose                              |
|--------|-----------------------------------------------|--------------------------------------|
| POST   | `/api/customers/identify`                     | Find/create customer + open order    |
| GET    | `/api/products` (`?category=4`)               | Selectable products + `supports_verses` |
| POST   | `/api/orders/:orderId/items`                  | Add a product line to an order       |
| GET    | `/api/template`                               | Master SVG + editable field list     |
| POST   | `/api/template/preview`                       | Render customized copy (no save)     |
| GET    | `/api/orders/:orderId/items/:itemId/verses`   | Saved verses (+ master defaults)     |
| PUT    | `/api/orders/:orderId/items/:itemId/verses`   | Save verses (8 columns + SVG snapshot)|
| GET    | `/api/orders/:orderId/items/:itemId/svg`      | Serialized customized SVG            |

`POST /api/customers/identify` body: `{ "full_name": "…", "phone": "…" }`

`PUT` body:

```json
{ "values": { "top_right_1": "…", "bottom_left_2": "…" } }
```
