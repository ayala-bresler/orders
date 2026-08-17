import { useEffect, useState } from 'react';
import { applySessionFromIdentifyResult } from '../utils/sessionAuth.js';
import {
  createAdminStore,
  fetchAdminCustomers,
  fetchAdminStores,
  selectAdminCustomer,
} from '../adminApi.js';
import { formatItemPlateDiameter } from '../utils/orderItemDisplay.js';

function listModelLabel(customer) {
  const name = String(customer.model_name || '').trim();
  const plate = formatItemPlateDiameter(customer);
  if (name && plate) return `${name} · ${plate}`;
  return name || plate || '—';
}

/**
 * Admin browse: toggle חנויות / הזמנות.
 * Selecting a store filters to that store's orders.
 */
export default function AdminBrowsePanel({
  onSelected,
  open: openProp,
  onOpenChange,
  showToggle = true,
}) {
  const [mode, setMode] = useState('customers'); // customers | stores
  const [internalOpen, setInternalOpen] = useState(true);
  const open = openProp !== undefined ? openProp : internalOpen;
  const setOpen = (next) => {
    const value = typeof next === 'function' ? next(open) : next;
    if (openProp === undefined) setInternalOpen(value);
    onOpenChange?.(value);
  };
  const [stores, setStores] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState(null);
  const [selectedStoreName, setSelectedStoreName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [newStoreName, setNewStoreName] = useState('');
  const [newStorePassword, setNewStorePassword] = useState('');
  const [createNotice, setCreateNotice] = useState('');

  const loadStores = async () => {
    setBusy(true);
    setError('');
    try {
      const data = await fetchAdminStores();
      setStores(data.stores || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const loadCustomers = async (storeId = selectedStoreId) => {
    setBusy(true);
    setError('');
    try {
      const data = await fetchAdminCustomers(storeId);
      setCustomers(data.customers || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    (async () => {
      if (mode === 'stores') {
        if (!cancelled) await loadStores();
      } else if (!cancelled) {
        await loadCustomers(selectedStoreId);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, selectedStoreId]);

  const pickCustomer = async (customer) => {
    setBusy(true);
    setError('');
    try {
      const result = await selectAdminCustomer(customer.customer_id);
      onSelected(applySessionFromIdentifyResult(result));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const pickStore = (store) => {
    setSelectedStoreId(store.storeId);
    setSelectedStoreName(store.storeName);
    setMode('customers');
    setFilter('');
  };

  const clearStoreFilter = () => {
    setSelectedStoreId(null);
    setSelectedStoreName('');
  };

  const submitNewStore = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setCreateNotice('');
    try {
      const data = await createAdminStore({
        storeName: newStoreName.trim(),
        temporaryPassword: newStorePassword,
      });
      setNewStoreName('');
      setNewStorePassword('');
      setCreateNotice(`החנות «${data.store?.storeName || ''}» נוספה עם סיסמה זמנית.`);
      await loadStores();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const filteredCustomers = customers.filter((c) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return (
      String(c.full_name || '').toLowerCase().includes(q) ||
      String(c.phone || '').includes(q) ||
      String(c.model_name || '').toLowerCase().includes(q) ||
      String(c.plate_diameter || '').includes(q) ||
      String(c.order_id || '').includes(q) ||
      String(c.store_name || '').toLowerCase().includes(q)
    );
  });

  const filteredStores = stores.filter((s) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return String(s.storeName || '').toLowerCase().includes(q);
  });

  return (
    <div className="my-customers-panel admin-browse-panel">
      {showToggle ? (
        <button
          type="button"
          className="btn my-customers-toggle"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'סגור ניהול הזמנות/חנויות' : 'ניהול הזמנות וחנויות'}
        </button>
      ) : null}

      {open && (
        <div className={`my-customers-box card${showToggle ? '' : ' my-customers-box--embedded'}`}>
          <div className="admin-mode-toggle" role="tablist" aria-label="תצוגת מנהל">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'customers'}
              className={`admin-mode-btn${mode === 'customers' ? ' active' : ''}`}
              onClick={() => {
                setMode('customers');
                setFilter('');
                setCreateNotice('');
              }}
            >
              הזמנות
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'stores'}
              className={`admin-mode-btn${mode === 'stores' ? ' active' : ''}`}
              onClick={() => {
                setMode('stores');
                setFilter('');
              }}
            >
              חנויות
            </button>
          </div>

          {mode === 'customers' && selectedStoreId ? (
            <div className="admin-customers-heading">
              <span className="admin-store-filter-label">{selectedStoreName}</span>
              <button
                type="button"
                className="admin-clear-store"
                onClick={clearStoreFilter}
              >
                הכל
              </button>
            </div>
          ) : null}

          {mode === 'stores' ? (
            <form className="admin-add-store" onSubmit={submitNewStore}>
              <label className="field">
                <span>שם חנות חדשה</span>
                <input
                  value={newStoreName}
                  onChange={(e) => setNewStoreName(e.target.value)}
                  placeholder="שם החנות"
                  required
                  disabled={busy}
                />
              </label>
              <label className="field">
                <span>סיסמה זמנית</span>
                <input
                  type="text"
                  value={newStorePassword}
                  onChange={(e) => setNewStorePassword(e.target.value)}
                  placeholder="סיסמה לכניסה ראשונה"
                  required
                  minLength={4}
                  disabled={busy}
                  autoComplete="off"
                />
              </label>
              <button type="submit" className="btn primary small" disabled={busy}>
                {busy ? 'שומר…' : 'הוספת חנות'}
              </button>
            </form>
          ) : null}

          <label className="field">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={
                mode === 'stores' ? 'חיפוש שם חנות' : 'שם / מספר הזמנה / דגם / חנות'
              }
              aria-label={mode === 'stores' ? 'חיפוש שם חנות' : 'חיפוש הזמנות'}
            />
          </label>

          {error && <div className="notice error inline">{error}</div>}
          {createNotice && mode === 'stores' ? (
            <div className="notice inline admin-create-notice">{createNotice}</div>
          ) : null}
          {busy && !(mode === 'stores' ? stores.length : customers.length) ? (
            <p className="hint">טוען…</p>
          ) : mode === 'stores' ? (
            filteredStores.length === 0 ? (
              <p className="hint">אין חנויות במערכת.</p>
            ) : (
              <ul className="admin-stores-list">
                {filteredStores.map((s) => (
                  <li key={s.storeId}>
                    <button
                      type="button"
                      className="admin-store-row"
                      disabled={busy}
                      onClick={() => pickStore(s)}
                    >
                      {s.storeName}
                      {!s.activated ? (
                        <span className="admin-store-pending"> · ממתין להפעלה</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : filteredCustomers.length === 0 ? (
            <p className="hint">אין הזמנות להצגה.</p>
          ) : (
            <div className="my-customers-table-wrap">
              <table className="my-customers-table">
                <thead>
                  <tr>
                    <th className="col-name">שם</th>
                    <th className="col-model">דגם</th>
                    <th className="col-phone">מספר הזמנה</th>
                    {!selectedStoreId ? <th className="col-store">חנות</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map((c) => (
                    <tr
                      key={c.customer_id}
                      className="customer-row"
                      onClick={() => !busy && pickCustomer(c)}
                    >
                      <td className="col-name">
                        <button
                          type="button"
                          className="customer-name-hit"
                          disabled={busy}
                          onClick={(e) => {
                            e.stopPropagation();
                            pickCustomer(c);
                          }}
                        >
                          {c.full_name}
                        </button>
                      </td>
                      <td className="col-model">{listModelLabel(c)}</td>
                      <td className="col-phone" dir="ltr">
                        {c.phone}
                      </td>
                      {!selectedStoreId ? (
                        <td className="col-store">{c.store_name || '—'}</td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
