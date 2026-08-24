import { useMemo, useRef, useState } from 'react';
import {
  groupDiscoveredFields,
  orderGroupsForCornerGrid,
} from '../utils/svgFieldDiscovery.js';
import {
  ringSortOrder,
  ringDisplayLabel,
} from '../utils/verseLayout.js';
import {
  BASE_FONT_SIZE_PX,
  LETTER_SPACING_MIN_EM,
  LETTER_SPACING_MAX_EM,
  styleForKey,
} from '../utils/verseStyles.js';
import { isFullyBold, isRangeFullyBold } from '../utils/verseBold.js';
import {
  SYMBOL_TYPES,
  SYMBOL_TYPE_LABELS,
  SYMBOL_COUNT_MAX,
  clampCount,
  normalizeSides,
  toggleSymbolSide,
  readCornerSymbolsFromFontScales,
} from '../utils/cornerSymbols.js';
import FontSizeControl from './FontSizeControl.jsx';
import VerseRichInput from './VerseRichInput.jsx';

/** Icon paths (local coords, tip-up) — match server sparkle4 / star5 / diamond. */
const SYMBOL_ICON_PATHS = {
  sparkle4:
    'M0 -4.2 C0.756 -0.756 0.756 -0.756 4.2 0 C0.756 0.756 0.756 0.756 0 4.2 C-0.756 0.756 -0.756 0.756 -4.2 0 C-0.756 -0.756 -0.756 -0.756 0 -4.2 Z',
  star5:
    'M0 -4.2 L1.037 -1.427 L3.994 -1.298 L1.678 0.545 L2.469 3.398 L0 1.764 L-2.469 3.398 L-1.678 0.545 L-3.994 -1.298 L-1.037 -1.427 Z',
  diamond: 'M0 -2.45 L2.45 0 L0 2.45 L-2.45 0 Z',
};

function SymbolIcon({ type }) {
  const d = SYMBOL_ICON_PATHS[type] || SYMBOL_ICON_PATHS.sparkle4;
  return (
    <svg
      className="corner-symbol-icon"
      viewBox="-5.2 -5.2 10.4 10.4"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}

function sortByRing(items) {
  return [...items].sort(
    (a, b) =>
      ringSortOrder(a.ring) - ringSortOrder(b.ring) ||
      a.sortOrder - b.sortOrder
  );
}

function CornerSymbolsControls({ corner, entry, onPatch }) {
  const type = entry?.type || 'sparkle4';
  const count = clampCount(entry?.count ?? 0);
  const active = count > 0;
  const sides = normalizeSides(entry?.sides);
  const rightOn = sides === 'both' || sides === 'right';
  const leftOn = sides === 'both' || sides === 'left';
  const atMin = count <= 0;
  const atMax = count >= SYMBOL_COUNT_MAX;

  const setCount = (next) => onPatch(corner, { count: clampCount(next) });

  const selectType = (nextType) => {
    if (count === 0) onPatch(corner, { type: nextType, count: 1, sides: 'both' });
    else onPatch(corner, { type: nextType });
  };

  const patchSide = (which) => {
    const next = toggleSymbolSide(sides, which);
    if (next === 'none') {
      // Clearing both R and L resets the symbol entirely.
      onPatch(corner, { count: 0, sides: 'both' });
      return;
    }
    onPatch(corner, { sides: next });
  };

  return (
    <div className="corner-symbols-controls" role="group" aria-label="סימבול מפריד">
      <div
        className="corner-symbols-type-group"
        role="radiogroup"
        aria-label={`סוג סימבול — ${corner}`}
      >
        {SYMBOL_TYPES.map((t) => {
          const selected = type === t && active;
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`corner-symbol-type-btn${selected ? ' is-selected' : ''}`}
              title={SYMBOL_TYPE_LABELS[t]}
              aria-label={SYMBOL_TYPE_LABELS[t]}
              onClick={() => selectType(t)}
            >
              <SymbolIcon type={t} />
            </button>
          );
        })}
      </div>
      {active ? (
        <>
          <div
            className="corner-symbols-side-group"
            role="group"
            aria-label={`צדדים — ${corner}`}
          >
            <button
              type="button"
              className={`corner-symbols-side-btn${rightOn ? ' is-selected' : ''}`}
              aria-pressed={rightOn}
              title="ימין"
              onClick={() => patchSide('right')}
            >
              R
            </button>
            <button
              type="button"
              className={`corner-symbols-side-btn${leftOn ? ' is-selected' : ''}`}
              aria-pressed={leftOn}
              title="שמאל"
              onClick={() => patchSide('left')}
            >
              L
            </button>
          </div>
          <div
            className="corner-symbols-counter"
            role="group"
            aria-label={`כמות סימבולים — ${corner}`}
          >
            <button
              type="button"
              className="corner-symbols-step"
              disabled={atMin}
              onClick={() => setCount(count - 1)}
              aria-label="הפחתת כמות סימבולים"
            >
              −
            </button>
            <input
              className="corner-symbols-count-input"
              type="number"
              inputMode="numeric"
              min={0}
              max={SYMBOL_COUNT_MAX}
              step={1}
              value={count}
              aria-label={`כמות חופשית — ${corner}`}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '') {
                  setCount(0);
                  return;
                }
                setCount(Number(raw));
              }}
            />
            <button
              type="button"
              className="corner-symbols-step"
              disabled={atMax}
              onClick={() => setCount(count + 1)}
              aria-label="הוספת סימבול"
            >
              +
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function VerseFieldInput({
  field,
  values,
  defaults,
  maxVerseLength,
  fontScales,
  onChange,
  onSetFontSize,
  onWidenSpacing,
  onTightenSpacing,
  onToggleBold,
}) {
  const editorRef = useRef(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const basePx = field.fontSizePx ?? BASE_FONT_SIZE_PX;
  const style = styleForKey(fontScales, field.key, basePx);
  const fontPx = style.fontSizePx ?? basePx;
  const atMinSpacing = style.letterSpacingEm <= LETTER_SPACING_MIN_EM + 0.0001;
  const atMaxSpacing = style.letterSpacingEm >= LETTER_SPACING_MAX_EM - 0.0001;
  const customFont = Math.abs(fontPx - basePx) > 0.01;
  const customSpacing = Math.abs(style.letterSpacingEm) > 0.0001;
  const placeholder = defaults?.[field.key] || field.defaultText || '';
  const fieldValue = values[field.key] ?? '';
  const textLen = fieldValue.length;
  const boldPressed =
    textLen > 0 &&
    (selection.end > selection.start
      ? isRangeFullyBold(style.boldRanges, selection.start, selection.end, textLen)
      : isFullyBold(style.boldRanges, textLen));
  const hasBold = (style.boldRanges || []).length > 0;

  const ringLabel = ringDisplayLabel(field.ring);

  const handleToggleBold = () => {
    const sel = editorRef.current?.getSelection?.() ?? selection;
    const start = sel.start ?? 0;
    const end = sel.end ?? 0;
    setSelection({ start, end });
    onToggleBold?.(field.key, start, end);
    requestAnimationFrame(() => {
      editorRef.current?.focus?.();
      editorRef.current?.setSelection?.(start, end);
      setSelection({ start, end });
    });
  };

  return (
    <div className="verse-field">
      {ringLabel ? (
        <span className="verse-field-sublabel">{ringLabel}</span>
      ) : null}
      <VerseRichInput
        ref={editorRef}
        id={`field-${field.key}`}
        value={fieldValue}
        boldRanges={style.boldRanges}
        placeholder={placeholder}
        maxLength={maxVerseLength}
        ariaLabel={field.label || field.key}
        onSelectionChange={setSelection}
        onChange={(text, boldRanges) => onChange(field.key, text, boldRanges)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
            e.preventDefault();
            handleToggleBold();
          }
        }}
      />
      <div className="font-controls">
        <div
          className={`spacing-arrows-btn${customSpacing ? ' active' : ''}`}
          title="מרווח בין אותיות"
        >
          <button
            type="button"
            className="spacing-arrow"
            onClick={() => onWidenSpacing(field.key)}
            disabled={atMaxSpacing}
            aria-label="הרחבת מרווח אותיות"
          >
            ▲
          </button>
          <button
            type="button"
            className="spacing-arrow"
            onClick={() => onTightenSpacing(field.key)}
            disabled={atMinSpacing}
            aria-label="הצמדת אותיות"
          >
            ▼
          </button>
        </div>
        <button
          type="button"
          className={`bold-toggle-btn${hasBold ? ' active' : ''}${boldPressed ? ' pressed' : ''}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleToggleBold}
          disabled={!textLen || typeof onToggleBold !== 'function'}
          title="הדגשה (Bold) — קטע מסומן או כל השורה"
          aria-label="הדגשת טקסט"
          aria-pressed={boldPressed}
        >
          B
        </button>
        <FontSizeControl
          value={fontPx}
          baseFontSizePx={basePx}
          custom={customFont}
          onSelect={(px) => onSetFontSize(field.key, px)}
          ariaLabel={`גודל פונט ${fontPx}`}
        />
      </div>
    </div>
  );
}

/** Corner groups stacked vertically; each verse field full width (original layout). */
export default function DynamicSvgForm({
  fields,
  values,
  defaults,
  maxVerseLength,
  fontScales = {},
  onChange,
  onSetFontSize,
  onWidenSpacing,
  onTightenSpacing,
  onToggleBold,
  onCornerSymbolPatch,
}) {
  const groups = useMemo(() => {
    const grouped = groupDiscoveredFields(fields);
    return orderGroupsForCornerGrid(grouped).length === grouped.length
      ? orderGroupsForCornerGrid(grouped)
      : grouped;
  }, [fields]);

  const cornerSymbols = useMemo(
    () => readCornerSymbolsFromFontScales(fontScales),
    [fontScales]
  );

  return (
    <div className="dynamic-svg-form-wrapper">
      <div className="verse-form-scroll">
        <div className="dynamic-svg-form layout-corners-stack">
          {groups.map((group) => (
            <fieldset
              key={group.id}
              id={`verse-group-${group.id}`}
              className="field-group"
            >
              <legend className="field-group-legend-row">
                <span className="field-group-legend-label">{group.label}</span>
                {typeof onCornerSymbolPatch === 'function' ? (
                  <CornerSymbolsControls
                    corner={group.id}
                    entry={cornerSymbols[group.id]}
                    onPatch={onCornerSymbolPatch}
                  />
                ) : null}
              </legend>
              {sortByRing(group.items).map((field) => (
                <VerseFieldInput
                  key={field.key}
                  field={field}
                  values={values}
                  defaults={defaults}
                  maxVerseLength={maxVerseLength}
                  fontScales={fontScales}
                  onChange={onChange}
                  onSetFontSize={onSetFontSize}
                  onWidenSpacing={onWidenSpacing}
                  onTightenSpacing={onTightenSpacing}
                  onToggleBold={onToggleBold}
                />
              ))}
            </fieldset>
          ))}
        </div>
      </div>
    </div>
  );
}
