import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/** Shared “order sent” markers for completed order items. */
export const ORDER_SENT_LABEL = 'ההזמנה נשלחה';

const DEFAULT_CONTENT_ANCHOR = '.main-content-container';

/**
 * Diagonal ribbon portals into the main content area (below tabs header),
 * never into the SVG preview box or the header/tabs bar.
 *
 * @param {object} props
 * @param {'card'|'diagonal'|'sticky'} [props.variant]
 * @param {string} [props.className]
 * @param {string} [props.anchorSelector] Portal root (default `.main-content-container`)
 * @param {boolean} [props.visible]
 * @param {boolean} [props.portal] Portal diagonal into content root. Default true.
 */
export default function OrderSentMarker({
  variant = 'diagonal',
  className = '',
  anchorSelector = DEFAULT_CONTENT_ANCHOR,
  visible = true,
  portal,
}) {
  const [portalRoot, setPortalRoot] = useState(null);

  const usePortal =
    (portal ?? variant === 'diagonal') &&
    variant === 'diagonal' &&
    typeof document !== 'undefined';

  useLayoutEffect(() => {
    if (!visible || !usePortal) {
      setPortalRoot(null);
      return undefined;
    }
    const root =
      (anchorSelector && document.querySelector(anchorSelector)) ||
      document.querySelector(DEFAULT_CONTENT_ANCHOR) ||
      document.body;
    setPortalRoot(root);
    return undefined;
  }, [visible, usePortal, anchorSelector]);

  if (!visible) return null;

  const classes = [
    'order-sent-marker',
    `order-sent-marker--${variant}`,
    usePortal ? 'order-sent-marker--portaled' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const marker = (
    <div className={classes} role="status" aria-label={ORDER_SENT_LABEL}>
      <span className="order-sent-marker-text">{ORDER_SENT_LABEL}</span>
    </div>
  );

  if (!usePortal) {
    return marker;
  }

  if (!portalRoot) return null;
  return createPortal(marker, portalRoot);
}
