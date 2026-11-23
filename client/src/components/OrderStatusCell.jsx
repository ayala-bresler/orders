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

const CHOICE_ORDER = ['approved', 'finished', 'sent'];

function defaultTarget(current) {
  if (current === 'finished') return 'sent';
  if (current === 'sent') return 'finished';
  return 'finished';
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
 * Pending stays locked. Approved, finished, and sent can move among those three.
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
  const [saving, setSaving] = useState(false);

  const openDialog = (icon) => {
    if (disabled || saving || !icon.clickable || !canAdvanceDisplayStatus(icon.display)) return;
    setChoice(defaultTarget(icon.display));
    setDialog(icon);
  };

  const cycleChoice = () => {
    const index = CHOICE_ORDER.indexOf(choice);
    setChoice(CHOICE_ORDER[(index + 1) % CHOICE_ORDER.length]);
  };

  const closeDialog = () => {
    if (saving) return;
    setDialog(null);
  };

  const confirm = async () => {
    if (!dialog || !onAdvance) return;
    const target = choice;
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
            <h3 id="status-advance-title" className={`status-pick-value status-pick-value--${choice}`}>
              {statusLabel(choice)}
            </h3>
            <p className="status-advance-message">
              להעביר את הסטטוס ל<button
                type="button"
                className={`status-question-word status-pick-value status-pick-value--${choice}`}
                aria-label={`הסטטוס הנבחר: ${statusLabel(choice)}. לחץ למעבר בין מאושר, סיים ונשלח`}
                disabled={saving}
                onClick={cycleChoice}
              >{statusLabel(choice)}</button>?
            </p>
            <div className="status-choice-icons" role="listbox" aria-label="בחירת סטטוס">
              {CHOICE_ORDER.map((id) => {
                const Icon = ICONS[id];
                const selected = choice === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`order-status-icon order-status-icon--${id}${
                      selected ? ' is-selected' : ''
                    }`}
                    title={statusLabel(id)}
                    aria-label={statusLabel(id)}
                    disabled={saving}
                    onClick={() => setChoice(id)}
                  >
                    <Icon />
                  </button>
                );
              })}
            </div>
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
