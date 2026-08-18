import { formatAccessoryLine, mainModelName } from '../utils/orderItemDisplay.js';
import BidiText from './BidiText.jsx';

/** Order line: large main model + smaller accessory models when they differ. */
export default function OrderItemSummary({ item, size = 'default' }) {
  const accessories = formatAccessoryLine(item);
  const main = mainModelName(item);
  return (
    <div className={`order-item-summary${size === 'compact' ? ' order-item-summary--compact' : ''}`}>
      <BidiText as="div" className="order-item-main" value={main}>
        {main}
      </BidiText>
      {accessories ? (
        <BidiText as="div" className="order-item-accessories" value={accessories}>
          {accessories}
        </BidiText>
      ) : null}
    </div>
  );
}
