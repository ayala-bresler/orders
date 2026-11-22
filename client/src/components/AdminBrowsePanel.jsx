import { useEffect, useMemo, useState } from 'react';
import { applySessionFromIdentifyResult } from '../utils/sessionAuth.js';
import {
  advanceAdminItemStatus,
  advanceAdminOrderStatus,
  createAdminStore,
  deleteAdminCustomer,
  fetchAdminCustomers,
  fetchAdminStores,
  selectAdminCustomer,
} from '../adminApi.js';
import OrderStatusCell from './OrderStatusCell.jsx';
import StatusColumnFilter from './StatusColumnFilter.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import { IconTrash } from './Icons.jsx';
import { formatItemPlateDiameter } from '../utils/orderItemDisplay.js';
import { detectTextDir } from '../utils/textDirection.js';
import { rowMatchesStatusFilter, STATUS_ORDER } from '../utils/orderStatus.js';
import BidiText from './BidiText.jsx';

/** Compare manual order numbers: numeric when both are digits, else locale text. */
function compareOrderNumbers(a, b) {
  const pa = String(a?.phone || '').trim();
  const pb = String(b?.phone || '').trim();
  const na = /^\d+$/.test(pa) ? Number(pa) : NaN;
  const nb = /^\d+$/.test(pb) ? Number(pb) : NaN;
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  if (Number.isFinite(na) && !Number.isFinite(nb)) return -1;
  if (!Number.isFinite(na) && Number.isFinite(nb)) return 1;
  return pa.localeCompare(pb, 'he', { numeric: true, sensitivity: 'base' });
}

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
  const [orderNumberDir, setOrderNumberDir] = useState('asc');
  const [shownStatuses, setShownStatuses] = useState(() => new Set(STATUS_ORDER));
  const [newStoreName, setNewStoreName] = useState('');
  const [newStorePassword, setNewStorePassword] = useState('');
  const [createNotice, setCreateNotice] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

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

  const advanceStatus = async ({ orderId, itemId, status }) => {
    const data = itemId
      ? await advanceAdminItemStatus(orderId, itemId, status)
      : await advanceAdminOrderStatus(orderId, status);
    setCustomers((prev) =>
      prev.map((row) => {
        if (Number(row.order_id) !== Number(orderId)) return row;
        if (!itemId) return { ...row, order_status: data.status };
        return {
          ...row,
          items: (row.items || []).map((it) =>
            Number(it.order_item_id) === Number(itemId) ? { ...it, status: data.status } : it
          ),
        };
      })
    );
    return data.warnings || [];
  };

  const requestDelete = (customer, e) => {
    e?.stopPropagation?.();
    e?.preventDefault?.();
    setPendingDelete(customer);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setError('');
    try {
      await deleteAdminCustomer(pendingDelete.customer_id);
      setPendingDelete(null);
      await loadCustomers(selectedStoreId);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

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

  const filteredCustomers = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = customers.filter((c) => {
      if (q && !String(c.phone || '').toLowerCase().includes(q)) return false;
      return rowMatchesStatusFilter(c.order_id, c.order_status, c.items, shownStatuses);
    });
    const sorted = [...list].sort(compareOrderNumbers);
    if (orderNumberDir === 'desc') sorted.reverse();
    return sorted;
  }, [customers, filter, orderNumberDir, shownStatuses]);

  const toggleShownStatus = (id) => {
    setShownStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleOrderNumberSort = (e) => {
    e?.stopPropagation?.();
    e?.preventDefault?.();
    setOrderNumberDir((d) => (d === 'asc' ? 'desc' : 'asc'));
  };

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
                  className="bidi-input"
                  dir={detectTextDir(newStoreName)}
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
                  className="bidi-ltr"
                  dir="ltr"
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
              className="bidi-input"
              dir={detectTextDir(filter)}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={
                mode === 'stores' ? 'חיפוש שם חנות' : 'מספר הזמנה'
              }
              aria-label={mode === 'stores' ? 'חיפוש שם חנות' : 'חיפוש לפי מספר הזמנה'}
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
                      <BidiText as="span" value={s.storeName}>
                        {s.storeName}
                      </BidiText>
                      {!s.activated ? (
                        <span className="admin-store-pending"> · ממתין להפעלה</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : customers.length === 0 ? (
            <p className="hint">אין הזמנות להצגה.</p>
          ) : (
            <div className="my-customers-table-wrap">
              <table className="my-customers-table">
                <thead>
                  <tr>
                    <th className="col-name">שם</th>
                    <th className="col-model">דגם</th>
                    <th className="col-phone">
                      <button
                        type="button"
                        className="orders-sort-btn"
                        onClick={toggleOrderNumberSort}
                        aria-label={
                          orderNumberDir === 'asc'
                            ? 'מיון מספר הזמנה בסדר עולה — לחץ לסדר יורד'
                            : 'מיון מספר הזמנה בסדר יורד — לחץ לסדר עולה'
                        }
                        title={
                          orderNumberDir === 'asc'
                            ? 'סדר עולה — לחץ להיפוך'
                            : 'סדר יורד — לחץ להיפוך'
                        }
                      >
                        <span>מספר הזמנה</span>
                        <span
                          className={`orders-sort-arrow${
                            orderNumberDir === 'desc' ? ' is-desc' : ''
                          }`}
                          aria-hidden="true"
                        >
                          ▲
                        </span>
                      </button>
                    </th>
                    {!selectedStoreId ? <th className="col-store">חנות</th> : null}
                    <th className="col-status">
                      <StatusColumnFilter shown={shownStatuses} onToggleStatus={toggleShownStatus} />
                    </th>
                    <th className="col-actions" aria-label="פעולות" />
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.length === 0 ? (
                    <tr>
                      <td className="orders-empty-cell" colSpan={selectedStoreId ? 5 : 6}>
                        אין הזמנות להצגה.
                      </td>
                    </tr>
                  ) : null}
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
                          <BidiText as="span" value={c.full_name}>
                            {c.full_name}
                          </BidiText>
                        </button>
                      </td>
                      <td className="col-model">
                        <BidiText as="span" value={listModelLabel(c)}>
                          {listModelLabel(c)}
                        </BidiText>
                      </td>
                      <td className="col-phone bidi-ltr" dir="ltr">
                        {c.phone}
                      </td>
                      {!selectedStoreId ? (
                        <td className="col-store">
                          <BidiText as="span" value={c.store_name || '—'}>
                            {c.store_name || '—'}
                          </BidiText>
                        </td>
                      ) : null}
                      <td className="col-status" onClick={(e) => e.stopPropagation()}>
                        <OrderStatusCell
                          orderId={c.order_id}
                          orderStatus={c.order_status}
                          items={c.items}
                          shownStatuses={shownStatuses}
                          disabled={busy || deleting}
                          onAdvance={async (payload) => {
                            setError('');
                            try {
                              return await advanceStatus(payload);
                            } catch (err) {
                              setError(err.message);
                              throw err;
                            }
                          }}
                        />
                      </td>
                      <td className="col-actions">
                        <button
                          type="button"
                          className="orders-row-delete"
                          disabled={busy || deleting}
                          onClick={(e) => requestDelete(c, e)}
                          aria-label={`מחיקת הזמנה ${c.phone || c.full_name}`}
                          title="מחיקת הזמנה"
                        >
                          <IconTrash />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="מחיקת הזמנה"
        message={
          pendingDelete
            ? `למחוק סופית את ההזמנה של «${pendingDelete.full_name}» (מספר ${pendingDelete.phone})? לא ניתן לשחזר.`
            : ''
        }
        confirmLabel="מחיקה סופית"
        cancelLabel="ביטול"
        danger
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => !deleting && setPendingDelete(null)}
      />
    </div>
  );
}
