import { useEffect, useRef, useState } from 'react';
import { applySessionFromIdentifyResult } from '../utils/sessionAuth.js';
import { fetchMyCustomers, selectMyCustomer } from '../storeApi.js';

/**
 * Allowed extension #1 — list store customers and skip identify on select.
 */
export default function MyCustomersPanel({
  onSelected,
  open: openProp,
  onOpenChange,
  showToggle = true,
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
  const tableWrapRef = useRef(null);

  const filtered = customers.filter((c) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return (
      String(c.full_name || '').toLowerCase().includes(q) ||
      String(c.phone || '').includes(q) ||
      String(c.email || '').toLowerCase().includes(q)
    );
  });

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

  return (
    <div className="my-customers-panel">
      {showToggle ? (
        <button
          type="button"
          className="btn my-customers-toggle"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'סגור רשימת לקוחות' : 'כל הלקוחות שלי'}
        </button>
      ) : null}

      {open && (
        <div className={`my-customers-box card${showToggle ? '' : ' my-customers-box--embedded'}`}>
          <h3>לקוחות החנות</h3>
          <label className="field">
            <span>חיפוש</span>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="שם / טלפון / אימייל"
            />
          </label>
          {error && <div className="notice error inline">{error}</div>}
          {busy && !customers.length ? (
            <p className="hint">טוען…</p>
          ) : filtered.length === 0 ? (
            <p className="hint">אין לקוחות משויכים לחנות עדיין.</p>
          ) : (
            <div className="my-customers-table-wrap" ref={tableWrapRef}>
              <table className="my-customers-table">
                <thead>
                  <tr>
                    <th className="col-name">שם</th>
                    <th className="col-phone">טלפון</th>
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
                      <td className="col-phone" dir="ltr">
                        {c.phone}
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
    </div>
  );
}
