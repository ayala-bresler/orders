import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatHebrewDate, toDateOnlyString } from '../utils/dates.js';
import { IconCalendar } from './Icons.jsx';

const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const MONTHS_HE = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
];

function parseIso(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function toIso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function buildMonthGrid(monthDate) {
  const first = startOfMonth(monthDate);
  const startPad = first.getDay(); // Sunday = 0
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(first.getFullYear(), first.getMonth(), d));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/**
 * Custom date field with a popover calendar that flips above the field
 * when there is not enough space below (mobile-friendly).
 */
export default function DeliveryDateField({
  value,
  onChange,
  className = '',
  ariaLabel = 'תאריך אספקה (אופציונלי)',
}) {
  const iso = toDateOnlyString(value);
  const wrapRef = useRef(null);
  const popRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState('below');
  const [viewMonth, setViewMonth] = useState(() => parseIso(iso) || new Date());

  useEffect(() => {
    if (!open) return;
    setViewMonth(parseIso(iso) || new Date());
  }, [open, iso]);

  useLayoutEffect(() => {
    if (!open || !wrapRef.current || !popRef.current) return;

    const updatePlacement = () => {
      const field = wrapRef.current.getBoundingClientRect();
      const popH = popRef.current.offsetHeight || 320;
      const bottomNav = document.querySelector('.details-bottom-nav');
      const navH = bottomNav?.getBoundingClientRect().height ?? 0;
      const gap = 8;
      const spaceBelow = window.innerHeight - navH - field.bottom - gap;
      const spaceAbove = field.top - gap;
      setPlacement(spaceBelow < popH && spaceAbove > spaceBelow ? 'above' : 'below');
    };

    updatePlacement();
    window.addEventListener('resize', updatePlacement);
    window.addEventListener('scroll', updatePlacement, true);
    return () => {
      window.removeEventListener('resize', updatePlacement);
      window.removeEventListener('scroll', updatePlacement, true);
    };
  }, [open, viewMonth]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const cells = buildMonthGrid(viewMonth);
  const selected = parseIso(iso);
  const todayIso = toIso(new Date());

  const pick = (date) => {
    onChange(toIso(date));
    setOpen(false);
  };

  const clear = () => {
    onChange(null);
    setOpen(false);
  };

  return (
    <div className={`date-field${open ? ' is-open' : ''}`} ref={wrapRef}>
      <button
        type="button"
        className={`date-field-trigger ${className}`.trim()}
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className={iso ? 'date-field-value' : 'date-field-placeholder'} dir="ltr">
          {iso ? formatHebrewDate(iso) : 'בחר תאריך'}
        </span>
        <IconCalendar className="date-field-icon" />
      </button>

      {open && (
        <div
          ref={popRef}
          className={`date-popover date-popover--${placement}`}
          role="dialog"
          aria-label="בחירת תאריך"
        >
          <div className="date-popover-head">
            <button
              type="button"
              className="btn icon date-nav-btn"
              onClick={() =>
                setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
              }
              aria-label="חודש קודם"
            >
              ›
            </button>
            <div className="date-popover-title">
              {MONTHS_HE[viewMonth.getMonth()]} {viewMonth.getFullYear()}
            </div>
            <button
              type="button"
              className="btn icon date-nav-btn"
              onClick={() =>
                setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
              }
              aria-label="חודש הבא"
            >
              ‹
            </button>
          </div>

          <div className="date-weekdays" aria-hidden="true">
            {WEEKDAYS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>

          <div className="date-grid">
            {cells.map((date, i) => {
              if (!date) {
                return <span key={`e-${i}`} className="date-cell empty" />;
              }
              const cellIso = toIso(date);
              const isSelected = selected && toIso(selected) === cellIso;
              const isToday = cellIso === todayIso;
              return (
                <button
                  key={cellIso}
                  type="button"
                  className={`date-cell${isSelected ? ' selected' : ''}${
                    isToday ? ' today' : ''
                  }`}
                  onClick={() => pick(date)}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="date-popover-foot">
            <button type="button" className="btn small" onClick={clear}>
              נקה
            </button>
            <button
              type="button"
              className="btn small"
              onClick={() => pick(new Date())}
            >
              היום
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
