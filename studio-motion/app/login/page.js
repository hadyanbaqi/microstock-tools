"use client";
import { useState } from "react";

// Personal lock screen (see middleware.js).
export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError("");
    const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    if (res?.ok) {
      const next = new URLSearchParams(location.search).get("next") || "/";
      location.href = next.startsWith("/") && !next.startsWith("//") ? next : "/";
      return;
    }
    setBusy(false);
    setError(data?.error || "Gagal login. Coba lagi.");
  }
  return (
    <main className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand"><span className="logo">S</span> STOCKSCOPE</div>
        <h1>MASUK</h1>
        <p>Situs ini pribadi. Masukkan password untuk melanjutkan.</p>
        <input type="password" autoFocus autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <div className="login-error">{error}</div>}
        <button type="submit" disabled={busy || !password}>{busy ? "Memeriksa…" : "Masuk"}</button>
      </form>
    </main>
  );
}
