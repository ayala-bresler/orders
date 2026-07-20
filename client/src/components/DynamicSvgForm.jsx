import { useMemo } from 'react';
import { normalizeVerseText } from '../utils/verseText.js';
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
import FontSizeControl from './FontSizeControl.jsx';

function sortByRing(items) {
  return [...items].sort(
    (a, b) =>
      ringSortOrder(a.ring) - ringSortOrder(b.ring) ||
      a.sortOrder - b.sortOrder
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
}) {
  const basePx = field.fontSizePx ?? BASE_FONT_SIZE_PX;
  const style = styleForKey(fontScales, field.key, basePx);
  const fontPx = style.fontSizePx ?? basePx;
  const atMinSpacing = style.letterSpacingEm <= LETTER_SPACING_MIN_EM + 0.0001;
  const atMaxSpacing = style.letterSpacingEm >= LETTER_SPACING_MAX_EM - 0.0001;
  const customFont = Math.abs(fontPx - basePx) > 0.01;
  const customSpacing = Math.abs(style.letterSpacingEm) > 0.0001;
  const placeholder = defaults?.[field.key] || field.defaultText || '';

  const ringLabel = ringDisplayLabel(field.ring);

  return (
    <div className="verse-field">
      {ringLabel ? (
        <span className="verse-field-sublabel">{ringLabel}</span>
      ) : null}
      <textarea
        id={`field-${field.key}`}
        dir="rtl"
        rows={2}
        wrap="soft"
        maxLength={maxVerseLength}
        value={values[field.key] ?? ''}
        placeholder={placeholder}
        aria-label={field.label || field.key}
        onChange={(e) => onChange(field.key, normalizeVerseText(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.preventDefault();
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
}) {
  const groups = useMemo(() => {
    const grouped = groupDiscoveredFields(fields);
    return orderGroupsForCornerGrid(grouped).length === grouped.length
      ? orderGroupsForCornerGrid(grouped)
      : grouped;
  }, [fields]);

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
              <legend>{group.label}</legend>
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
                />
              ))}
            </fieldset>
          ))}
        </div>
      </div>
    </div>
  );
}
