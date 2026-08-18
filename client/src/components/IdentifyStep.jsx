import { useState } from 'react';
import { confirmNewCustomer, identifyCustomer } from '../api.js';
import { detectTextDir } from '../utils/textDirection.js';
import MyCustomersPanel from './MyCustomersPanel.jsx';
import AdminBrowsePanel from './AdminBrowsePanel.jsx';

/**
 * Store home: orders list is the main surface; “הזמנה חדשה” opens a popup form.
 * New orders are created immediately (no confirmation dialog).
 */
export default function IdentifyStep({ onIdentified, isAdmin = false }) {
  const [newOpen, setNewOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const openNew = () => {
    setError('');
    setFullName('');
    setPhone('');
    setNewOpen(true);
  };

  const closeNew = () => {
    if (busy) return;
    setNewOpen(false);
    setError('');
  };

  const submitNew = async (e) => {
    e.preventDefault();
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.length < 1) {
      setError('נא להזין מספר הזמנה ידני.');
      return;
    }
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setError('נא להזין שם מלא.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const lookedUp = await identifyCustomer({ phone: digits });
      if (lookedUp.isNew && lookedUp.needsConfirmation) {
        const created = await confirmNewCustomer({
          phone: lookedUp.phone || digits,
          full_name: trimmedName,
        });
        setNewOpen(false);
        onIdentified(created);
        return;
      }
      setNewOpen(false);
      onIdentified(lookedUp);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="identify-brand">
        <img
          className="identify-logo"
          src="/img-judaica-logo-with-bg.png?v=5"
          alt="IMG JUDAICA LTD — אי אמ ג'י יודאיקה בע״מ"
        />
      </div>

      <div className="identify-home">
        <button
          type="button"
          className="btn primary identify-new-cta"
          onClick={openNew}
        >
          הזמנה חדשה
        </button>

        <div className="identify-orders-main">
          {isAdmin ? (
            <AdminBrowsePanel
              open
              onOpenChange={() => {}}
              showToggle={false}
              onSelected={onIdentified}
            />
          ) : (
            <MyCustomersPanel
              open
              onOpenChange={() => {}}
              showToggle={false}
              variant="main"
              onSelected={onIdentified}
            />
          )}
        </div>
      </div>

      {newOpen ? (
        <div
          className="confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-order-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeNew();
          }}
        >
          <form className="confirm-dialog card identify-new-dialog" onSubmit={submitNew}>
            <h3 id="new-order-title">הזמנה חדשה</h3>
            <label className="field">
              <span>שם מלא *</span>
              <input
                className="bidi-input"
                dir={detectTextDir(fullName)}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoFocus
                required
              />
            </label>
            <label className="field field-order-number">
              <span>מספר הזמנה *</span>
              <input
                className="bidi-ltr"
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="numeric"
                required
              />
            </label>
            {error ? <div className="notice error inline">{error}</div> : null}
            <div className="actions">
              <button type="button" className="btn" onClick={closeNew} disabled={busy}>
                ביטול
              </button>
              <button type="submit" className="btn primary" disabled={busy}>
                {busy ? 'נכנס…' : 'המשך'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
