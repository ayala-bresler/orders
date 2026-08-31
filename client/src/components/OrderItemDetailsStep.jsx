import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { fetchOrderItemDetails, fetchModels, fetchProductSizes, saveOrderItemDetails, completeOrderItem } from '../api.js';
import { plateDiameterNumber, findSizeByPlateDiameter, formatPlateDiameterLabel, syncItemSizeFields, resolveProductSizeRow, DEFAULT_PLATE_DIAMETER, isCrownOnlyPlateSize, SIZE_16_ETZ_CHAIM_CLEARED_NOTE } from '../utils/productSizeDisplay.js';
import { clampOrderNotes } from '../utils/orderNotes.js';
import { detectTextDir } from '../utils/textDirection.js';
import { resolveModelCode } from '../utils/modelSku.js';
import {
  isCrownOnlyModel,
  productSelectableModels,
  crownSelectableModels,
  orderNotesRequiredForItem,
} from '../utils/modelScopes.js';
import EtzChaimMeasuresDiagram from './EtzChaimMeasuresDiagram.jsx';
import ModelSelect from './ModelSelect.jsx';
import NumberedNotesArea from './NumberedNotesArea.jsx';
import DeliveryDateField from './DeliveryDateField.jsx';
import { isDateBeforeToday } from '../utils/dates.js';
import { IconBack, IconContinue } from './Icons.jsx';
import { prefetchVerseBake } from '../utils/verseBakePrefetch.js';
import OrderSentMarker from './OrderSentMarker.jsx';

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

function AccessoryRow({ label, modelKey, hasKey, item, models, modelOptions, mainModelCode, onAccessoryChange }) {
  const options = modelOptions || models;
  const checked = item[hasKey] === true;
  const storedCode = resolveModelCode(fieldValue(item, modelKey), models);
  const mainCode = resolveModelCode(mainModelCode, models);
  // Crown-only codes must stay selected even when main product model is different.
  const selectValue = storedCode
    || (options.some((m) => m.model_code === mainCode) ? mainCode : '')
    || '';

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
          models={options}
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
  orderSent = false,
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
  const [finishing, setFinishing] = useState(false);
  const [size16ClearedModelNotice, setSize16ClearedModelNotice] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setStatus('loading');
        setError('');
        setSize16ClearedModelNotice(false);
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
        const loadedItem = {
          ...normalizedItem,
          customer_notes: clampOrderNotes(normalizedItem.customer_notes),
        };
        const normalizedOrder = { ...loadedOrder };
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
    const nextSize = picked || { size_code: null, plate_diameter: diameter };
    const selectingSize16 = isCrownOnlyPlateSize({
      ...nextSize,
      plate_diameter: diameter,
      size_code: picked?.size_code,
    });
    const hadMainModel = Boolean(String(item.model || '').trim());
    const shouldClearMainModel = selectingSize16 && hadMainModel;

    setSaveAcknowledged(false);
    setSize16ClearedModelNotice(shouldClearMainModel);
    setItem((i) => ({
      ...i,
      plate_diameter: rawValue === '' ? null : diameter,
      size_code: picked?.size_code ?? null,
      ...(shouldClearMainModel ? { model: null } : {}),
    }));
  };

  const changeItem = (key, val) => {
    setSaveAcknowledged(false);
    const nextVal = key === 'customer_notes' ? clampOrderNotes(val) : val;
    setItem((i) => ({ ...i, [key]: nextVal }));
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
      } else if (hasKey && checked === false && modelKey) {
        // Uncheck → clear stale model so email/PDF follow live selection.
        next[modelKey] = null;
      }
      return next;
    });
  };

  const normalizeItemForSave = (raw) => {
    const synced = syncItemSizeFields(raw, productSizes);
    const out = { ...synced };
    if (out.model) out.model = resolveModelCode(out.model, models) || out.model;
    // Crown-only (09) must never be saved as the main product דגם.
    // Special text model (10 / מיוחד) is allowed everywhere.
    if (out.model && isCrownOnlyModel(out.model)) {
      out.model = null;
    }
    // Size 16: crown only — no עץ חיים main model.
    if (out.model && isCrownOnlyPlateSize(out)) {
      out.model = null;
    }
    for (const key of [
      'crown_model',
      'crown_rimmonim_model',
      'rimmonim_model',
      'coat_model',
      'breastplate_model',
      'pointer_model',
    ]) {
      if (out[key]) out[key] = resolveModelCode(out[key], models) || out[key];
    }
    // טס / יד cannot keep a crown-only model code (09); מיוחד (10) is allowed.
    for (const key of ['breastplate_model', 'pointer_model']) {
      if (out[key] && isCrownOnlyModel(out[key])) {
        out[key] = null;
      }
    }
    const main = out.model;
    if (out.has_crown && !out.crown_model && main) out.crown_model = main;
    if (out.has_crown_rimmonim && !out.crown_rimmonim_model && main) {
      out.crown_rimmonim_model = main;
    }
    if (out.has_rimmonim && !out.rimmonim_model && main) out.rimmonim_model = main;
    if (out.has_coat && !out.coat_model && main) out.coat_model = main;
    if (out.has_breastplate && !out.breastplate_model && main) out.breastplate_model = main;
    if (out.has_pointer && !out.pointer_model && main) out.pointer_model = main;
    // Persist only live checks — drop leftover model codes when unchecked.
    if (out.has_crown !== true) out.crown_model = null;
    if (out.has_crown_rimmonim !== true) out.crown_rimmonim_model = null;
    if (out.has_rimmonim !== true) out.rimmonim_model = null;
    if (out.has_coat !== true) out.coat_model = null;
    if (out.has_breastplate !== true) out.breastplate_model = null;
    if (out.has_pointer !== true) out.pointer_model = null;
    return out;
  };

  const notesRequired = useMemo(
    () => orderNotesRequiredForItem(normalizeItemForSave(item)),
    // normalize depends on models/productSizes; item is the live source
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional live check
    [item, models, productSizes]
  );

  const isDirty = useMemo(() => {
    const curItem = normalizeItemForSave(item);
    const baseItem = normalizeItemForSave(savedItem);
    return (
      JSON.stringify(order) !== JSON.stringify(savedOrder)
      || JSON.stringify(curItem) !== JSON.stringify(baseItem)
    );
  }, [order, item, savedOrder, savedItem, models]);

  const productModels = useMemo(() => productSelectableModels(models), [models]);
  const crownModels = useMemo(() => crownSelectableModels(models), [models]);

  const hasMainModelSelected = Boolean(
    resolveModelCode(fieldValue(item, 'model'), models)
    || String(item?.model || '').trim()
  );
  // Main עץ חיים + verses → next step. Crown / accessory-only (or no verses) → finish here.
  const continueToVerses = hasMainModelSelected && versesSupported;
  const finishesOnDetails = !continueToVerses;

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
      if (orderNotesRequiredForItem(payloadItem)) {
        const notes = String(payloadItem.customer_notes || '').trim();
        if (!notes) {
          const err = new Error(
            'נבחר דגם מיוחד — יש למלא הערות עם פרטי הבחירה לפני השמירה.'
          );
          setError(err.message);
          throw err;
        }
      }
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
      if (isDateBeforeToday(order.estimated_delivery_date)) {
        setError('תאריך אספקה לא יכול להיות בעבר — יש לבחור מהיום והלאה.');
        return null;
      }

      const payloadPreview = normalizeItemForSave({
        ...item,
        quantity: item.quantity === '' || item.quantity == null ? 1 : item.quantity,
        price_at_purchase: item.price_at_purchase === '' || item.price_at_purchase == null ? 0 : item.price_at_purchase,
      });
      const mainCode = resolveModelCode(payloadPreview.model, models) || String(payloadPreview.model || '').trim();

      // No עץ חיים → finish on this page (crown / accessories / empty product OK).
      const willFinishHere = !(Boolean(mainCode) && versesSupported);
      if (willFinishHere) setFinishing(true);

      const result = await persist();
      const nextItem = result?.item || item;
      const nextMain = resolveModelCode(nextItem.model, models) || String(nextItem.model || '').trim();
      const sizeSupportsVerses = result?.supportsVerses !== false;
      const goVerses = Boolean(nextMain) && sizeSupportsVerses;

      if (goVerses) {
        setFinishing(false);
        onContinueToVerses?.(templateKeyForItem(nextItem));
        return result;
      }

      try {
        const completed = await completeOrderItem(orderId, itemId);
        if (completed.warnings && completed.warnings.length) {
          const unique = [...new Set(completed.warnings.filter(Boolean))];
          window.alert(unique.join('\n'));
        }
        onFinishWithoutVerses?.(
          completed.completedItemId ?? completed.deletedItemId ?? itemId,
          completed.items || completed.remainingItems,
          { isResend: orderSent, sentTo: completed.sentTo }
        );
      } catch (err) {
        setFinishing(false);
        setError(err.message || 'סיום ההזמנה נכשל.');
        return null;
      }
      return result;
    } catch {
      setFinishing(false);
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
  }), [isDirty, item, order, versesSupported, models, productSizes, continueToVerses]);

  if (status === 'loading') return <div className="notice">טוען פרטי הזמנה…</div>;
  if (status === 'error') return <div className="notice error">שגיאה: {error}</div>;

  const mainModelCode = fieldValue(item, 'model');
  const plateSelectValue = (() => {
    const pd = item.plate_diameter;
    if (pd != null && pd !== '') return String(pd);
    return String(DEFAULT_PLATE_DIAMETER);
  })();
  const size16Selected = isCrownOnlyPlateSize(item);

  const hasStones = item.has_stones === true;
  const detailsTitle = 'פרטי הזמנה';

  return (
    <div className={`card details-step${orderSent ? ' details-step--sent' : ''}`}>
      {orderSent ? (
        <>
          <OrderSentMarker
            variant="diagonal"
            className="order-sent-ribbon"
            anchorSelector=".main-content-container"
            visible
          />
          <OrderSentMarker variant="sticky" visible />
        </>
      ) : null}
      <header className="details-page-banner" aria-label="כותרת">
        <h2 className="details-page-title">{detailsTitle}</h2>
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
                      models={productModels}
                      value={mainModelCode}
                      onChange={(code) => {
                        if (size16Selected) return;
                        changeItem('model', code);
                      }}
                      ariaLabel="דגם"
                      allowEmpty
                      nameOnly
                      disabled={size16Selected}
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
                        className="bidi-ltr"
                        type="number"
                        min="0"
                        step="0.1"
                        value={fieldValue(item, 'plate_diameter')}
                        onChange={(e) => changePlateDiameter(e.target.value)}
                      />
                    )}
                  </InlineField>
                </div>
                {size16ClearedModelNotice ? (
                  <p className="details-size16-note" role="status">
                    {SIZE_16_ETZ_CHAIM_CLEARED_NOTE}
                  </p>
                ) : null}

                <div className="details-row">
                  <InlineField label="קוטר קלף:">
                    <input
                      dir="ltr"
                      className="bidi-ltr"
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
                      className="bidi-ltr"
                      type="number"
                      min="0"
                      step="0.1"
                      value={fieldValue(item, 'parchment_height')}
                      onChange={(e) => changeItem('parchment_height', e.target.value)}
                    />
                  </InlineField>
                </div>

                <div className="details-row details-row-stones">
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
                          className="bidi-input"
                          dir={detectTextDir(fieldValue(item, 'stones_color'))}
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

                <div className="details-row details-row-delivery">
                  <InlineField label="תאריך אספקה:" className="details-delivery-field">
                    <DeliveryDateField
                      className="details-delivery-input"
                      value={order.estimated_delivery_date}
                      onChange={(val) => changeOrder('estimated_delivery_date', val)}
                      ariaLabel="תאריך אספקה (אופציונלי)"
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
                  modelOptions={crownModels}
                  mainModelCode={mainModelCode}
                  onAccessoryChange={changeAccessory}
                />
                <AccessoryRow
                  label="כתר-רימונים"
                  modelKey="crown_rimmonim_model"
                  hasKey="has_crown_rimmonim"
                  item={item}
                  models={models}
                  modelOptions={crownModels}
                  mainModelCode={mainModelCode}
                  onAccessoryChange={changeAccessory}
                />
                <AccessoryRow
                  label="רימונים"
                  modelKey="rimmonim_model"
                  hasKey="has_rimmonim"
                  item={item}
                  models={models}
                  modelOptions={crownModels}
                  mainModelCode={mainModelCode}
                  onAccessoryChange={changeAccessory}
                />
                <AccessoryRow
                  label="מעיל"
                  modelKey="coat_model"
                  hasKey="has_coat"
                  item={item}
                  models={models}
                  modelOptions={crownModels}
                  mainModelCode={mainModelCode}
                  onAccessoryChange={changeAccessory}
                />
                <AccessoryRow
                  label="טס"
                  modelKey="breastplate_model"
                  hasKey="has_breastplate"
                  item={item}
                  models={models}
                  modelOptions={productModels}
                  mainModelCode={mainModelCode}
                  onAccessoryChange={changeAccessory}
                />
                <AccessoryRow
                  label="יד"
                  modelKey="pointer_model"
                  hasKey="has_pointer"
                  item={item}
                  models={models}
                  modelOptions={productModels}
                  mainModelCode={mainModelCode}
                  onAccessoryChange={changeAccessory}
                />
              </aside>
            </div>

            <div className={`details-bottom-split${!hasMainModelSelected ? ' details-bottom-split--notes-only' : ''}`}>
              {hasMainModelSelected ? (
                <section className="details-parochet-section" aria-label="פרוכת">
                  <h3 className="details-section-banner">פרוכת</h3>
                  <div className="details-section-body">
                    <div className="details-parochet-height">
                      <InlineField label="גובה:" compact>
                        <input
                          dir="ltr"
                          className="bidi-ltr"
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
              ) : null}

              <section className="details-notes-section" aria-label="הערות">
                <h3 className="details-section-banner">הערות</h3>
                <div className="details-section-body">
                  <NumberedNotesArea
                    className="details-notes-numbered"
                    value={fieldValue(item, 'customer_notes')}
                    onChange={(e) => changeItem('customer_notes', e.target.value)}
                    placeholder="הקלד הערה…"
                    required={notesRequired}
                  />
                </div>
              </section>
            </div>
          </div>

          {error && <div className="notice error inline">{error}</div>}

          {!continueToVerses && hasMainModelSelected && versesUnavailableReason && (
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
              disabled={saving || finishing}
              aria-label="חזרה"
              title="חזרה"
            >
              <IconBack />
            </button>
          )}
          <button
            type="submit"
            className={`btn primary btn-with-icon details-nav-continue${
              finishesOnDetails ? ' details-nav-finish' : ''
            }`}
            disabled={saving || finishing}
            aria-label={
              finishesOnDetails ? 'סיום הזמנה' : 'שמירה והמשך לפסוקים'
            }
          >
            <span>
              {saving || finishing
                ? finishesOnDetails
                  ? 'מסיים…'
                  : 'שומר…'
                : finishesOnDetails
                  ? 'סיום הזמנה'
                  : 'שמירה והמשך'}
            </span>
            {/* Continue chevron only when there is a next verses step */}
            {continueToVerses ? <IconContinue /> : null}
          </button>
        </nav>
      </form>
    </div>
  );
});

export default OrderItemDetailsStep;
