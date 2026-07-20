import { useEffect, useRef, useState } from 'react';
import { MAX_FONT_SIZE_PX, fontSizePopupOptions } from '../utils/verseStyles.js';

const POPUP_MIN_SPACE = 180;

function measurePopupFlip(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  const footer = document.querySelector('.verse-page .vp-footer');
  const steps = document.querySelector('.app:has(.main-editor) .steps');
  const bottomBound = footer
    ? footer.getBoundingClientRect().top
    : window.innerHeight;
  const topBound = steps
    ? steps.getBoundingClientRect().bottom
    : 0;
  const spaceBelow = bottomBound - rect.bottom - 8;
  const spaceAbove = rect.top - topBound - 8;
  return spaceBelow < POPUP_MIN_SPACE && spaceAbove > spaceBelow;
}

/** Font size readout — click opens compact size popup. */
export default function FontSizeControl({
  value,
  custom,
  onSelect,
  ariaLabel,
  baseFontSizePx,
}) {
  const wrapRef = useRef(null);
  const popupRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [flipUp, setFlipUp] = useState(false);
  const options = fontSizePopupOptions(baseFontSizePx ?? value);

  useEffect(() => {
    if (!open) return undefined;

    const onDocPointerDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', onDocPointerDown);
    return () => document.removeEventListener('pointerdown', onDocPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open || !popupRef.current) return;
    const selected = popupRef.current.querySelector('.font-size-popup-item.selected');
    selected?.scrollIntoView({ block: 'nearest' });
  }, [open, flipUp, value]);

  const toggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (open) {
      setOpen(false);
      return;
    }
    setFlipUp(measurePopupFlip(wrapRef.current));
    setOpen(true);
  };

  const pick = (px) => {
    onSelect(px);
    setOpen(false);
  };

  return (
    <div
      className={`font-size-control${open ? ' open' : ''}${flipUp ? ' flip-up' : ''}`}
      ref={wrapRef}
    >
      <button
        type="button"
        className={`font-size-readout${custom ? ' active' : ''}`}
        onClick={toggle}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="לחצ/י לבחירת גודל פונט"
      >
        {value}
      </button>
      <ul
        ref={popupRef}
        className="font-size-popup"
        role="listbox"
        aria-label={ariaLabel}
      >
        {options.map((px) => {
          const selected = Math.abs(px - value) < 0.01;
          const disabled = px > MAX_FONT_SIZE_PX + 0.01;
          return (
            <li key={px} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={selected}
                className={`font-size-popup-item${selected ? ' selected' : ''}`}
                disabled={disabled}
                onClick={() => pick(px)}
              >
                {Number.isInteger(px) ? px : px}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
