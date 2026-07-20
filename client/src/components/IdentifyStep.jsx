import { useState } from 'react';
import { confirmNewCustomer, identifyCustomer } from '../api.js';

/**
 * Step 1 — phone-based login. Existing customers use the name from the DB.
 * New phone numbers trigger a confirmation popup before creating a record.
 */
export default function IdentifyStep({ onIdentified }) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pendingNew, setPendingNew] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await identifyCustomer({
        phone,
        email: email || undefined,
      });
      if (result.isNew && result.needsConfirmation) {
        const trimmedName = fullName.trim();
        if (!trimmedName) {
          setError('נא להזין שם מלא ללקוח חדש.');
          return;
        }
        setPendingNew({
          phone: result.phone || phone,
          email: email || '',
          full_name: trimmedName,
        });
        return;
      }
      onIdentified(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmNew = async () => {
    if (!pendingNew) return;
    setBusy(true);
    setError('');
    try {
      const result = await confirmNewCustomer({
        phone: pendingNew.phone,
        full_name: pendingNew.full_name,
        email: pendingNew.email || email || undefined,
      });
      setPendingNew(null);
      onIdentified(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const cancelNew = () => {
    setPendingNew(null);
    setError('');
  };

  return (
    <>
      <div className="identify-brand">
        <img
          className="identify-logo"
          src="/img-judaica-logo.png?v=2"
          alt="IMG JUDAICA LTD — אי אמ ג'י יודאיקה בע״מ"
        />
      </div>
      <form className="card identify" onSubmit={submit}>
        <h2>כניסה למערכת ההזמנות</h2>

        <label className="field">
          <span>שם מלא</span>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label className="field">
          <span>טלפון *</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            placeholder="050-0000000"
            required
          />
        </label>
        <label className="field">
          <span>דוא"ל</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" />
        </label>

        {error && !pendingNew && <div className="notice error inline">{error}</div>}

        <div className="identify-actions">
          <button className="btn primary identify-submit" type="submit" disabled={busy}>
            {busy ? 'טוען…' : 'אישור'}
          </button>
        </div>
      </form>

      {pendingNew && (
        <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="new-customer-title">
          <div className="confirm-dialog card">
            <h3 id="new-customer-title">לקוח חדש</h3>
            <p className="hint">
              מספר הטלפון <strong dir="ltr">{pendingNew.phone}</strong> לא נמצא במערכת.
              <br />
              האם לאשר הוספת <strong>{pendingNew.full_name}</strong> כלקוח חדש?
            </p>
            {error && <div className="notice error inline">{error}</div>}
            <div className="actions">
              <button type="button" className="btn" onClick={cancelNew} disabled={busy}>
                ביטול
              </button>
              <button type="button" className="btn primary" onClick={handleConfirmNew} disabled={busy}>
                {busy ? 'שומר…' : 'אישור והמשך'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
