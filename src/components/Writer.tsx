"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_WORDS, MIN_WORDS } from "@/lib/config";
import { LARGE_INSERT_CHARS, type Telemetry } from "@/lib/integrity";
import { countWords } from "@/lib/words";
import { blockPasteHandlers } from "./noPaste";

type Props = {
  id: string;
  question: string;
  deadline: string;
  serverNow: number;
  initialDraft: string;
  article: { title: string; url: string };
  podcast: { title: string; url: string };
};

function fmt(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function Writer({ id, question, deadline, serverNow, initialDraft, article, podcast }: Props) {
  const router = useRouter();
  const lsKey = `draft:${id}`;
  const [text, setText] = useState(initialDraft);
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState("");
  const [phase, setPhase] = useState<"writing" | "submitting" | "error">("writing");
  const [error, setError] = useState<string | null>(null);

  const skew = useRef(serverNow - Date.now()); // server clock minus ours
  const startedAt = useRef(Date.now());
  const tele = useRef<Telemetry>({ pasteAttempts: 0, dropAttempts: 0, keystrokes: 0, largeInsertions: [], focusLosses: 0 });
  const lastSaved = useRef(initialDraft);
  const textRef = useRef(text);
  const submitted = useRef(false);
  textRef.current = text;

  // Restore a newer local copy (e.g. after a refresh or a dropped connection).
  useEffect(() => {
    try {
      const local = JSON.parse(localStorage.getItem(lsKey) || "null") as { text: string } | null;
      if (local?.text && local.text.length > initialDraft.length) setText(local.text);
      const t = JSON.parse(localStorage.getItem(`${lsKey}:tele`) || "null") as Telemetry | null;
      if (t) tele.current = t;
    } catch {
      /* ignore */
    }
  }, [lsKey, initialDraft]);

  const remaining = Date.parse(deadline) - (now + skew.current);
  const words = countWords(text);
  const inRange = words >= MIN_WORDS && words <= MAX_WORDS;

  const save = useCallback(async () => {
    const t = textRef.current;
    try {
      localStorage.setItem(lsKey, JSON.stringify({ text: t }));
      localStorage.setItem(`${lsKey}:tele`, JSON.stringify(tele.current));
    } catch {
      /* ignore */
    }
    if (t === lastSaved.current) return;
    const r = await fetch(`/api/session/${id}/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: t, telemetry: tele.current }),
      keepalive: true,
    }).catch(() => null);
    if (r?.ok) lastSaved.current = t;
  }, [id, lsKey]);

  const submit = useCallback(
    async (auto: boolean) => {
      if (submitted.current) return;
      submitted.current = true;
      setPhase("submitting");
      await save();
      const r = await fetch(`/api/session/${id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textRef.current, telemetry: tele.current, auto }),
      })
        .then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }))
        .catch(() => ({ ok: false, body: { error: "Network problem. Your draft is saved; try again." } }));
      if (!r.ok) {
        submitted.current = false;
        setPhase("error");
        setError(r.body.error ?? "Submit failed.");
        return;
      }
      try {
        localStorage.removeItem(lsKey);
        localStorage.removeItem(`${lsKey}:tele`);
      } catch {
        /* ignore */
      }
      router.refresh();
    },
    [id, lsKey, router, save]
  );

  // Clock tick + auto-submit at zero.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (remaining <= 0 && phase === "writing") submit(true);
  }, [remaining, phase, submit]);

  // Autosave every 10s, and when the tab is hidden.
  useEffect(() => {
    const t = setInterval(save, 10_000);
    const vis = () => {
      if (document.visibilityState === "hidden") {
        tele.current.focusLosses++;
        save();
      }
    };
    document.addEventListener("visibilitychange", vis);
    const unload = (e: BeforeUnloadEvent) => {
      if (!submitted.current) {
        save();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("beforeunload", unload);
    };
  }, [save]);

  const block = blockPasteHandlers((kind) => {
    if (kind === "paste") tele.current.pasteAttempts++;
    else tele.current.dropAttempts++;
    setNotice("Pasting is turned off. Type it in your own words.");
    setTimeout(() => setNotice(""), 3500);
  });

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    const delta = next.length - textRef.current.length;
    if (delta >= LARGE_INSERT_CHARS) {
      tele.current.largeInsertions.push({ chars: delta, at: Math.round((Date.now() - startedAt.current) / 1000) });
    }
    setText(next);
  }

  if (phase === "submitting") {
    return (
      <div className="waiting">
        <div className="big"><span className="pencil">✎</span></div>
        <h2>{remaining <= 0 ? "Time's up. Grading your response" : "Grading your response"}</h2>
        <p className="quiet">The red pen is out. This usually takes under a minute.</p>
      </div>
    );
  }

  const low = remaining < 5 * 60_000;
  return (
    <div>
      <p className="prompt">{question}</p>
      <p className="quiet small">
        Sources: <a href={article.url} target="_blank" rel="noopener noreferrer">{article.title}</a> and{" "}
        <a href={podcast.url} target="_blank" rel="noopener noreferrer">{podcast.title}</a>
      </p>

      <div className="writebar">
        <div className={`timer${low ? " low" : ""}`} role="timer" aria-label="Time left">{fmt(remaining)}</div>
        <div>
          <div className={`wordcount${inRange ? " ok" : words > MAX_WORDS ? " over" : ""}`}>
            {words} words
          </div>
          <div className={`meter${inRange ? " ok" : words > MAX_WORDS ? " over" : ""}`} aria-hidden="true">
            <i style={{ width: `${Math.min(100, (words / MAX_WORDS) * 100)}%` }} />
          </div>
        </div>
        <div className="quiet small">
          {words < MIN_WORDS ? `${MIN_WORDS - words} to go` : words > MAX_WORDS ? `${words - MAX_WORDS} over the limit` : "In range"}
        </div>
        <div className="spacer" />
        <button className="btn" disabled={!inRange} onClick={() => submit(false)}>Submit response</button>
      </div>

      <label htmlFor="essay" className="quiet small" style={{ display: "block", marginBottom: 6 }}>
        Your response. Spellcheck and autocorrect are off, so grammar is all yours. It saves as you type and submits itself when the clock hits zero.
      </label>
      <textarea
        id="essay"
        className="paper"
        value={text}
        onChange={onChange}
        onKeyDown={() => tele.current.keystrokes++}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="sentences"
        autoComplete="off"
        data-gramm="false"
        data-gramm_editor="false"
        data-enable-grammarly="false"
        {...block}
      />
      <div className="notice" role="status" aria-live="polite">{notice}</div>
      {phase === "error" && error && (
        <p className="error" role="alert">
          {error}{" "}
          <button className="btn secondary" onClick={() => { setPhase("writing"); setError(null); }}>Back to writing</button>
        </p>
      )}
    </div>
  );
}
