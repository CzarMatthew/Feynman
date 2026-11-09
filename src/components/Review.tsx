"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { placeAnnotations, segments } from "@/lib/annotate";
import type { Grade } from "@/lib/coach";
import { MAX_WORDS, MIN_WORDS } from "@/lib/config";
import type { Integrity } from "@/lib/integrity";

type Props = {
  id: string;
  response: string;
  grade: Grade;
  wordCount: number;
  autoSubmitted: boolean;
  integrity: Integrity | null;
  locked: boolean; // discussion already open: everything counts as reviewed
};

const LABELS: Record<string, string> = { word_choice: "word choice" };

export default function Review({ id, response, grade, wordCount, autoSubmitted, integrity, locked }: Props) {
  const router = useRouter();
  const { placed, unplaced } = useMemo(() => placeAnnotations(response, grade.annotations), [response, grade.annotations]);
  const order = useMemo(() => [...placed.map((p) => p.index), ...unplaced.map((u) => u.index)], [placed, unplaced]);
  const segs = useMemo(() => segments(response, placed), [response, placed]);

  const lsKey = `acked:${id}`;
  const [acked, setAcked] = useState<Set<number>>(() => new Set(locked ? order : []));
  const [current, setCurrent] = useState<number | null>(order[0] ?? null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (locked) return;
    try {
      const saved = JSON.parse(localStorage.getItem(lsKey) || "[]") as number[];
      if (saved.length) {
        const s = new Set(saved);
        setAcked(s);
        setCurrent(order.find((i) => !s.has(i)) ?? null);
      }
    } catch {
      /* ignore */
    }
  }, [lsKey, locked, order]);

  function ack(i: number) {
    const s = new Set(acked);
    s.add(i);
    setAcked(s);
    try {
      localStorage.setItem(lsKey, JSON.stringify([...s]));
    } catch {
      /* ignore */
    }
    const pos = order.indexOf(i);
    const next = [...order.slice(pos + 1), ...order.slice(0, pos)].find((j) => !s.has(j));
    setCurrent(next ?? null);
    if (next != null) document.getElementById(`mark-${next}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  async function openDiscussion() {
    setBusy(true);
    await fetch(`/api/session/${id}/ack`, { method: "POST" });
    router.refresh();
  }

  const allDone = order.every((i) => acked.has(i));
  const cur = current != null ? grade.annotations[current] : null;
  const curIsUnplaced = current != null && unplaced.some((u) => u.index === current);

  return (
    <>
      <section className="panel" aria-labelledby="grade-h">
        <div className="gradehead">
          <div className="letter" aria-label={`Grade ${grade.letter}`}>{grade.letter}</div>
          <div>
            <h2 id="grade-h" style={{ marginBottom: 4 }}>
              <span className="score">{grade.overall} / 100</span>
            </h2>
            <p style={{ marginBottom: 6 }}>{grade.summary}</p>
            <p className="quiet small" style={{ margin: 0 }}>
              {wordCount} words
              {grade.length_penalty > 0 && `, outside ${MIN_WORDS}–${MAX_WORDS} (−${grade.length_penalty})`}
              {autoSubmitted && ", submitted automatically when time ran out"}
            </p>
            {integrity?.flagged && (
              <p className="small" style={{ margin: "6px 0 0", color: "var(--orange-deep)" }}>
                Typing check: {integrity.reasons.filter((r) => !r.includes("paste")).join(" ")}
              </p>
            )}
          </div>
        </div>
        <div className="cats">
          {grade.categories.map((c) => (
            <div className="cat" key={c.key}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>{c.label}</strong>
                <span>{c.score}/10</span>
              </div>
              <div className={`bar${c.score < 5 ? " low" : c.score < 7 ? " mid" : ""}`} aria-hidden="true">
                <i style={{ width: `${c.score * 10}%` }} />
              </div>
              <p>{c.comment}</p>
            </div>
          ))}
        </div>
        <div className="lists">
          <div>
            <h3>What worked</h3>
            <ul>{grade.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
          <div>
            <h3>Work on next time</h3>
            <ul>{grade.priorities.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
        </div>
      </section>

      <section className="redpen" aria-label="Marked-up response">
        <div className="panel">
          <h2>Your response, marked up</h2>
          <div className="essay">
            {segs.map((sg, i) =>
              sg.ann ? (
                <button
                  key={i}
                  id={`mark-${sg.ann.index}`}
                  type="button"
                  className={`mark${sg.ann.severity === "major" ? " major" : ""}${acked.has(sg.ann.index) ? " acked" : ""}`}
                  aria-current={current === sg.ann.index}
                  aria-label={`${sg.text}: ${sg.ann.category} note`}
                  onClick={() => setCurrent(sg.ann!.index)}
                >
                  {sg.text}
                </button>
              ) : (
                <Fragment key={i}>{sg.text}</Fragment>
              )
            )}
          </div>
        </div>

        <aside className="panel markpanel" aria-live="polite">
          {order.length === 0 ? (
            <p>No marks on this one. Clean copy.</p>
          ) : (
            <>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>Red pen</strong>
                <span className="quiet small">{acked.size} of {order.length} reviewed</span>
              </div>
              <div className="progressdots" aria-hidden="true">
                {order.map((i) => <i key={i} className={acked.has(i) ? "on" : ""} />)}
              </div>
              {cur ? (
                <div>
                  <div className="cat-name">
                    {LABELS[cur.category] ?? cur.category}{cur.severity === "major" ? ", major" : ""}
                    {curIsUnplaced && <span className="quiet small"> (general note)</span>}
                  </div>
                  <blockquote>{cur.quote}</blockquote>
                  <p>{cur.comment}</p>
                  {cur.suggestion && <div className="fix"><strong>Try:</strong> {cur.suggestion}</div>}
                  {!acked.has(current!) ? (
                    <button className="btn" onClick={() => ack(current!)}>Got it</button>
                  ) : (
                    <span className="check">✓ Reviewed</span>
                  )}
                </div>
              ) : (
                <p className="quiet">Every mark reviewed.</p>
              )}
            </>
          )}
          {!locked && (
            <div style={{ marginTop: 20, borderTop: "2px solid var(--paper-3)", paddingTop: 16 }}>
              <button className="btn warm" disabled={!allDone || busy} onClick={openDiscussion}>
                {busy ? "Opening…" : "Start the discussion"}
              </button>
              {!allDone && <p className="quiet small" style={{ marginTop: 8 }}>Review each mark to open the discussion.</p>}
            </div>
          )}
        </aside>
      </section>
    </>
  );
}
