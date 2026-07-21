import { useEffect, useMemo, useRef, useState } from 'react';

import LiveSvgCanvas from './SvgCanvas.jsx';
import DynamicSvgForm from './DynamicSvgForm.jsx';

import {
  fetchTemplate,
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
import { prepareSvgForExport } from '../export/prepareSvgForExport.js';
import { IconBack, IconPrint, IconReset, IconSave, IconUndo } from './Icons.jsx';

export default function TemplateEditor({ orderId, itemId, onEditOrderDetails, onOrderComplete }) {
  const canvasRef = useRef(null);

  const [masterSvg, setMasterSvg] = useState('');
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
  const [previewZoom, setPreviewZoom] = useState(getDefaultPreviewZoom);
  const [defaultPreviewZoom, setDefaultPreviewZoom] = useState(getDefaultPreviewZoom);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_LAYOUT_MQ);
    const syncDefaultZoom = () => {
      const nextDefault = mq.matches
        ? MOBILE_PREVIEW_DEFAULT_ZOOM
        : DESKTOP_PREVIEW_DEFAULT_ZOOM;
      setDefaultPreviewZoom(nextDefault);
      setPreviewZoom((current) =>
        current === MOBILE_PREVIEW_DEFAULT_ZOOM || current === DESKTOP_PREVIEW_DEFAULT_ZOOM
          ? nextDefault
          : current
      );
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
        }

        setMasterSvg(tpl.svg || '');
        setFields(discovered);
        setDefaults(defaultMap);
        setMaxVerseLength(tpl.maxVerseLength || 350);
        setValues(initial);
        setSavedValues({ ...defaultMap, ...saved });
        setFontScales(scales);
        setSavedFontScales(scales);
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
  }, [orderId, itemId]);

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
    return textDirty || scaleDirty;
  }, [fields, values, savedValues, fontScales, savedFontScales]);

  const handleChange = (key, val) => {
    setValues((v) => ({ ...v, [key]: val }));
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

  const handleReset = () => {
    setValues(savedValues);
    setFontScales(savedFontScales);
  };

  const handlePrint = () => {
    // Print the live preview SVG as currently shown (cleared fit sizing via beforeprint).
    window.print();
  };

  const buildPreparedSvgForExport = async () => {
    const liveSvg = canvasRef.current?.getSvgRoot?.();
    if (!liveSvg) {
      throw new Error('אין תצוגה מקדימה לייצוא. נסו שוב בעוד רגע.');
    }
    const guidePathIds = fields
      .map((f) => String(f.href || '').replace(/^#/, ''))
      .filter(Boolean);
    return prepareSvgForExport({ liveSvg, guidePathIds });
  };

  const handleFinishOrder = async () => {
    if (!orderId || !itemId) {
      setError('לא נבחרה שורת הזמנה לסיום.');
      return;
    }

    setExportingDxf(true);
    setError('');

    try {
      if (isDirty) {
        const saveRes = await saveOrderItemVerses(orderId, itemId, values, fontScales);
        setSavedValues({ ...defaults, ...saveRes.values });
        setValues({ ...defaults, ...saveRes.values });
        const savedScales = saveRes.fontScales || {};
        setSavedFontScales(savedScales);
        setFontScales(savedScales);
        setSaveAcknowledged(true);
      }

      // WYSIWYG: same live SVG layout as on-screen preview → DXF email
      const preparedSvg = await buildPreparedSvgForExport();
      const emailRes = await emailOrderItemDxf(orderId, itemId, { preparedSvg });
      setOrderCompleted(true);

      if (emailRes.warnings && emailRes.warnings.length) {
        window.alert(emailRes.warnings.join('\n'));
      }

      onOrderComplete?.(
        emailRes.deletedItemId ?? itemId,
        emailRes.remainingItems
      );
    } catch (err) {
      setError(err.message);
    } finally {
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

  return (
    <div className="verse-page">
      <img
        className="verse-print-logo"
        src="/img-judaica-logo.png?v=2"
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
          />

          {error && <div className="notice error inline">{error}</div>}
        </section>

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
            }`}
          >
            {masterSvg ? (
              <LiveSvgCanvas
                ref={canvasRef}
                masterSvg={masterSvg}
                fields={fields}
                values={values}
                fontScales={fontScales}
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
              onClick={onEditOrderDetails}
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
            className={`btn accent${orderCompleted && !isDirty ? ' btn-saved' : ''}`}
            onClick={handleFinishOrder}
            disabled={saving || exportingDxf || (orderCompleted && !isDirty)}
          >
            {exportingDxf ? 'מסיים…' : 'סיום הזמנה'}
          </button>
        </div>
      </nav>
    </div>
  );
}
