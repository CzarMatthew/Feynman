"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Shown while a submitted response has no grade yet (slow grading, closed tab, or an error).
export default function GradingWait({ id, submittedAt }: { id: string; submittedAt: string | null }) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const kicked = useRef(false);

  async function retry() {
    setBusy(true);
    setFailed(false);
    const r = await fetch(`/api/session/${id}/grade`, { method: "POST" }).catch(() => null);
    setBusy(false);
    if (r?.ok) router.refresh();
    else setFailed(true);
  }

  useEffect(() => {
    // If the grade hasn't landed within ~90s of submitting, grading probably
    // failed or the tab closed mid-request: run it again.
    const age = submittedAt ? Date.now() - Date.parse(submittedAt) : Infinity;
    if (age > 90_000 && !kicked.current) {
      kicked.current = true;
      retry();
      return;
    }
    const t = setInterval(() => router.refresh(), 6000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submittedAt]);

  return (
    <div className="waiting">
      <div className="big"><span className="pencil">✎</span></div>
      <h2>Grading your response</h2>
      <p className="quiet">This usually takes under a minute.</p>
      {failed && <p className="error">Grading didn't finish.</p>}
      <button className="btn secondary" onClick={retry} disabled={busy}>{busy ? "Grading…" : "Grade it again"}</button>
    </div>
  );
}
