"use client";
import { useEffect, useRef, useState } from "react";

// Asks before anything that spends Apify credit. `lines` = what happens, `warn` = optional caution,
// `skipKey` = offer "jangan tanya lagi" (stored in this browser). `altLabel`/`onAlt` = a free alternative
// (e.g. reopen a saved copy), shown as its own button.
export default function ConfirmDialog({ open, title, lines = [], warn, confirmLabel = "Ya, lanjutkan", skipKey, onConfirm, onCancel, altLabel, onAlt }) {
  const okRef = useRef(null);
  const [skip, setSkip] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSkip(false);
    const prev = document.activeElement;
    okRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="modal-back" onClick={onCancel}>
      <div className="modal panel confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-title">{title}</h2>
        <ul className="confirm-lines">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
        {warn && <p className="confirm-warn">{warn}</p>}
        {skipKey && (
          <label className="check">
            <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} /> Jangan tanya lagi di browser ini
          </label>
        )}
        <div className="btns confirm-btns">
          <button type="button" onClick={onCancel}>Batal</button>
          {altLabel && <button type="button" className="alt" onClick={onAlt}>{altLabel}</button>}
          <button ref={okRef} type="button" className="primary" onClick={() => {
            if (skip && skipKey) { try { localStorage.setItem(skipKey, "1"); } catch {} }
            onConfirm();
          }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export const confirmSkipped = (key) => { try { return localStorage.getItem(key) === "1"; } catch { return false; } };
