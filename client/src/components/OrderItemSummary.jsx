import {
  formatItemPlateDiameter,
  formatProductSummaryLine,
  orderItemImageModelCode,
} from '../utils/orderItemDisplay.js';
import BidiText from './BidiText.jsx';

/**
 * Order-line card text: one-line product summary, plate diameter last.
 */
export default function OrderItemSummary({ item, size = 'default' }) {
  const imageCode = orderItemImageModelCode(item);
  const summary = formatProductSummaryLine(item, imageCode);
  const plate = formatItemPlateDiameter(item);

  return (
    <div className={`order-item-summary${size === 'compact' ? ' order-item-summary--compact' : ''}`}>
      {summary ? (
        <BidiText as="div" className="order-item-main" value={summary}>
          {summary}
        </BidiText>
      ) : null}
      {plate ? (
        <BidiText as="div" className="order-item-plate" value={`מידה ${plate}`}>
          מידה {plate}
        </BidiText>
      ) : null}
    </div>
  );
}
