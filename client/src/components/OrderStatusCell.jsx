import { useState } from 'react';
import {
  IconCircleCheck,
  IconCircleEllipsis,
  IconPackageCheck,
  IconTruck,
} from './Icons.jsx';
import {
  canAdvanceDisplayStatus,
  displayItemStatus,
  displayOrderStatus,
  statusLabel,
} from '../utils/orderStatus.js';

const ICONS = {
  pending_approval: IconCircleEllipsis,
  approved: IconCircleCheck,
  finished: IconPackageCheck,
  sent: IconTruck,
};

const NEXT_OPTIONS = [
  { id: 'finished', label: 'סיים' },
  { id: 'sent', label: 'נשלח' },
];

function IconCaretDown() {
  return (
    <svg
      className="status-pick-caret"
      viewBox="4.8 7.6 14.4 8.8"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function lineIcons(orderId, orderStatus, items) {
  const rows = Array.isArray(items) ? items : [];
  if (rows.length) {
    return rows.map((item) => ({
      key: `item-${item.order_item_id}`,
      itemId: item.order_item_id,
      display: displayItemStatus(item.status, orderStatus),
      clickable: Boolean(orderId),
    }));
  }
  if (orderId) {
    return [
      {
        key: 'order',
        itemId: null,
        display: displayOrderStatus(orderStatus),
        clickable: true,
      },
    ];
  }
  return [
    {
      key: 'empty',
      itemId: null,
      display: 'pending_approval',
      clickable: false,
    },
  ];
}

/**
 * One status icon per product line. Hover shows the Hebrew name.
 * pending and sent are not clickable. Approved can move to finished (default) or sent.
 */
export default function OrderStatusCell({
  orderId,
  orderStatus,
  items,
  disabled = false,
  onAdvance,
  shownStatuses = null,
}) {
  const icons = lineIcons(orderId, orderStatus, items).filter(
    (icon) => !shownStatuses || shownStatuses.has(icon.display)
  );
  const [dialog, setDialog] = useState(null);
  const [choice, setChoice] = useState('finished');
  const [menuOpen, setMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const openDialog = (icon) => {
    if (disabled || saving || !icon.clickable || !canAdvanceDisplayStatus(icon.display)) return;
    setChoice(icon.display === 'finished' ? 'sent' : 'finished');
    setMenuOpen(false);
    setDialog(icon);
  };

  const closeDialog = () => {
    if (saving) return;
    setDialog(null);
  };

  const confirm = async () => {
    if (!dialog || !onAdvance) return;
    const target = dialog.display === 'finished' ? 'sent' : choice;
    setSaving(true);
    try {
      const warnings = await onAdvance({
        orderId,
        itemId: dialog.itemId,
        status: target,
      });
      const unique = [...new Set((warnings || []).filter(Boolean))];
      setDialog(null);
      if (unique.length) window.alert(unique.join('\n'));
    } catch {
      /* the list panel shows the error */
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <span className="order-status-icons">
        {icons.map((icon) => {
          const Icon = ICONS[icon.display] || IconCircleEllipsis;
          const label = statusLabel(icon.display);
          const interactive =
            icon.clickable && canAdvanceDisplayStatus(icon.display) && !disabled;
          const changing = dialog?.key === icon.key;
          const className = `order-status-icon order-status-icon--${icon.display}${
            changing ? ' is-changing' : ''
          }`;
          if (!interactive) {
            return (
              <span key={icon.key} className={className} title={label} aria-label={label}>
                <Icon />
              </span>
            );
          }
          return (
            <button
              key={icon.key}
              type="button"
              className={className}
              title={label}
              aria-label={label}
              disabled={saving}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                openDialog(icon);
              }}
            >
              <Icon />
            </button>
          );
        })}
      </span>

      {dialog ? (
        <div
          className="confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="status-advance-title"
          onClick={(e) => {
            e.stopPropagation();
            if (e.target === e.currentTarget) closeDialog();
          }}
        >
          <div
            className="confirm-dialog card status-advance-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="status-advance-title">עדכון סטטוס</h3>
            {dialog.display === 'approved' ? (
              <>
                <p className="status-advance-message">
                  להעביר את הסטטוס ל<button
                    type="button"
                    className={`status-word-with-caret status-pick-value--${choice}${menuOpen ? ' is-open' : ''}`}
                    aria-haspopup="listbox"
                    aria-expanded={menuOpen}
                    aria-label="בחירה בין סיים לנשלח"
                    disabled={saving}
                    onClick={() => setMenuOpen((open) => !open)}
                  ><span className="status-pick-value">{choice === 'sent' ? 'נשלח' : 'סיים'}</span><IconCaretDown /></button>?
                </p>
                {menuOpen ? (
                  <ul className="status-inline-menu" role="listbox" aria-label="בחירת סטטוס">
                    {NEXT_OPTIONS.map((option) => (
                      <li key={option.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={choice === option.id}
                          className={`status-pick-option status-pick-value--${option.id}${
                            choice === option.id ? ' is-selected' : ''
                          }`}
                          onClick={() => {
                            setChoice(option.id);
                            setMenuOpen(false);
                          }}
                        >
                          {option.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <p className="status-advance-message">
                להעביר את הסטטוס ל<span className="status-pick-value status-pick-value--sent">נשלח</span>?
              </p>
            )}
            <div className="actions">
              <button type="button" className="btn" onClick={closeDialog} disabled={saving}>
                ביטול
              </button>
              <button type="button" className="btn primary" onClick={confirm} disabled={saving}>
                {saving ? 'מבצע…' : 'אישור'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
