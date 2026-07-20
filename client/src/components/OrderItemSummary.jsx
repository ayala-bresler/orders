import { formatAccessoryLine, mainModelName } from '../utils/orderItemDisplay.js';

/** Order line: large main model + smaller accessory models when they differ. */
export default function OrderItemSummary({ item, size = 'default' }) {
  const accessories = formatAccessoryLine(item);
  return (
    <div className={`order-item-summary${size === 'compact' ? ' order-item-summary--compact' : ''}`}>
      <div className="order-item-main">{mainModelName(item)}</div>
      {accessories ? <div className="order-item-accessories">{accessories}</div> : null}
    </div>
  );
}
