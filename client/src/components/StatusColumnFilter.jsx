import { useEffect, useRef, useState } from 'react';
import {
  IconCircleCheck,
  IconCircleEllipsis,
  IconPackageCheck,
  IconTruck,
} from './Icons.jsx';
import { STATUS_LABELS, STATUS_ORDER } from '../utils/orderStatus.js';

const ICONS = {
  pending_approval: IconCircleEllipsis,
  approved: IconCircleCheck,
  finished: IconPackageCheck,
  sent: IconTruck,
};

/**
 * Status column title with a sort mark that opens the four icons.
 * Each icon toggles whether that status is shown in the list.
 */
export default function StatusColumnFilter({ shown, onToggleStatus }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const rootRef = useRef(null);
  const signRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const toggleOpen = (event) => {
    event.stopPropagation();
    event.preventDefault();
    if (open) {
      setOpen(false);
      return;
    }
    const rect = signRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left });
    setOpen(true);
  };

  return (
    <span className="status-col-filter" ref={rootRef}>
      <span>סטטוס</span>
      <button
        ref={signRef}
        type="button"
        className="orders-sort-btn status-filter-sign"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={open ? 'סגור סינון סטטוס' : 'סינון סטטוס'}
        title="סינון לפי סטטוס"
        onClick={toggleOpen}
      >
        <span className={`orders-sort-arrow${open ? ' is-desc' : ''}`} aria-hidden="true">
          ▲
        </span>
      </button>
      {open && pos ? (
        <span
          className="status-filter-icons"
          style={{ top: pos.top, left: pos.left }}
          role="group"
          aria-label="בחירת סטטוסים להצגה"
        >
          {STATUS_ORDER.map((id) => {
            const Icon = ICONS[id];
            const on = shown.has(id);
            const label = STATUS_LABELS[id];
            return (
              <button
                key={id}
                type="button"
                className={`order-status-icon order-status-icon--${id}${
                  on ? '' : ' is-filtered-out'
                }`}
                aria-pressed={on}
                title={on ? `${label} — מוצג` : `${label} — מוסתר`}
                aria-label={on ? `הסתר ${label}` : `הצג ${label}`}
                onClick={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  onToggleStatus(id);
                }}
              >
                <Icon />
              </button>
            );
          })}
        </span>
      ) : null}
    </span>
  );
}
