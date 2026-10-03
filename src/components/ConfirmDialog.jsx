import { useEffect, useRef } from 'react';

/**
 * Confirmation step for decisions that are hard to undo. Uses the native
 * <dialog>, which traps focus, closes on Escape and restores focus on close.
 */
export default function ConfirmDialog({ open, title, children, confirmLabel = 'Confirm', tone = 'danger', busy, onConfirm, onCancel }) {
  const ref = useRef(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="confirm"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onCancel(); // backdrop click
      }}
      aria-labelledby="confirm-title"
    >
      <div className="confirm-body">
        <h2 id="confirm-title">{title}</h2>
        <div className="confirm-text">{children}</div>
        <div className="confirm-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Go back
          </button>
          <button type="button" className={`btn btn-${tone}`} onClick={onConfirm} disabled={busy} autoFocus>
            {busy ? <><span className="spinner" aria-hidden="true" /> Saving…</> : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
