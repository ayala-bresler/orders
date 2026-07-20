import { useLayoutEffect, useRef, useState } from 'react';
import OrderItemSummary from './OrderItemSummary.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import { mainModelName } from '../utils/orderItemDisplay.js';
import { modelSkuPrefix } from '../utils/modelSku.js';
import { modelImageUrl } from '../api.js';
import { IconTrash } from './Icons.jsx';

const GRID_GAP = 16;
/** Cap so one product isn't huge; more products never exceed this. */
const MAX_CARD_SIZE = 360;
const MIN_CARD_SIZE = 120;

function itemImageSrc(item) {
  const sku =
    item.short_sku
    || modelSkuPrefix(item.model_code || item.model);
  return sku ? modelImageUrl(sku) : null;
}

/**
 * Pick cols so squares fit width AND height; more items → smaller cards.
 * Never exceeds container width (no horizontal scroll) — shrinks cards if needed.
 */
function bestCardLayout(count, width, height) {
  if (!count || width <= 0 || height <= 0) {
    return { cols: 1, size: Math.max(1, Math.floor(Math.min(MIN_CARD_SIZE, width || MIN_CARD_SIZE))), rows: 1 };
  }

  let best = { cols: 1, size: 0, rows: count };

  for (let cols = 1; cols <= count; cols += 1) {
    const rows = Math.ceil(count / cols);
    const maxW = (width - GRID_GAP * (cols - 1)) / cols;
    const maxH = height > 0
      ? (height - GRID_GAP * (rows - 1)) / rows
      : maxW;
    if (maxW < 1) continue;

    // Fit both axes; prefer width fit. Allow below MIN_CARD_SIZE to avoid x-scroll.
    const size = Math.min(maxW, maxH > 0 ? maxH : maxW, MAX_CARD_SIZE);
    if (size > best.size) {
      best = { cols, size, rows };
    }
  }

  const maxForCols = (width - GRID_GAP * (best.cols - 1)) / best.cols;
  // Floor so cols * size + gaps never exceeds width
  let size = Math.floor(Math.min(best.size || maxForCols, maxForCols, MAX_CARD_SIZE));
  while (
    best.cols > 1
    && size * best.cols + GRID_GAP * (best.cols - 1) > width
  ) {
    size -= 1;
  }
  size = Math.max(1, size);

  return { cols: best.cols, size, rows: best.rows };
}

/**
 * Shown to a returning customer who already has items in their order.
 * Two paths: continue with an existing item, or start a new product.
 */
export default function ExistingOrderStep({
  order,
  items,
  customerName,
  onContinueItem,
  onNewProduct,
  onDeleteItem,
}) {
  const [pendingDelete, setPendingDelete] = useState(null);
  const [brokenImages, setBrokenImages] = useState(() => new Set());
  const [layout, setLayout] = useState({ cols: 1, size: 240, rows: 1 });
  const gridRef = useRef(null);

  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return undefined;

    const update = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      setLayout(bestCardLayout(items.length, width, height));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [items.length]);

  const handleDelete = (item, e) => {
    e?.stopPropagation?.();
    e?.preventDefault?.();
    if (!onDeleteItem) return;
    setPendingDelete(item);
  };

  const confirmDelete = () => {
    if (!pendingDelete || !onDeleteItem) return;
    onDeleteItem(pendingDelete.order_item_id);
    setPendingDelete(null);
  };

  const markBroken = (id) => {
    setBrokenImages((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const greeting = String(customerName || '').trim();

  return (
    <div className="card resume">
      <div className="resume-header">
        <h2 className="resume-title">ההזמנה שלך (#{order.order_id})</h2>
        {greeting ? (
          <p className="resume-greeting" aria-label={`שלום ${greeting}`}>
            היי {greeting}!
          </p>
        ) : null}
      </div>

      <div
        ref={gridRef}
        className="resume-grid"
        style={{
          gridTemplateColumns: items.length
            ? `repeat(${layout.cols}, ${layout.size}px)`
            : undefined,
          gridAutoRows: items.length ? `${layout.size}px` : undefined,
          gap: GRID_GAP,
        }}
      >
        {items.map((item) => {
          const imgSrc = itemImageSrc(item);
          const showImg = imgSrc && !brokenImages.has(item.order_item_id);
          return (
            <div
              className="resume-card"
              key={item.order_item_id}
              style={{ width: layout.size, height: layout.size }}
            >
              <button
                type="button"
                className="resume-card-enter"
                onClick={() => onContinueItem(item)}
                title="כניסה להזמנה"
              >
                <div className="resume-card-photo-wrap">
                  {showImg ? (
                    <img
                      className="resume-card-photo"
                      src={imgSrc}
                      alt=""
                      loading="lazy"
                      draggable={false}
                      onError={() => markBroken(item.order_item_id)}
                    />
                  ) : (
                    <div className="resume-card-photo resume-card-photo--placeholder" aria-hidden="true" />
                  )}
                </div>
                <OrderItemSummary item={item} />
              </button>
              {onDeleteItem && (
                <button
                  type="button"
                  className="resume-card-delete"
                  onClick={(e) => handleDelete(item, e)}
                  aria-label="מחיקת פריט"
                  title="מחיקה"
                >
                  <IconTrash />
                </button>
              )}
            </div>
          );
        })}
        {items.length === 0 && <div className="notice">אין עדיין פריטים בהזמנה.</div>}
      </div>

      <div className="resume-add-wrap">
        <button type="button" className="btn resume-add-btn" onClick={onNewProduct}>
          + הוספת מוצר חדש
        </button>
      </div>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="מחיקת פריט"
        message={
          pendingDelete
            ? `להסיר את "${mainModelName(pendingDelete)}" מההזמנה? פעולה זו אינה ניתנת לביטול.`
            : ''
        }
        confirmLabel="מחק"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
