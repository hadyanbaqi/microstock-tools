"use client";
import { useState } from "react";
import { copyText } from "./util";

export const Icon = ({ d, size }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);

// Copies text and briefly confirms it on the button itself.
export function CopyButton({ label, text, className = "" }) {
  const [done, setDone] = useState(false);
  return <button type="button" className={className} onClick={() => { copyText(typeof text === "function" ? text() : text); setDone(true); setTimeout(() => setDone(false), 1500); }}>{done ? "Tersalin ✓" : label}</button>;
}
