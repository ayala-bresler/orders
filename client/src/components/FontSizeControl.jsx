import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MAX_FONT_SIZE_PX, fontSizePopupOptions } from '../utils/verseStyles.js';

const POPUP_GAP = 4;
const POPUP_MIN_SPACE = 180;

function layoutBounds() {
  const footer = document.querySelector('.verse-page .vp-footer');
  const steps = document.querySelector('.app:has(.main-editor) .steps');
  return {
    topBound: steps ? steps.getBoundingClientRect().bottom : 0,
    bottomBound: footer
      ? footer.getBoundingClientRect().top
      : window.innerHeight,
  };
}

function measurePopupPlacement(el) {
  if (!el) {
    return { flipUp: false, style: null };
  }
  const rect = el.getBoundingClientRect();
  const { topBound, bottomBound } = layoutBounds();
  const spaceBelow = bottomBound - rect.bottom - POPUP_GAP;
  const spaceAbove = rect.top - topBound - POPUP_GAP;
  const flipUp = spaceBelow < POPUP_MIN_SPACE && spaceAbove > spaceBelow;
  const maxHeight = Math.max(120, Math.floor(flipUp ? spaceAbove : spaceBelow));

  const style = {
    position: 'fixed',
    left: `${Math.round(rect.left + rect.width / 2)}px`,
    transform: 'translateX(-50%)',
    width: `${Math.max(42, Math.round(rect.width))}px`,
    maxHeight: `${maxHeight}px`,
    zIndex: 4000,
  };

  if (flipUp) {
    style.bottom = `${Math.round(window.innerHeight - rect.top + POPUP_GAP)}px`;
    style.top = 'auto';
  } else {
    style.top = `${Math.round(rect.bottom + POPUP_GAP)}px`;
    style.bottom = 'auto';
  }

  return { flipUp, style };
}

/** Font size readout — click opens compact size popup (portaled to escape overflow clips). */
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
  const [popupStyle, setPopupStyle] = useState(null);
  const options = fontSizePopupOptions(baseFontSizePx ?? value);

  const reposition = () => {
    const next = measurePopupPlacement(wrapRef.current);
    setFlipUp(next.flipUp);
    setPopupStyle(next.style);
  };

  useLayoutEffect(() => {
    if (!open) return undefined;
    reposition();
    const onWin = () => reposition();
    window.addEventListener('resize', onWin);
    window.addEventListener('scroll', onWin, true);
    return () => {
      window.removeEventListener('resize', onWin);
      window.removeEventListener('scroll', onWin, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const onDocPointerDown = (e) => {
      const t = e.target;
      if (wrapRef.current?.contains(t) || popupRef.current?.contains(t)) return;
      setOpen(false);
    };

    document.addEventListener('pointerdown', onDocPointerDown);
    return () => document.removeEventListener('pointerdown', onDocPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open || !popupRef.current) return;
    const selected = popupRef.current.querySelector('.font-size-popup-item.selected');
    selected?.scrollIntoView({ block: 'nearest' });
  }, [open, flipUp, value, popupStyle]);

  const toggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (open) {
      setOpen(false);
      setPopupStyle(null);
      return;
    }
    const next = measurePopupPlacement(wrapRef.current);
    setFlipUp(next.flipUp);
    setPopupStyle(next.style);
    setOpen(true);
  };

  const pick = (px) => {
    onSelect(px);
    setOpen(false);
  };

  const popup = open && popupStyle
    ? createPortal(
        <ul
          ref={popupRef}
          className={`font-size-popup font-size-popup--portal${flipUp ? ' flip-up' : ''}`}
          role="listbox"
          aria-label={ariaLabel}
          style={popupStyle}
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
        </ul>,
        document.body
      )
    : null;

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
      {popup}
    </div>
  );
}
