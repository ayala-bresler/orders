/** Shared “order sent” markers for completed order items. */
export const ORDER_SENT_LABEL = 'ההזמנה נשלחה';

/**
 * @param {{ variant?: 'card' | 'diagonal' | 'sticky', className?: string }} props
 */
export default function OrderSentMarker({ variant = 'diagonal', className = '' }) {
  const classes = [
    'order-sent-marker',
    `order-sent-marker--${variant}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} role="status" aria-label={ORDER_SENT_LABEL}>
      <span className="order-sent-marker-text">{ORDER_SENT_LABEL}</span>
    </div>
  );
}
