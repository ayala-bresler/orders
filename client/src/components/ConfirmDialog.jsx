/**
 * Modal confirmation dialog — used for destructive actions (delete, etc.).
 * Optional secondary action (e.g. "דלג") appears between cancel and confirm.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'אישור',
  cancelLabel = 'ביטול',
  secondaryLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
  onSecondary,
}) {
  if (!open) return null;

  return (
    <div
      className="confirm-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel?.();
      }}
    >
      <div className="confirm-dialog card">
        <h3 id="confirm-dialog-title">{title}</h3>
        {message ? <p className="hint confirm-dialog-message">{message}</p> : null}
        <div className="actions">
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          {secondaryLabel ? (
            <button type="button" className="btn" onClick={onSecondary} disabled={busy}>
              {busy ? 'מבצע…' : secondaryLabel}
            </button>
          ) : null}
          <button
            type="button"
            className={`btn${danger ? ' danger' : ' primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'מבצע…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
