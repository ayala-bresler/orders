import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { fetchOrderItemDetails, fetchModels, fetchProductSizes, saveOrderItemDetails, completeOrderItem } from '../api.js';
import { plateDiameterNumber, findSizeByPlateDiameter, formatPlateDiameterLabel, syncItemSizeFields, resolveProductSizeRow, DEFAULT_PLATE_DIAMETER } from '../utils/productSizeDisplay.js';
import { clampOrderNotes } from '../utils/orderNotes.js';
import { resolveModelCode } from '../utils/modelSku.js';
import EtzChaimMeasuresDiagram from './EtzChaimMeasuresDiagram.jsx';
import ModelSelect from './ModelSelect.jsx';
import NumberedNotesArea from './NumberedNotesArea.jsx';
import DeliveryDateField from './DeliveryDateField.jsx';
import { IconBack, IconContinue } from './Icons.jsx';
import { prefetchVerseBake } from '../utils/verseBakePrefetch.js';

function fieldValue(record, key) {
  const val = record?.[key];
  if (val == null) return '';
  return String(val);
}

function InlineField({ label, children, wide = false, compact = false, className = '' }) {
  return (
    <label
      className={`details-inline-field${wide ? ' details-inline-wide' : ''}${compact ? ' details-inline-compact' : ''}${className ? ` ${className}` : ''}`}
    >
      <span className="details-inline-label">{label}</span>
      <span className="details-inline-control">{children}</span>
    </label>
  );
}

function AccessoryRow({ label, modelKey, hasKey, item, models, mainModelCode, onAccessoryChange }) {
  const checked = item[hasKey] === true;
  const storedCode = resolveModelCode(fieldValue(item, modelKey), models);
  const mainCode = resolveModelCode(mainModelCode, models);
  const selectValue = storedCode || mainCode || '';

  const handleCheck = (e) => {
    onAccessoryChange({ hasKey, modelKey, checked: e.target.checked, mainModelCode: mainCode });
  };

  return (
    <div className="details-accessory-row">
      <span className="details-accessory-label">{label}</span>
      <label className="details-check-label details-accessory-check">
        <input
          type="checkbox"
          checked={checked}
          onChange={handleCheck}
          aria-label={label}
        />
      </label>
      {checked ? (
        <ModelSelect
          className="details-accessory-model"
          models={models}
          value={selectValue}
          onChange={(code) => onAccessoryChange({ modelKey, modelCode: code })}
          ariaLabel={`${label} — דגם`}
        />
      ) : (
        <span className="details-accessory-model-spacer" aria-hidden="true" />
      )}
    </div>
  );
}

const OrderItemDetailsStep = forwardRef(function OrderItemDetailsStep({
  orderId,
  itemId,
  onContinueToVerses,
  onFinishWithoutVerses,
  onSupportsVersesChange,
  onCancel,
  onDirtyChange,
}, ref) {
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [order, setOrder] = useState({});
  const [item, setItem] = useState({});
  const [models, setModels] = useState([]);
  const [productSizes, setProductSizes] = useState([]);
  const [loadedComplete, setLoadedComplete] = useState(false);
  const [savedOrder, setSavedOrder] = useState({});
  const [savedItem, setSavedItem] = useState({});
  const [saveAcknowledged, setSaveAcknowledged] = useState(false);
  const [supportsVerses, setSupportsVerses] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setStatus('loading');
        setError('');
        const [data, modelsData, sizesData] = await Promise.all([
          fetchOrderItemDetails(orderId, itemId),
          fetchModels(),
          fetchProductSizes('01'),
        ]);
        if (!alive) return;
        const loadedOrder = data.order || {};
        const sizes = sizesData.sizes || [];
        let normalizedItem = {
          quantity: 1,
          price_at_purchase: 0,
          ...(data.item || {}),
        };
        normalizedItem = syncItemSizeFields(normalizedItem, sizes);
        if (normalizedItem.plate_diameter == null || normalizedItem.plate_diameter === '') {
          const defaultSize = findSizeByPlateDiameter(sizes, DEFAULT_PLATE_DIAMETER)
            || sizes.find((s) => s.size_code === '12');
          const defaultN = plateDiameterNumber(defaultSize);
          if (defaultN != null) {
            normalizedItem.plate_diameter = defaultN;
            normalizedItem.size_code = defaultSize?.size_code ?? '12';
          }
        }
        const loadedItem = normalizedItem;
        const normalizedOrder = {
          ...loadedOrder,
          order_notes: clampOrderNotes(loadedOrder.order_notes),
        };
        setOrder(normalizedOrder);
        setSavedOrder(normalizedOrder);
        setItem(loadedItem);
        setSavedItem(loadedItem);
        setSaveAcknowledged(false);
        setSupportsVerses(data.supportsVerses !== false);
        setModels(modelsData.models || []);
        setProductSizes(sizes);
        setLoadedComplete(Boolean(data.detailsComplete));
        setStatus('ready');
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
  }, [orderId, itemId]);

  const selectedSize = useMemo(() => {
    return resolveProductSizeRow(productSizes, {
      plate_diameter: item.plate_diameter,
      size_code: item.size_code,
    });
  }, [productSizes, item.plate_diameter, item.size_code]);

  const versesSupported = selectedSize?.supports_verses !== false && supportsVerses;

  const plateSizeOptions = useMemo(() => {
    const seen = new Set();
    const options = [];
    for (const size of productSizes) {
      const n = plateDiameterNumber(size);
      if (n == null || seen.has(n)) continue;
      seen.add(n);
      options.push({ size, n });
    }
    return options.sort((a, b) => a.n - b.n);
  }, [productSizes]);

  const versesUnavailableReason = versesSupported
    ? null
    : selectedSize?.supports_verses === false
      ? 'size_no_verses'
      : 'select_plate';

  const templateKeyForItem = (rawItem) =>
    `${rawItem?.plate_diameter ?? ''}:${rawItem?.size_code ?? ''}`;

  useEffect(() => {
    onSupportsVersesChange?.(versesSupported);
  }, [versesSupported, onSupportsVersesChange]);

  // Prefetch server-baked verse SVG while filling details (centering ready before editor).
  useEffect(() => {
    if (status !== 'ready' || !versesSupported || !orderId || !itemId) return undefined;
    const templateKey = templateKeyForItem(item);
    prefetchVerseBake({ orderId, itemId, templateKey }).catch(() => {
      /* non-blocking */
    });
    return undefined;
  }, [
    status,
    versesSupported,
    orderId,
    itemId,
    item.plate_diameter,
    item.size_code,
  ]);

  const changeOrder = (key, val) => {
    setSaveAcknowledged(false);
    setOrder((o) => ({ ...o, [key]: val }));
  };
  const changePlateDiameter = (rawValue) => {
    const diameter = rawValue === '' ? null : Number(rawValue);
    const picked =
      rawValue === '' || !Number.isFinite(diameter)
        ? null
        : findSizeByPlateDiameter(productSizes, diameter);

    setSaveAcknowledged(false);
    setItem((i) => ({
      ...i,
      plate_diameter: rawValue === '' ? null : diameter,
      size_code: picked?.size_code ?? null,
    }));
  };

  const changeItem = (key, val) => {
    setSaveAcknowledged(false);
    setItem((i) => ({ ...i, [key]: val }));
  };

  const changeAccessory = ({ hasKey, modelKey, checked, modelCode, mainModelCode: mainCode }) => {
    setSaveAcknowledged(false);
    setItem((i) => {
      const next = { ...i };
      if (hasKey) next[hasKey] = checked;
      if (modelKey && modelCode !== undefined) {
        next[modelKey] = modelCode;
      } else if (hasKey && checked && modelKey) {
        const cur = resolveModelCode(i[modelKey], models);
        if (!cur) next[modelKey] = mainCode || resolveModelCode(i.model, models) || null;
      }
      return next;
    });
  };

  const normalizeItemForSave = (raw) => {
    const synced = syncItemSizeFields(raw, productSizes);
    const out = { ...synced };
    if (out.model) out.model = resolveModelCode(out.model, models) || out.model;
    for (const key of ['crown_model', 'breastplate_model', 'pointer_model']) {
      if (out[key]) out[key] = resolveModelCode(out[key], models) || out[key];
    }
    const main = out.model;
    if (out.has_crown && !out.crown_model && main) out.crown_model = main;
    if (out.has_breastplate && !out.breastplate_model && main) out.breastplate_model = main;
    if (out.has_pointer && !out.pointer_model && main) out.pointer_model = main;
    return out;
  };

  const isDirty = useMemo(() => {
    const curItem = normalizeItemForSave(item);
    const baseItem = normalizeItemForSave(savedItem);
    return (
      JSON.stringify(order) !== JSON.stringify(savedOrder)
      || JSON.stringify(curItem) !== JSON.stringify(baseItem)
    );
  }, [order, item, savedOrder, savedItem, models]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const persist = async () => {
    setSaving(true);
    setError('');
    try {
      const payloadItem = normalizeItemForSave({
        ...item,
        quantity: item.quantity === '' || item.quantity == null ? 1 : item.quantity,
        price_at_purchase: item.price_at_purchase === '' || item.price_at_purchase == null ? 0 : item.price_at_purchase,
      });
      const result = await saveOrderItemDetails(orderId, itemId, { order, item: payloadItem });
      const nextOrder = result.order || order;
      const nextItem = result.item || payloadItem;
      setOrder(nextOrder);
      setSavedOrder(nextOrder);
      setItem(nextItem);
      setSavedItem(nextItem);
      setLoadedComplete(Boolean(result.detailsComplete));
      setSupportsVerses(result.supportsVerses !== false);
      setSaveAcknowledged(true);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndContinue = async () => {
    try {
      const result = await persist();
      const nextItem = result?.item || item;
      if (versesSupported) {
        onContinueToVerses?.(templateKeyForItem(nextItem));
      } else {
        const completed = await completeOrderItem(orderId, itemId);
        onFinishWithoutVerses?.(
          completed.deletedItemId ?? itemId,
          completed.remainingItems
        );
      }
      return result;
    } catch {
      /* error shown */
      return null;
    }
  };

  const handleSkipToVerses = () => {
    onContinueToVerses?.(templateKeyForItem(item));
  };

  useImperativeHandle(ref, () => ({
    isDirty: () => isDirty,
    save: persist,
    saveAndContinue: handleSaveAndContinue,
    skipToVerses: handleSkipToVerses,
    getTemplateKey: () => templateKeyForItem(item),
  }), [isDirty, item, order, versesSupported, models, productSizes]);

  if (status === 'loading') return <div className="notice">טוען פרטי הזמנה…</div>;
  if (status === 'error') return <div className="notice error">שגיאה: {error}</div>;

  const mainModelCode = fieldValue(item, 'model');
  const plateSelectValue = (() => {
    const pd = item.plate_diameter;
    if (pd != null && pd !== '') return String(pd);
    return String(DEFAULT_PLATE_DIAMETER);
  })();

  const hasStones = item.has_stones === true;

  return (
    <div className="card details-step">
      <header className="details-page-banner" aria-label="כותרת">
        <h2 className="details-page-title">פרטי עץ חיים</h2>
      </header>
      <form
        className="details-sheet"
        onSubmit={(e) => {
          e.preventDefault();
          handleSaveAndContinue();
        }}
      >
        <div className="details-sheet-scroll">
          <div className="details-content-stack">
            <div className="details-order-block">
              <section className="details-fields-main" aria-label="פרטי מוצר">
                <div className="details-row details-row-name">
                  <InlineField label="דגם:">
                    <ModelSelect
                      models={models}
                      value={mainModelCode}
                      onChange={(code) => changeItem('model', code)}
                      ariaLabel="דגם"
                    />
                  </InlineField>
                </div>

                <div className="details-row">
                  <InlineField label="קוטר צלחת:">
                    {productSizes.length > 0 ? (
                      <select
                        dir="rtl"
                        value={plateSelectValue}
                        onChange={(e) => changePlateDiameter(e.target.value)}
                        aria-label="בחירת קוטר צלחת"
                        required
                      >
                        {plateSizeOptions.map(({ size, n }) => (
                          <option key={size.size_code} value={String(n)}>
                            {formatPlateDiameterLabel(size)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        dir="ltr"
                        type="number"
                        min="0"
                        step="0.1"
                        value={fieldValue(item, 'plate_diameter')}
                        onChange={(e) => changePlateDiameter(e.target.value)}
                      />
                    )}
                  </InlineField>
                </div>

                <div className="details-row">
                  <InlineField label="קוטר קלף:">
                    <input
                      dir="ltr"
                      type="number"
                      min="0"
                      step="0.1"
                      value={fieldValue(item, 'parchment_diameter')}
                      onChange={(e) => changeItem('parchment_diameter', e.target.value)}
                    />
                  </InlineField>
                </div>

                <div className="details-row">
                  <InlineField label="גובה קלף:">
                    <input
                      dir="ltr"
                      type="number"
                      min="0"
                      step="0.1"
                      value={fieldValue(item, 'parchment_height')}
                      onChange={(e) => changeItem('parchment_height', e.target.value)}
                    />
                  </InlineField>
                </div>
              </section>

              <aside className="details-accessories-col" aria-label="אביזרים">
                <AccessoryRow
                  label="כתר"
                  modelKey="crown_model"
                  hasKey="has_crown"
                  item={item}
                  models={models}
                  mainModelCode={mainModelCode}
                  onAccessoryChange={changeAccessory}
                />
                <AccessoryRow
                  label="טס"
                  modelKey="breastplate_model"
                  hasKey="has_breastplate"
                  item={item}
                  models={models}
                  mainModelCode={mainModelCode}
                  onAccessoryChange={changeAccessory}
                />
                <AccessoryRow
                  label="יד"
                  modelKey="pointer_model"
                  hasKey="has_pointer"
                  item={item}
                  models={models}
                  mainModelCode={mainModelCode}
                  onAccessoryChange={changeAccessory}
                />
              </aside>

              <div className="details-stones-slot" aria-label="אבנים">
                <div className="details-inline-field details-stones-field">
                  <span className="details-inline-label">אבנים:</span>
                  <span className="details-inline-control details-stones-control">
                    <label className="details-check-label details-check-inline">
                      <input
                        type="checkbox"
                        checked={hasStones}
                        onChange={(e) => changeItem('has_stones', e.target.checked)}
                        aria-label="יש אבנים"
                      />
                    </label>
                    {hasStones ? (
                      <input
                        dir="rtl"
                        type="text"
                        value={fieldValue(item, 'stones_color')}
                        onChange={(e) => changeItem('stones_color', e.target.value)}
                        aria-label="צבע אבנים"
                        placeholder="צבע"
                      />
                    ) : (
                      <span className="details-stones-input-spacer" aria-hidden="true" />
                    )}
                  </span>
                </div>
              </div>

              <div className="details-delivery-slot">
                <InlineField label="תאריך אספקה:" className="details-delivery-field">
                  <DeliveryDateField
                    className="details-delivery-input"
                    value={order.estimated_delivery_date}
                    onChange={(val) => changeOrder('estimated_delivery_date', val)}
                    ariaLabel="תאריך אספקה (אופציונלי)"
                  />
                </InlineField>
              </div>
            </div>

            <div className="details-bottom-split">
              <section className="details-parochet-section" aria-label="פרוכת">
                <h3 className="details-section-banner">פרוכת</h3>
                <div className="details-section-body">
                  <div className="details-parochet-height">
                    <InlineField label="גובה:" compact>
                      <input
                        dir="ltr"
                        type="number"
                        min="0"
                        step="0.1"
                        value={fieldValue(item, 'parochet_height')}
                        onChange={(e) => changeItem('parochet_height', e.target.value)}
                      />
                    </InlineField>
                  </div>
                  <EtzChaimMeasuresDiagram />
                </div>
              </section>

              <section className="details-notes-section" aria-label="הערות">
                <h3 className="details-section-banner">הערות</h3>
                <div className="details-section-body">
                  <NumberedNotesArea
                    className="details-notes-numbered"
                    value={fieldValue(order, 'order_notes')}
                    onChange={(e) => changeOrder('order_notes', e.target.value)}
                    placeholder="הקלד הערה…"
                  />
                </div>
              </section>
            </div>
          </div>

          {error && <div className="notice error inline">{error}</div>}

          {!versesSupported && versesUnavailableReason && (
            <p className="details-verses-unavailable" role="status">
              {versesUnavailableReason === 'size_no_verses'
                ? 'מידה זו אינה כוללת עריכת פסוקים — ניתן לסיים את ההזמנה לאחר שמירת הפרטים.'
                : 'יש לבחור קוטר צלחת תקין כדי לאפשר עריכת פסוקים.'}
            </p>
          )}
        </div>

        <nav className="bottom-nav-bar details-bottom-nav" aria-label="פעולות הזמנה">
          {onCancel && (
            <button
              type="button"
              className="btn btn-icon-only details-nav-back"
              onClick={onCancel}
              disabled={saving}
              aria-label="חזרה"
              title="חזרה"
            >
              <IconBack />
            </button>
          )}
          <button type="submit" className="btn primary btn-with-icon details-nav-continue" disabled={saving}>
            <span>{saving ? 'שומר…' : versesSupported ? 'שמירה והמשך' : 'סיום הזמנה'}</span>
            <IconContinue />
          </button>
        </nav>
      </form>
    </div>
  );
});

export default OrderItemDetailsStep;
