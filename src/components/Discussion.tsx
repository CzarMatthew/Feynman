"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ChatMsg, WrapUp } from "@/lib/coach";
import { DISCUSSION_MAX_QUESTIONS } from "@/lib/config";
import { blockPasteHandlers } from "./noPaste";

type Props = {
  id: string;
  initial: ChatMsg[];
  initialWrap: WrapUp | null;
  initialStatus: string;
  connection: string | null;
};

export default function Discussion({ id, initial, initialWrap, initialStatus, connection }: Props) {
  const router = useRouter();
  const [msgs, setMsgs] = useState<ChatMsg[]>(initial);
  const [wrap, setWrap] = useState<WrapUp | null>(initialWrap);
  const [status, setStatus] = useState(initialStatus);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const opened = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

  async function send(message?: string) {
    setBusy(true);
    setError(null);
    if (message) setMsgs((m) => [...m, { role: "writer", content: message, at: new Date().toISOString() }]);
    const r = await fetch(`/api/session/${id}/discuss`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message ? { message } : {}),
    })
      .then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }))
      .catch(() => ({ ok: false, body: { error: "Network problem. Try again." } }));
    setBusy(false);
    if (!r.ok) {
      setError(r.body.error ?? "Something went wrong.");
      if (message) {
        setMsgs((m) => m.slice(0, -1));
        setDraft(message);
      }
      return;
    }
    setMsgs(r.body.discussion);
    setStatus(r.body.status);
    if (r.body.wrap_up) {
      setWrap(r.body.wrap_up);
      router.refresh(); // shows the connection note
    }
    if (message) setDraft("");
  }

  useEffect(() => {
    if (status === "discussing" && msgs.length === 0 && !opened.current) {
      opened.current = true;
      send();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [msgs.length, wrap]);

  const asked = msgs.filter((m) => m.role === "coach").length;
  const waitingOnWriter = status === "discussing" && msgs[msgs.length - 1]?.role === "coach";
  const block = blockPasteHandlers(() => {
    setNotice("Pasting is turned off here too.");
    setTimeout(() => setNotice(""), 3000);
  });

  return (
    <section className="panel narrow" style={{ margin: "28px auto 0" }} aria-labelledby="disc-h">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 id="disc-h" style={{ margin: 0 }}>Discussion</h2>
        <span className="quiet small">Question {Math.max(1, asked)} of up to {DISCUSSION_MAX_QUESTIONS}</span>
      </div>
      <p className="quiet small" style={{ marginTop: 6 }}>Defend your choices, take on the counterpoints, change your mind if the evidence says so.</p>

      <div className="chat">
        {msgs.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            <span className="who">{m.role === "coach" ? "Coach" : "You"}</span>
            {m.content}
          </div>
        ))}
        {busy && <div className="bubble coach"><span className="who">Coach</span><span className="pencil">✎</span> thinking…</div>}
      </div>

      {waitingOnWriter && !busy && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) send(draft.trim());
          }}
          className="stack"
        >
          <label htmlFor="reply" className="quiet small">Your answer</label>
          <textarea
            id="reply"
            className="reply"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            autoCorrect="off"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && draft.trim()) send(draft.trim());
            }}
            {...block}
          />
          <div className="row">
            <button className="btn" disabled={!draft.trim()}>Send answer</button>
            <span className="quiet small">Ctrl/⌘ + Enter also sends.</span>
            <span className="notice" role="status">{notice}</span>
          </div>
        </form>
      )}
      {error && (
        <p className="error" role="alert">
          {error}{" "}
          {!waitingOnWriter && <button className="btn secondary" onClick={() => send()}>Try again</button>}
        </p>
      )}

      {wrap && (
        <div className="panel wrap" style={{ marginTop: 20 }}>
          <h3>Where you ended up</h3>
          <p>{wrap.summary}</p>
          <p><strong>Best moment:</strong> {wrap.growth}</p>
          <p><strong>Try tomorrow:</strong> {wrap.try_next}</p>
          {connection && <p className="quiet small"><strong>Why these two sources:</strong> {connection}</p>}
          <div className="row">
            <a className="btn" href="/progress">See your progress</a>
            <a className="btn secondary" href="/history">History</a>
          </div>
        </div>
      )}
      <div ref={endRef} />
    </section>
  );
}
