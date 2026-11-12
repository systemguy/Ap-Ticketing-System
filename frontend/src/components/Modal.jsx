import { useEffect } from 'react';

// A centered dialog. Escape or a click outside closes it unless `busy`.
export default function Modal({ title, onClose, busy = false, children, width = 520 }) {
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose]);

  return (
    <div className="modal-overlay" onClick={() => !busy && onClose()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        style={{ maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="modal-title">{title}</h3>
        {children}
      </div>
    </div>
  );
}

// An error thrown by apiFetch. The backend sends one message, or a list of them for a
// schedule with several problems; each shows on its own line.
export function ErrorList({ error }) {
  if (!error) return null;
  const lines = error.list || [error.message || String(error)];
  if (lines.length === 1) return <p className="field-error" role="alert">{lines[0]}</p>;
  return (
    <ul className="form-errors" role="alert">
      {lines.map((l) => <li key={l}>{l}</li>)}
    </ul>
  );
}
