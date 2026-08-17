/**
 * Auto order id (#N) + manual store order number (customers.phone).
 */
export function formatOrderRef(orderId, manualNumber) {
  const auto = orderId != null && orderId !== '' ? `#${orderId}` : '';
  const manual = String(manualNumber || '').trim();
  if (auto && manual) return `${auto} · ${manual}`;
  return auto || manual || '';
}

export function formatOrderHeading(orderId, manualNumber) {
  const ref = formatOrderRef(orderId, manualNumber);
  return ref ? `הזמנה ${ref}` : 'הזמנה';
}
