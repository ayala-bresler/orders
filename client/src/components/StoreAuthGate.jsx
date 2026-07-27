import { useState } from 'react';
import { activateStore, enterStore, saveStoreEmail } from '../storeApi.js';
import { loginAdmin } from '../adminApi.js';

/**
 * Store gate: name + password first.
 * First activation: set permanent password + email in one screen.
 * Admin: login name from ADMIN_LOGIN_NAME (default מנהל) + ADMIN_SECRET.
 */
export default function StoreAuthGate({ onAuthenticated, onAdminAuthenticated, initialStep = 'entry' }) {
  const [step, setStep] = useState(initialStep); // entry | set_password | set_email
  const [storeName, setStoreName] = useState('');
  const [password, setPassword] = useState('');
  const [storeEmail, setStoreEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submitEntry = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      // Try system admin first (ADMIN_SECRET) — same form fields.
      if (typeof onAdminAuthenticated === 'function') {
        try {
          const adminData = await loginAdmin({
            storeName: storeName.trim(),
            password,
          });
          if (adminData?.ok || adminData?.admin) {
            onAdminAuthenticated(adminData.admin);
            return;
          }
        } catch (adminErr) {
          // Not admin credentials — continue as store login.
          if (adminErr.status && adminErr.status !== 401 && adminErr.status !== 503) {
            throw adminErr;
          }
        }
      }

      const data = await enterStore({
        storeName: storeName.trim(),
        password,
      });
      if (data.needsPasswordSetup) {
        setAdminPassword(password);
        setNewPassword('');
        setNewPassword2('');
        setStoreEmail(data.storeEmail || '');
        setStep('set_password');
        return;
      }
      if (data.needsEmailSetup || data.store?.needsEmailSetup) {
        setStoreEmail(data.store?.storeEmail || '');
        setStep('set_email');
        return;
      }
      onAuthenticated(data.store);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitNewPassword = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (newPassword !== newPassword2) {
        setError('הסיסמאות אינן תואמות.');
        return;
      }
      if (newPassword.length < 6) {
        setError('הסיסמה חייבת להכיל לפחות 6 תווים.');
        return;
      }
      const email = storeEmail.trim();
      if (!email || !email.includes('@')) {
        setError('נא להזין כתובת אימייל תקינה של החנות.');
        return;
      }
      const data = await activateStore({
        storeName: storeName.trim(),
        activationCode: adminPassword,
        password: newPassword,
        storeEmail: email,
      });
      onAuthenticated(data.store);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitEmail = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const email = storeEmail.trim();
      if (!email || !email.includes('@')) {
        setError('נא להזין כתובת אימייל תקינה של החנות.');
        return;
      }
      const data = await saveStoreEmail({ storeEmail: email });
      onAuthenticated(data.store);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="main-identify">
      <div className="identify-brand">
        <img
          className="identify-logo"
          src="/img-judaica-logo.png?v=3"
          alt="IMG JUDAICA LTD — אי אמ ג'י יודאיקה בע״מ"
        />
      </div>

      {step === 'entry' && (
        <form className="card identify store-auth-card" onSubmit={submitEntry}>
          <h2>כניסת חנות</h2>

          <label className="field">
            <span>שם החנות</span>
            <input
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              autoComplete="username"
              required
            />
          </label>

          <label className="field">
            <span>סיסמה</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error && <div className="notice error inline">{error}</div>}

          <div className="identify-actions">
            <button className="btn primary identify-submit" type="submit" disabled={busy}>
              {busy ? 'טוען…' : 'התחברות'}
            </button>
          </div>
        </form>
      )}

      {step === 'set_password' && (
        <form className="card identify store-auth-card" onSubmit={submitNewPassword}>
          <h2>הגדרת סיסמת חנות</h2>
          <p className="hint store-auth-hint store-admin-password-note">
            הסיסמה שהוזנה היא סיסמה מהמנהל (קוד הפעלה חד־פעמי). כעת קבעו סיסמה קבועה
            לחנות — רק איתה תוכלו להתחבר ממכשירים נוספים או בעת התנתקות.
          </p>

          <label className="field">
            <span>שם החנות</span>
            <input value={storeName} readOnly disabled />
          </label>

          <label className="field">
            <span>סיסמה חדשה לחנות</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={6}
            />
          </label>

          <label className="field">
            <span>אימות סיסמה</span>
            <input
              type="password"
              value={newPassword2}
              onChange={(e) => setNewPassword2(e.target.value)}
              autoComplete="new-password"
              required
              minLength={6}
            />
          </label>

          <label className="field">
            <span>אימייל החנות</span>
            <input
              type="email"
              value={storeEmail}
              onChange={(e) => setStoreEmail(e.target.value)}
              autoComplete="email"
              placeholder="name@gmail.com"
              required
            />
          </label>

          {error && <div className="notice error inline">{error}</div>}

          <div className="identify-actions">
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => {
                setStep('entry');
                setError('');
                setNewPassword('');
                setNewPassword2('');
              }}
            >
              חזרה
            </button>
            <button className="btn primary identify-submit" type="submit" disabled={busy}>
              {busy ? 'שומר…' : 'שמירה והמשך'}
            </button>
          </div>
        </form>
      )}

      {step === 'set_email' && (
        <form className="card identify store-auth-card" onSubmit={submitEmail}>
          <h2>אימייל החנות</h2>
          <p className="hint store-auth-hint">
            חסר אימייל לחנות. הזינו כתובת לקבלת עותק PDF — יישמר פעם אחת בלבד.
          </p>

          <label className="field">
            <span>אימייל החנות</span>
            <input
              type="email"
              value={storeEmail}
              onChange={(e) => setStoreEmail(e.target.value)}
              autoComplete="email"
              placeholder="name@gmail.com"
              required
            />
          </label>

          {error && <div className="notice error inline">{error}</div>}

          <div className="identify-actions">
            <button className="btn primary identify-submit" type="submit" disabled={busy}>
              {busy ? 'שומר…' : 'שמירה והמשך'}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
