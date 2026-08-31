import { useEffect, useMemo, useRef, useState } from 'react';

import LiveSvgCanvas from './SvgCanvas.jsx';
import DynamicSvgForm from './DynamicSvgForm.jsx';

import {
  fetchTemplate,
  fetchTemplatePreview,
  fetchOrderItemVerses,
  fetchOrderItemDetails,
  saveOrderItemVerses,
  emailOrderItemDxf,
} from '../api.js';
import {
  PREVIEW_SCROLL_ZOOM_THRESHOLD,
  MOBILE_LAYOUT_MQ,
  MOBILE_PREVIEW_DEFAULT_ZOOM,
  DESKTOP_PREVIEW_DEFAULT_ZOOM,
  getDefaultPreviewZoom,
} from '../utils/svgLiveUpdate.js';
import { formatPlateDiameterDisplay } from '../utils/productSizeDisplay.js';
import { discoverSvgTextFields } from '../utils/svgFieldDiscovery.js';
import {
  styleForKey,
  compactStylePatch,
  stylesEqual,
  adjustLetterSpacing,
  LETTER_SPACING_STEP_EM,
} from '../utils/verseStyles.js';
import { toggleBoldRanges, clampBoldRangesToText } from '../utils/verseBold.js';
import {
  saveVerseDraft,
  loadVerseDraft,
  clearVerseDraft,
} from '../utils/verseDraftPersist.js';
import { takeVerseBakeCache } from '../utils/verseBakePrefetch.js';
import {
  readCornerSymbolsFromFontScales,
  withCornerSymbolPatch,
} from '../utils/cornerSymbols.js';
import { IconBack, IconPrint, IconReset, IconSave, IconUndo } from './Icons.jsx';
import OrderSentMarker from './OrderSentMarker.jsx';

function bakeSignature(values, fontScales) {
  return JSON.stringify({ values, fontScales });
}

export default function TemplateEditor({
  orderId,
  itemId,
  templateKey = '',
  orderSent = false,
  onEditOrderDetails,
  onOrderComplete,
}) {
  const canvasRef = useRef(null);
  const bakeReqIdRef = useRef(0);
  const bakedSvgRef = useRef('');
  const bakeSigRef = useRef('');

  const [masterSvg, setMasterSvg] = useState('');
  /** Last server-baked SVG (correct ring text centering). Kept while the next bake runs. */
  const [bakedSvg, setBakedSvg] = useState('');
  const [fields, setFields] = useState([]);
  const [defaults, setDefaults] = useState({});
  const [maxVerseLength, setMaxVerseLength] = useState(350);

  const [values, setValues] = useState({});
  const [savedValues, setSavedValues] = useState({});
  const [fontScales, setFontScales] = useState({});
  const [savedFontScales, setSavedFontScales] = useState({});
  const [meta, setMeta] = useState(null);

  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [exportingDxf, setExportingDxf] = useState(false);
  const [saveAcknowledged, setSaveAcknowledged] = useState(false);
  const [orderCompleted, setOrderCompleted] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(() => getDefaultPreviewZoom());
  const [defaultPreviewZoom, setDefaultPreviewZoom] = useState(() => getDefaultPreviewZoom());

  // Always open the verses preview at 100% (layout-aware default).
  useEffect(() => {
    const nextDefault = getDefaultPreviewZoom();
    setDefaultPreviewZoom(nextDefault);
    setPreviewZoom(nextDefault);
  }, [orderId, itemId, templateKey]);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_LAYOUT_MQ);
    const syncDefaultZoom = () => {
      const nextDefault = mq.matches
        ? MOBILE_PREVIEW_DEFAULT_ZOOM
        : DESKTOP_PREVIEW_DEFAULT_ZOOM;
      setDefaultPreviewZoom(nextDefault);
      setPreviewZoom(nextDefault);
    };
    mq.addEventListener('change', syncDefaultZoom);
    return () => mq.removeEventListener('change', syncDefaultZoom);
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setStatus('loading');
        const tpl = await fetchTemplate({ orderId, orderItemId: itemId });
        if (!alive) return;

        const discovered = discoverSvgTextFields(tpl.svg, tpl.fields);
        const defaultMap = Object.fromEntries(
          discovered.map((f) => [f.key, f.defaultText ?? ''])
        );

        let initial = defaultMap;
        let saved = {};
        let scales = {};

        if (orderId && itemId) {
          try {
            const row = await fetchOrderItemVerses(orderId, itemId);
            initial = { ...defaultMap, ...row.values };
            saved = row.values;
            scales = row.fontScales || {};
            if (row.meta) setMeta(row.meta);
          } catch {
            try {
              const details = await fetchOrderItemDetails(orderId, itemId);
              if (details?.meta) setMeta(details.meta);
              else if (details?.item) {
                setMeta({
                  model_name: details.item.model,
                  plate_diameter: details.item.plate_diameter,
                });
              }
            } catch {
              /* start from master defaults */
            }
          }

          // Restore unsaved edits from a previous visit (not written to DB yet).
          const draft = loadVerseDraft(orderId, itemId, templateKey);
          if (draft) {
            initial = { ...initial, ...draft.values };
            scales = { ...scales, ...draft.fontScales };
          }
        }

        setMasterSvg(tpl.svg || '');
        setBakedSvg('');
        bakedSvgRef.current = '';
        bakeSigRef.current = '';
        setFields(discovered);
        setDefaults(defaultMap);
        setMaxVerseLength(tpl.maxVerseLength || 350);
        setValues(initial);
        setSavedValues({ ...defaultMap, ...saved });
        setFontScales(scales);
        setSavedFontScales(scales);

        // Use details-page prefetch if it already finished with the same verses.
        try {
          const warmed = await takeVerseBakeCache({
            orderId,
            itemId,
            templateKey,
            values: initial,
            fontScales: scales,
          });
          if (alive && warmed?.svg) {
            bakedSvgRef.current = warmed.svg;
            bakeSigRef.current = warmed.sig || bakeSignature(initial, scales);
            setBakedSvg(warmed.svg);
          }
        } catch {
          /* bake effect will fetch */
        }

        setStatus('ready');
      } catch (err) {
        if (!alive) return;
        setError(err.message);
        setStatus('error');
      }
    })();

    return () => {
      alive = false;
    };
  }, [orderId, itemId, templateKey]);

  // Keep draft in session while editing — survives back-navigation without DB save.
  useEffect(() => {
    if (status !== 'ready' || !orderId || !itemId || !fields.length) return undefined;

    const textDirty = fields.some(
      (f) => (values[f.key] ?? '') !== (savedValues[f.key] ?? '')
    );
    const scaleDirty = fields.some(
      (f) =>
        !stylesEqual(
          fontScales[f.key],
          savedFontScales[f.key],
          f.fontSizePx ?? 16
        )
    );

    if (!textDirty && !scaleDirty) {
      clearVerseDraft(orderId, itemId);
      return undefined;
    }

    const timer = window.setTimeout(() => {
      saveVerseDraft(orderId, itemId, {
        values,
        fontScales,
        templateKey,
      });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [
    status,
    fields,
    values,
    fontScales,
    savedValues,
    savedFontScales,
    orderId,
    itemId,
    templateKey,
  ]);

  // Server bake after edits — keep previous bake on screen (no "מכינים תצוגה").
  useEffect(() => {
    if (status !== 'ready' || !fields.length) return undefined;

    const reqId = ++bakeReqIdRef.current;
    const sig = bakeSignature(values, fontScales);
    const delay = bakedSvgRef.current ? 220 : 0;

    const timer = window.setTimeout(async () => {
      try {
        const res = await fetchTemplatePreview(values, fontScales, {
          orderId,
          orderItemId: itemId,
          bake: true,
        });
        if (bakeReqIdRef.current !== reqId) return;
        if (res?.svg) {
          bakedSvgRef.current = res.svg;
          bakeSigRef.current = sig;
          setBakedSvg(res.svg);
          setError('');
        }
      } catch (err) {
        if (bakeReqIdRef.current !== reqId) return;
        setError(err?.message || 'שגיאה בהכנת התצוגה.');
      }
    }, delay);

    return () => window.clearTimeout(timer);
  }, [status, fields, values, fontScales, orderId, itemId]);

  const isDirty = useMemo(() => {
    const textDirty = fields.some(
      (f) => (values[f.key] ?? '') !== (savedValues[f.key] ?? '')
    );
    const scaleDirty = fields.some(
      (f) =>
        !stylesEqual(
          fontScales[f.key],
          savedFontScales[f.key],
          f.fontSizePx ?? 16
        )
    );
    const symbolsDirty =
      JSON.stringify(readCornerSymbolsFromFontScales(fontScales)) !==
      JSON.stringify(readCornerSymbolsFromFontScales(savedFontScales));
    return textDirty || scaleDirty || symbolsDirty;
  }, [fields, values, savedValues, fontScales, savedFontScales]);

  const handleChange = (key, val, boldRangesFromEditor) => {
    setValues((v) => ({ ...v, [key]: val }));
    setFontScales((s) => {
      const base = fields.find((f) => f.key === key)?.fontSizePx ?? 16;
      const cur = styleForKey(s, key, base);
      const nextRanges =
        boldRangesFromEditor != null
          ? boldRangesFromEditor
          : clampBoldRangesToText(cur.boldRanges, val);
      if (!(nextRanges?.length) && !(cur.boldRanges?.length)) return s;
      const next = { ...cur, boldRanges: nextRanges };
      const patch = compactStylePatch(next, base);
      const out = { ...s };
      if (Object.keys(patch).length) out[key] = patch;
      else delete out[key];
      return out;
    });
    setSaveAcknowledged(false);
    setOrderCompleted(false);
  };

  const patchStyle = (key, updater) => {
    setFontScales((s) => {
      const base =
        fields.find((f) => f.key === key)?.fontSizePx ?? 16;
      const cur = styleForKey(s, key, base);
      const next = updater(cur);
      const patch = compactStylePatch(next, base);
      const out = { ...s };
      if (Object.keys(patch).length) out[key] = patch;
      else delete out[key];
      return out;
    });
    setSaveAcknowledged(false);
    setOrderCompleted(false);
  };

  const handleSetFontSize = (key, fontSizePx) => {
    patchStyle(key, (cur) => ({ ...cur, fontSizePx }));
  };

  const handleWidenSpacing = (key) => {
    patchStyle(key, (cur) => ({
      ...cur,
      letterSpacingEm: adjustLetterSpacing(cur.letterSpacingEm, LETTER_SPACING_STEP_EM),
    }));
  };

  const handleTightenSpacing = (key) => {
    patchStyle(key, (cur) => ({
      ...cur,
      letterSpacingEm: adjustLetterSpacing(cur.letterSpacingEm, -LETTER_SPACING_STEP_EM),
    }));
  };

  const handleToggleBold = (key, start, end) => {
    const text = values[key] ?? '';
    patchStyle(key, (cur) => ({
      ...cur,
      boldRanges: toggleBoldRanges(cur.boldRanges, start, end, text.length),
    }));
  };

  const handleCornerSymbolPatch = (corner, patch) => {
    setFontScales((s) => withCornerSymbolPatch(s, corner, patch));
    setSaveAcknowledged(false);
    setOrderCompleted(false);
  };

  const handleReset = () => {
    setValues(savedValues);
    setFontScales(savedFontScales);
    clearVerseDraft(orderId, itemId);
  };

  const handleBackToDetails = () => {
    if (orderId && itemId) {
      saveVerseDraft(orderId, itemId, {
        values,
        fontScales,
        templateKey,
      });
    }
    onEditOrderDetails?.();
  };

  const handlePrint = () => {
    // Prints the stored server-baked SVG currently on screen.
    window.print();
  };

  /** Ensure we have a bake matching the given (or current) values — reuse cache when possible. */
  const ensureBakedSvg = async (nextValues = values, nextScales = fontScales) => {
    const sig = bakeSignature(nextValues, nextScales);
    if (bakedSvgRef.current && bakeSigRef.current === sig) {
      return bakedSvgRef.current;
    }
    const res = await fetchTemplatePreview(nextValues, nextScales, {
      orderId,
      orderItemId: itemId,
      bake: true,
    });
    if (!res?.svg) {
      throw new Error('לא התקבל קובץ תצוגה מהשרת.');
    }
    bakedSvgRef.current = res.svg;
    bakeSigRef.current = sig;
    setBakedSvg(res.svg);
    return res.svg;
  };

  const handleFinishOrder = async () => {
    if (!orderId || !itemId) {
      setError('לא נבחרה שורת הזמנה לסיום.');
      return;
    }

    setExportingDxf(true);
    setError('');

    try {
      let exportValues = values;
      let exportScales = fontScales;

      if (isDirty) {
        const saveRes = await saveOrderItemVerses(orderId, itemId, values, fontScales);
        exportValues = { ...defaults, ...saveRes.values };
        exportScales = saveRes.fontScales || {};
        setSavedValues(exportValues);
        setValues(exportValues);
        setSavedFontScales(exportScales);
        setFontScales(exportScales);
        setSaveAcknowledged(true);
      }

      // Export exactly what is on screen / saved — cleared verses stay empty (no default refill).
      const finalValues = {};
      for (const f of fields) {
        const v = exportValues[f.key];
        finalValues[f.key] = v == null ? '' : String(v);
      }
      exportValues = finalValues;

      // Keep on-screen bake in sync for print; DXF email uses the same values.
      try {
        await ensureBakedSvg(exportValues, exportScales);
      } catch {
        /* display bake is best-effort; export still proceeds from values */
      }
      const emailRes = await emailOrderItemDxf(
        orderId,
        itemId,
        exportValues,
        exportScales
      );
      clearVerseDraft(orderId, itemId);
      setOrderCompleted(true);

      if (emailRes.warnings && emailRes.warnings.length) {
        const unique = [...new Set(emailRes.warnings.filter(Boolean))];
        window.alert(unique.join('\n'));
      }

      onOrderComplete?.(
        emailRes.completedItemId ?? emailRes.deletedItemId ?? itemId,
        emailRes.items || emailRes.remainingItems,
        { isResend: orderSent, sentTo: emailRes.sentTo }
      );
      // Keep button disabled until parent navigates home.
    } catch (err) {
      setError(err.message);
      setExportingDxf(false);
    }
  };

  const handleSave = async () => {
    if (!orderId || !itemId) {
      setError('לא נבחרה שורת הזמנה לשמירה.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const res = await saveOrderItemVerses(orderId, itemId, values, fontScales);
      setSavedValues({ ...defaults, ...res.values });
      setValues({ ...defaults, ...res.values });
      const savedScales = res.fontScales || {};
      setSavedFontScales(savedScales);
      setFontScales(savedScales);
      clearVerseDraft(orderId, itemId);
      setSaveAcknowledged(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (status === 'loading') return <div className="notice">טוען תבנית…</div>;
  if (status === 'error') return <div className="notice error">שגיאה: {error}</div>;

  const plateDiameterLabel = formatPlateDiameterDisplay(meta?.plate_diameter);

  // While a newer bake is in flight, keep the last baked SVG on screen
  // (avoid flashing back to uncentered master on font-size / text edits).
  const previewSvg = bakedSvg || masterSvg;
  // Live style overlay only before the first bake exists; after that, wait for swap.
  const previewFontScales = bakedSvg ? {} : fontScales;

  return (
    <div className={`verse-page${orderSent ? ' verse-page--sent' : ''}`}>
      {orderSent ? <OrderSentMarker variant="sticky" /> : null}
      <img
        className="verse-print-logo"
        src="/img-judaica-logo-with-bg.png?v=5"
        alt="IMG JUDAICA LTD — אי אמ ג'י יודאיקה בע״מ"
      />
      <div className="editor verse-page-body">
        <section className="form-pane verse-form-pane">
          <dl className="product-meta" aria-label="פרטי הזמנה">
            <div>
              <dt>מס' הזמנה</dt>
              <dd>{orderId ?? '—'}</dd>
            </div>
            <div>
              <dt>דגם</dt>
              <dd>{meta?.model_name ?? meta?.model_label ?? '—'}</dd>
            </div>
            <div>
              <dt>קוטר צלחת</dt>
              <dd dir="ltr">{plateDiameterLabel || '—'}</dd>
            </div>
          </dl>

          <DynamicSvgForm
            fields={fields}
            values={values}
            defaults={defaults}
            maxVerseLength={maxVerseLength}
            fontScales={fontScales}
            onChange={handleChange}
            onSetFontSize={handleSetFontSize}
            onWidenSpacing={handleWidenSpacing}
            onTightenSpacing={handleTightenSpacing}
            onToggleBold={handleToggleBold}
            onCornerSymbolPatch={handleCornerSymbolPatch}
          />

          {error && <div className="notice error inline">{error}</div>}
        </section>

        {/* Preview always mounts (including after order sent) — marker hugs SVG top edge. */}
        <section className="preview-pane verse-preview-pane" aria-label="תצוגת SVG">
          <div className="preview-head">
            <h3 className="panel-title">תצוגה</h3>
            <div className="preview-zoom" aria-label="הגדלה והקטנה של התצוגה">
              <button
                type="button"
                className="zoom-btn"
                onClick={() => setPreviewZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(1)))}
                aria-label="הקטנת תצוגה"
              >
                −
              </button>
              <span className="zoom-label">{Math.round(previewZoom * 100)}%</span>
              <button
                type="button"
                className="zoom-btn"
                onClick={() => setPreviewZoom((z) => Math.min(2.5, +(z + 0.1).toFixed(1)))}
                aria-label="הגדלת תצוגה"
              >
                +
              </button>
              <button
                type="button"
                className="zoom-btn zoom-reset"
                onClick={() => setPreviewZoom(defaultPreviewZoom)}
                disabled={previewZoom === defaultPreviewZoom}
                aria-label="איפוס תצוגה"
                title="איפוס"
              >
                <IconReset />
              </button>
            </div>
          </div>
          <div
            className={`preview-viewport${
              previewZoom > PREVIEW_SCROLL_ZOOM_THRESHOLD
                ? ' preview-viewport--scroll'
                : ' preview-viewport--fit'
            }${orderSent ? ' preview-viewport--sent' : ''}`}
          >
            {orderSent ? (
              <OrderSentMarker variant="diagonal" className="order-sent-marker--verses" />
            ) : null}
            {previewSvg ? (
              <LiveSvgCanvas
                ref={canvasRef}
                masterSvg={previewSvg}
                fields={bakedSvg ? [] : fields}
                values={bakedSvg ? {} : values}
                fontScales={previewFontScales}
                zoom={previewZoom}
                cropPreview
              />
            ) : (
              <div className="notice" aria-live="polite">
                טוען תצוגה…
              </div>
            )}
          </div>
        </section>
      </div>

      <nav className="bottom-nav-bar vp-footer" aria-label="פעולות עריכה">
        <div className="vp-footer-actions">
          {onEditOrderDetails && (
            <button
              type="button"
              className="vp-nav-icon"
              onClick={handleBackToDetails}
              disabled={saving || exportingDxf}
              aria-label="פרטי הזמנה"
              title="פרטי הזמנה"
            >
              <IconBack />
            </button>
          )}

          <button
            type="button"
            className={`vp-nav-icon${
              isDirty || (saveAcknowledged && !isDirty) ? ' vp-nav-icon--active' : ''
            }${saveAcknowledged && !isDirty ? ' vp-nav-icon--saved' : ''}`}
            onClick={handleSave}
            disabled={saving || exportingDxf || !isDirty}
            aria-label={saveAcknowledged && !isDirty ? 'נשמר' : 'שמירה'}
            title={saveAcknowledged && !isDirty ? 'נשמר' : 'שמירה'}
          >
            <IconSave />
          </button>

          <button
            type="button"
            className="vp-nav-icon"
            onClick={handlePrint}
            disabled={exportingDxf}
            aria-label="הדפסה"
            title="הדפסה"
          >
            <IconPrint />
          </button>

          <button
            type="button"
            className="vp-nav-icon"
            onClick={handleReset}
            disabled={saving || exportingDxf || !isDirty}
            aria-label="ביטול שינויים"
            title="ביטול שינויים"
          >
            <IconUndo />
          </button>
        </div>

        <div className="vp-footer-export">
          <button
            type="button"
            className={`btn accent${orderCompleted && !isDirty && !orderSent ? ' btn-saved' : ''}`}
            onClick={handleFinishOrder}
            disabled={saving || exportingDxf}
          >
            {exportingDxf ? 'מסיים…' : 'סיום הזמנה'}
          </button>
        </div>
      </nav>
    </div>
  );
}
