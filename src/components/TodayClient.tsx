"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TIERS, TIER_BLURBS, TIER_LABELS, WRITING_MINUTES, MIN_WORDS, MAX_WORDS, type Tier } from "@/lib/config";
import type { DailySet } from "@/lib/daily";
import { prettyDate } from "@/lib/dates";

type Props = {
  today: string;
  set: DailySet | null;
  todayStatus: DailySet["status"] | "missing";
  todayError: string | null;
  sessions: { id: string; tier: string; status: string; overall_score: number | null }[];
};

function readLS<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeLS(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* private mode */
  }
}

export default function TodayClient({ today, set, todayStatus, todayError, sessions }: Props) {
  const router = useRouter();
  const [brewing, setBrewing] = useState(todayStatus !== "ready");
  const [brewError, setBrewError] = useState<string | null>(todayStatus === "failed" ? todayError : null);
  const started = useRef(false);

  // Backup for the cron job: build today's pair if it isn't there yet.
  useEffect(() => {
    if (todayStatus === "ready" || started.current) return;
    started.current = true;
    let stop = false;
    (async () => {
      const retry = todayStatus === "failed";
      for (let i = 0; i < 40 && !stop; i++) {
        const r = await fetch("/api/daily/ensure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ retry: retry && i === 0 }),
        })
          .then((r) => r.json())
          .catch(() => ({ result: "busy" }));
        if (r.result === "ready") {
          setBrewing(false);
          router.refresh();
          return;
        }
        if (r.result === "failed") {
          setBrewError("Couldn't build today's reading. Try again in a few minutes.");
          setBrewing(false);
          return;
        }
        await new Promise((res) => setTimeout(res, 8000));
      }
    })();
    return () => {
      stop = true;
    };
  }, [todayStatus, router]);

  if (!set) {
    return (
      <div className="waiting">
        <div className="big"><span className="pencil">✎</span></div>
        <h1>Finding today's science</h1>
        <p className="quiet">Picking an article and a podcast and writing the questions. This takes about a minute.</p>
        {brewError && <p className="error">{brewError}</p>}
      </div>
    );
  }

  return <Day set={set} today={today} brewing={brewing && set.date !== today} sessions={sessions} />;
}

function Day({ set, today, brewing, sessions }: { set: DailySet; today: string; brewing: boolean; sessions: Props["sessions"] }) {
  const router = useRouter();
  const key = `opened:${set.date}`;
  const [opened, setOpened] = useState<{ article: boolean; podcast: boolean }>({ article: false, podcast: false });
  const [tier, setTier] = useState<Tier>("medium");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOpened(readLS(key, { article: false, podcast: false }));
    const t = readLS<Tier>("tier", "medium");
    if (TIERS.includes(t)) setTier(t);
  }, [key]);

  function mark(which: "article" | "podcast") {
    setOpened((o) => {
      const n = { ...o, [which]: true };
      writeLS(key, n);
      return n;
    });
  }
  function pick(t: Tier) {
    setTier(t);
    writeLS("tier", t);
  }

  const existing = sessions.find((s) => s.tier === tier);
  const ready = opened.article && opened.podcast;
  const [, m, d] = set.date.split("-");
  const a = set.article!;
  const p = set.podcast!;

  async function start() {
    if (existing) return router.push(`/s/${existing.id}`);
    setBusy(true);
    setError(null);
    const r = await fetch("/api/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: set.date, tier }),
    }).then((r) => r.json());
    if (r.id) router.push(`/s/${r.id}`);
    else {
      setBusy(false);
      setError(r.error ?? "Couldn't start.");
    }
  }

  return (
    <>
      <div className="today-head">
        <div className="today-day" aria-hidden="true">{Number(m)}/{Number(d)}</div>
        <div>
          <p className="quiet">{set.date === today ? "Today" : "Most recent"}, {prettyDate(set.date)}</p>
          <h1>{set.field ?? "Science"}</h1>
        </div>
      </div>
      {brewing && <p className="quiet small">Today's reading is still being put together. This is the latest one in the meantime.</p>}

      <section className="sources" aria-label="Today's sources">
        <article className={`panel source${opened.article ? " done" : ""}`}>
          <div className="kind">Read</div>
          <h2>{a.title}</h2>
          <div className="meta">{a.source}{a.paywalled ? " (subscription; free with UNC access)" : ""}</div>
          <p>{a.summary}</p>
          <div className="open row">
            <a className="btn secondary" href={a.url} target="_blank" rel="noopener noreferrer" onClick={() => mark("article")} onAuxClick={() => mark("article")}>
              Open article
            </a>
            {opened.article && <span className="check">✓ Opened</span>}
          </div>
        </article>

        <article className={`panel source${opened.podcast ? " done" : ""}`}>
          <div className="kind">Listen</div>
          <h2>{p.title}</h2>
          <div className="meta">{p.show}{p.duration ? `, ${p.duration}` : ""}</div>
          <p>{p.summary}</p>
          {p.audio_url && (
            <audio controls preload="none" src={p.audio_url} onPlay={() => mark("podcast")}>
              Your browser can't play this here; use the episode link.
            </audio>
          )}
          <div className="open row">
            <a className="btn secondary" href={p.url} target="_blank" rel="noopener noreferrer" onClick={() => mark("podcast")} onAuxClick={() => mark("podcast")}>
              Open episode
            </a>
            {opened.podcast && <span className="check">✓ Opened</span>}
          </div>
        </article>
      </section>

      <section className="panel" style={{ marginTop: 26 }} aria-labelledby="tier-h">
        <h2 id="tier-h">Pick your level</h2>
        <div className="tiers" role="group" aria-label="Difficulty">
          {TIERS.map((t) => {
            const done = sessions.find((s) => s.tier === t);
            return (
              <button key={t} type="button" className={`tier ${t}`} aria-pressed={tier === t} onClick={() => pick(t)}>
                <strong>{TIER_LABELS[t]}</strong>
                <span>{done ? (done.status === "complete" ? `Done${done.overall_score != null ? `, ${done.overall_score}` : ""}` : "In progress") : TIER_BLURBS[t]}</span>
              </button>
            );
          })}
        </div>
        <p className="quiet small">
          The question appears when you press Write response, and the {WRITING_MINUTES}-minute clock starts then. Aim for {MIN_WORDS}–{MAX_WORDS} words. Pasting is turned off.
        </p>
        <div className="gate">
          <button className="btn big warm" disabled={(!ready && !existing) || busy} onClick={start}>
            {existing ? (existing.status === "writing" ? "Keep writing" : "Open your response") : busy ? "Starting…" : "Write response"}
          </button>
          {!ready && !existing && (
            <span className="quiet small">
              Open {!opened.article && !opened.podcast ? "the article and the podcast" : !opened.article ? "the article" : "the podcast"} first.
            </span>
          )}
          {error && <span className="error">{error}</span>}
        </div>
      </section>
    </>
  );
}
