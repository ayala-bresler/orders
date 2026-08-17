import { useEffect, useRef, useState } from 'react';
import { applySessionFromIdentifyResult } from '../utils/sessionAuth.js';
import { deleteMyCustomer, fetchMyCustomers, selectMyCustomer } from '../storeApi.js';
import ConfirmDialog from './ConfirmDialog.jsx';
import { IconTrash } from './Icons.jsx';
import { formatItemPlateDiameter } from '../utils/orderItemDisplay.js';

function listModelLabel(customer) {
  const name = String(customer.model_name || '').trim();
  const plate = formatItemPlateDiameter(customer);
  if (name && plate) return `${name} · ${plate}`;
  return name || plate || '—';
}

/**
 * Store orders list (formerly “customers”) — select to resume, or delete permanently.
 */
export default function MyCustomersPanel({
  onSelected,
  open: openProp,
  onOpenChange,
  showToggle = true,
  variant = 'default',
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp !== undefined ? openProp : internalOpen;
  const setOpen = (next) => {
    const value = typeof next === 'function' ? next(open) : next;
    if (openProp === undefined) setInternalOpen(value);
    onOpenChange?.(value);
  };
  const [customers, setCustomers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const tableWrapRef = useRef(null);

  const filtered = customers.filter((c) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return (
      String(c.full_name || '').toLowerCase().includes(q) ||
      String(c.phone || '').includes(q) ||
      String(c.model_name || '').toLowerCase().includes(q) ||
      String(c.plate_diameter || '').includes(q) ||
      String(c.order_id || '').includes(q)
    );
  });

  const reload = async () => {
    setBusy(true);
    setError('');
    try {
      const data = await fetchMyCustomers();
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
      setBusy(true);
      setError('');
      try {
        const data = await fetchMyCustomers();
        if (!cancelled) setCustomers(data.customers || []);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setShowScrollTop(false);
      return undefined;
    }

    const tableWrap = tableWrapRef.current;

    const onScroll = () => {
      const pageY =
        window.scrollY ||
        document.documentElement.scrollTop ||
        document.body.scrollTop ||
        0;
      const tableY = tableWrap?.scrollTop || 0;
      setShowScrollTop(pageY > 60 || tableY > 40);
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    tableWrap?.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      tableWrap?.removeEventListener('scroll', onScroll);
    };
  }, [open, customers.length, filtered.length]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.documentElement.scrollTo?.({ top: 0, behavior: 'smooth' });
    document.body.scrollTo?.({ top: 0, behavior: 'smooth' });
    tableWrapRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const pick = async (customer) => {
    setBusy(true);
    setError('');
    try {
      const result = await selectMyCustomer(customer.customer_id);
      onSelected(applySessionFromIdentifyResult(result));
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
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
      await deleteMyCustomer(pendingDelete.customer_id);
      setPendingDelete(null);
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="my-customers-panel">
      {showToggle ? (
        <button
          type="button"
          className="btn my-customers-toggle"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'סגור רשימת הזמנות' : 'כל ההזמנות שלי'}
        </button>
      ) : null}

      {open && (
        <div
          className={`my-customers-box card${showToggle ? '' : ' my-customers-box--embedded'}${
            variant === 'main' ? ' my-customers-box--main' : ''
          }`}
        >
          <h3>הזמנות קיימות</h3>
          <label className="field">
            <span>חיפוש</span>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="שם / מספר הזמנה / דגם"
            />
          </label>
          {error && <div className="notice error inline">{error}</div>}
          {busy && !customers.length ? (
            <p className="hint">טוען…</p>
          ) : filtered.length === 0 ? (
            <p className="hint">אין הזמנות משויכות לחנות עדיין.</p>
          ) : (
            <div className="my-customers-table-wrap" ref={tableWrapRef}>
              <table className="my-customers-table">
                <thead>
                  <tr>
                    <th className="col-name">שם</th>
                    <th className="col-model">דגם</th>
                    <th className="col-phone">מספר הזמנה</th>
                    <th className="col-actions" aria-label="פעולות" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr
                      key={c.customer_id}
                      className="customer-row"
                      onClick={() => !busy && pick(c)}
                    >
                      <td className="col-name">
                        <button
                          type="button"
                          className="customer-name-hit"
                          disabled={busy}
                          onClick={(e) => {
                            e.stopPropagation();
                            pick(c);
                          }}
                        >
                          {c.full_name}
                        </button>
                      </td>
                      <td className="col-model">{listModelLabel(c)}</td>
                      <td className="col-phone" dir="ltr">
                        {c.phone}
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

      {open && showScrollTop && (
        <button
          type="button"
          className="my-customers-scroll-top"
          onClick={scrollToTop}
          aria-label="חזרה לראש הדף"
          title="חזרה לראש הדף"
        >
          <span aria-hidden="true">↑</span>
        </button>
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
