'use strict';

/**
 * Response wrapper: after identify/confirm, bind customer.store_id to the
 * authenticated store without modifying customerService / customers routes.
 */

const { bindCustomerToStore } = require('./storeAuthService');

function wrapCustomerJsonWithStoreBind(req, res, next) {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    const customerId = body?.customer?.customer_id;
    const storeId = req.store?.storeId;
    if (!customerId || !storeId || body?.needsConfirmation) {
      return originalJson(body);
    }
    return bindCustomerToStore(customerId, storeId)
      .then((bound) => {
        if (!bound) return originalJson(body);
        return originalJson({
          ...body,
          customer: { ...body.customer, store_id: bound.store_id },
          storeId,
        });
      })
      .catch((err) => {
        console.warn('[store-bind] failed:', err.message);
        return originalJson(body);
      });
  };
  next();
}

module.exports = {
  wrapCustomerJsonWithStoreBind,
};
