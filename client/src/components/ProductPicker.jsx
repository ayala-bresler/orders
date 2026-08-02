import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fetchSelectableModels, modelImageUrl, addOrderItem } from '../api.js';
import { IconBack } from './Icons.jsx';
import { mainModelName } from '../utils/orderItemDisplay.js';
import {
  isSpecialTextModel,
  SPECIAL_MODEL_DISPLAY_NAME,
} from '../utils/modelScopes.js';

const GRID_GAP = 12;
const BANNER_HEIGHT = 34;

/** Pick column count so all model cards fit the visible grid area. */
function bestGridColumns(count, width, height) {
  if (!count || width <= 0 || height <= 0) return 1;
  let bestCols = 1;
  let bestScore = 0;

  for (let cols = 1; cols <= count; cols += 1) {
    const rows = Math.ceil(count / cols);
    const cardW = (width - GRID_GAP * (cols - 1)) / cols;
    const cardH = (height - GRID_GAP * (rows - 1)) / rows;
    const imageH = cardH - BANNER_HEIGHT;
    const score = Math.min(cardW, imageH);
    if (score > bestScore) {
      bestScore = score;
      bestCols = cols;
    }
  }

  return bestCols;
}

/**
 * Step 2 — the client picks a דגם (model) from category סת"ם (4).
 * Cards fill the viewport without scrolling; each shows the model name header + photo.
 */
export default function ProductPicker({
  order,
  existingItems,
  onItemReady,
  onPlainItem,
  onBackToExisting,
  onOpenItem,
}) {
  const [models, setModels] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [busyCode, setBusyCode] = useState(null);
  const [gridCols, setGridCols] = useState(4);
  const gridRef = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { models: rows } = await fetchSelectableModels();
        if (alive) {
          setModels(rows);
          setStatus('ready');
        }
      } catch (err) {
        if (alive) {
          setError(err.message);
          setStatus('error');
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useLayoutEffect(() => {
    if (status !== 'ready' || !models.length) return undefined;

    const update = () => {
      const el = gridRef.current;
      if (!el) return;
      const { width, height } = el.getBoundingClientRect();
      setGridCols(bestGridColumns(models.length, width, height));
    };

    update();
    const observer = new ResizeObserver(update);
    if (gridRef.current) observer.observe(gridRef.current);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [models.length, status]);

  const choose = async (model) => {
    const special = Boolean(model.special_text) || isSpecialTextModel(model.model_code);
    if (!model.product_code && !special) return;
    setBusyCode(model.model_code);
    setError('');
    try {
      const item = await addOrderItem(order.order_id, {
        model_code: model.model_code,
      });
      const enriched = {
        ...item,
        model_name: item.model_name || model.model_name,
        short_sku: item.short_sku || model.short_sku,
      };
      if (item.supports_verses) {
        onItemReady(enriched, model);
      } else {
        onPlainItem(enriched, model);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyCode(null);
    }
  };

  if (status === 'loading') return <div className="notice model-picker-notice">טוען דגמים…</div>;
  if (status === 'error') {
    return <div className="notice error model-picker-notice">שגיאה: {error}</div>;
  }

  const gridRows = Math.ceil(models.length / gridCols) || 1;
  const hasExisting = existingItems?.length > 0;

  return (
    <div className="card picker model-picker">
      {hasExisting && (
        <div className="model-picker-topbar">
          <button
            type="button"
            className="btn primary small btn-with-icon model-picker-back-btn"
            onClick={onBackToExisting}
            title="חזרה להזמנה הקיימת"
          >
            <IconBack />
            <span>חזרה להזמנה</span>
          </button>
          <div className="model-picker-order-names">
            {existingItems.map((item) => (
              <button
                key={item.order_item_id}
                type="button"
                className={`btn small model-picker-name-btn${
                  item.status === 'completed' ? ' model-picker-name-btn--sent' : ''
                }`}
                onClick={() => onOpenItem?.(item)}
                title={
                  item.status === 'completed'
                    ? `${mainModelName(item)} — ההזמנה נשלחה`
                    : mainModelName(item)
                }
              >
                {mainModelName(item)}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <div className="notice error model-picker-error">{error}</div>}

      <div
        ref={gridRef}
        className="model-picker-grid"
        style={{
          '--picker-cols': gridCols,
          '--picker-rows': gridRows,
        }}
      >
        {models.map((model) => {
          const special = Boolean(model.special_text) || isSpecialTextModel(model.model_code);
          const selectable = Boolean(model.product_code) || special;
          const busy = busyCode === model.model_code;
          const imgSrc =
            !special && model.has_image ? modelImageUrl(model.short_sku) : null;
          const label = special
            ? SPECIAL_MODEL_DISPLAY_NAME
            : model.model_name;

          return (
            <button
              type="button"
              key={model.model_code}
              className={`model-card${selectable ? '' : ' model-card--disabled'}${
                busy ? ' model-card--busy' : ''
              }${special ? ' model-card--special-text' : ''}`}
              disabled={!selectable || busy}
              onClick={() => choose(model)}
              title={
                selectable
                  ? label
                  : 'דגם זה אינו זמין להזמנה כרגע'
              }
            >
              {special ? (
                <div className="model-card-special-text" aria-hidden="false">
                  <span className="model-card-special-label">{label}</span>
                </div>
              ) : (
                <>
                  <div className="model-card-banner">
                    <span className="model-card-title">{model.model_name}</span>
                  </div>
                  <div className="model-card-photo-wrap">
                    {imgSrc ? (
                      <img
                        className="model-card-photo"
                        src={imgSrc}
                        alt=""
                        loading="lazy"
                        draggable={false}
                      />
                    ) : (
                      <div className="model-card-photo model-card-photo--placeholder">
                        <span className="model-card-sku">{model.short_sku}</span>
                      </div>
                    )}
                  </div>
                </>
              )}
              {busy && <span className="model-card-busy">מוסיף…</span>}
            </button>
          );
        })}
        {models.length === 0 && <div className="notice">אין דגמים זמינים.</div>}
      </div>
    </div>
  );
}
