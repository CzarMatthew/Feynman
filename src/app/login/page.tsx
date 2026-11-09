"use client";
import { useState } from "react";
import { sendCode, verifyCode } from "./actions";

export default function Login() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await sendCode(email);
    setBusy(false);
    if (r.ok) setSent(true);
    else setError(r.error ?? "Couldn't send the email.");
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await verifyCode(email, code);
    setBusy(false);
    if (r.ok) window.location.href = "/";
    else setError(r.error ?? "Sign-in failed.");
  }

  return (
    <div className="login panel">
      <h1>Sign in</h1>
      {!sent ? (
        <form onSubmit={onSend} className="stack">
          <p className="quiet">We'll email you a sign-in link and a 6-digit code. Use whichever is easier on this device.</p>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button className="btn" disabled={busy}>{busy ? "Sending…" : "Email me a code"}</button>
        </form>
      ) : (
        <form onSubmit={onVerify} className="stack">
          <p className="quiet">Check {email}. Click the link, or type the code here.</p>
          <div className="field">
            <label htmlFor="code">6-digit code</label>
            <input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={10} required value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <div className="row">
            <button className="btn" disabled={busy}>{busy ? "Checking…" : "Sign in"}</button>
            <button type="button" className="btn secondary" onClick={() => { setSent(false); setCode(""); }}>Use a different email</button>
          </div>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
