"use client";
import { useMemo, useState } from "react";
import { TIERS, TIER_LABELS, type Tier } from "@/lib/config";
import { shortDate } from "@/lib/dates";
import { CATEGORIES } from "@/lib/scoring";
import LineChart, { Marker, type Shape } from "./LineChart";

export type ProgressRow = {
  id: string;
  date: string;
  tier: Tier;
  score: number;
  letter: string;
  cats: Record<string, number>;
  marksPer100: number;
  mechanicsPer100: number;
};

// Tier is told apart by marker shape (not color), so the line stays one series.
const SHAPES: Record<Tier, Shape> = { easy: "circle", medium: "square", advanced: "diamond", extreme: "triangle" };

export default function ProgressCharts({ rows }: { rows: ProgressRow[] }) {
  const [tier, setTier] = useState<Tier | "all">("all");
  const shown = useMemo(() => (tier === "all" ? rows : rows.filter((r) => r.tier === tier)), [rows, tier]);
  const present = TIERS.filter((t) => rows.some((r) => r.tier === t));

  const scorePts = shown.map((r) => ({
    label: shortDate(r.date),
    y: r.score,
    shape: SHAPES[r.tier],
    tip: `${shortDate(r.date)}, ${TIER_LABELS[r.tier]}: ${r.letter} (${r.score})`,
  }));
  const marksPts = shown.map((r) => ({
    label: shortDate(r.date),
    y: r.marksPer100,
    shape: SHAPES[r.tier],
    tip: `${shortDate(r.date)}: ${r.marksPer100} marks per 100 words (${r.mechanicsPer100} grammar/spelling/punctuation)`,
  }));
  const marksMax = Math.max(4, Math.ceil(Math.max(...shown.map((r) => r.marksPer100), 0) + 1));

  return (
    <>
      <div className="row" role="group" aria-label="Filter by level" style={{ marginBottom: 16 }}>
        {(["all", ...present] as const).map((t) => (
          <button
            key={t}
            type="button"
            className="tier"
            style={{ padding: "6px 14px" }}
            aria-pressed={tier === t}
            onClick={() => setTier(t)}
          >
            <strong style={{ fontSize: ".95rem" }}>{t === "all" ? "All levels" : TIER_LABELS[t]}</strong>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="panel"><p>No graded responses at this level yet.</p></div>
      ) : (
        <>
          <section className="panel">
            <h2>Overall score</h2>
            <LineChart points={scorePts} min={0} max={100} ticks={[0, 25, 50, 75, 100]} color="var(--teal)" ariaLabel="Overall score by response" />
            {tier === "all" && present.length > 1 && (
              <div className="legend" aria-label="Marker shapes">
                {present.map((t) => (
                  <span key={t}>
                    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                      <Marker shape={SHAPES[t]} x={8} y={8} r={4.5} fill="var(--teal)" ring="var(--paper)" />
                    </svg>
                    {TIER_LABELS[t]}
                  </span>
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <h2>By category</h2>
            <p className="quiet small">Each out of 10. The number is your latest; the change compares your last three with your first three.</p>
            <div className="multiples">
              {CATEGORIES.map((c) => {
                const vals = shown.map((r) => r.cats[c.key] ?? 0);
                const latest = vals[vals.length - 1];
                const k = Math.min(3, Math.floor(vals.length / 2));
                const delta = k > 0 ? (vals.slice(-k).reduce((a, b) => a + b, 0) - vals.slice(0, k).reduce((a, b) => a + b, 0)) / k : null;
                return (
                  <div key={c.key}>
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                      <strong className="small">{c.label}</strong>
                      <span className="small">
                        <strong>{latest}</strong>
                        {delta != null && <span className="quiet"> {delta >= 0 ? "+" : ""}{delta.toFixed(1)}</span>}
                      </span>
                    </div>
                    <LineChart
                      compact
                      height={130}
                      points={shown.map((r) => ({ label: shortDate(r.date), y: r.cats[c.key] ?? 0, tip: `${shortDate(r.date)}: ${r.cats[c.key] ?? "?"}/10` }))}
                      min={0}
                      max={10}
                      ticks={[0, 5, 10]}
                      color="var(--orange)"
                      ariaLabel={`${c.label} score by response`}
                    />
                  </div>
                );
              })}
            </div>
          </section>

          <section className="panel">
            <h2>Red-pen marks per 100 words</h2>
            <p className="quiet small">Lower is better.</p>
            <LineChart
              points={marksPts}
              min={0}
              max={marksMax}
              ticks={[0, Math.round(marksMax / 2), marksMax]}
              color="var(--ink-2)"
              ariaLabel="Red-pen marks per 100 words by response"
            />
          </section>

          <details className="panel">
            <summary style={{ cursor: "pointer", fontWeight: 700 }}>Show as a table</summary>
            <div style={{ overflowX: "auto", marginTop: 12 }}>
              <table className="hist">
                <thead>
                  <tr>
                    <th>Date</th><th>Level</th><th className="num">Score</th>
                    {CATEGORIES.map((c) => <th key={c.key} className="num">{c.label}</th>)}
                    <th className="num">Marks /100w</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id}>
                      <td><a href={`/s/${r.id}`}>{shortDate(r.date)}</a></td>
                      <td>{TIER_LABELS[r.tier]}</td>
                      <td className="num">{r.score}</td>
                      {CATEGORIES.map((c) => <td key={c.key} className="num">{r.cats[c.key]}</td>)}
                      <td className="num">{r.marksPer100}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </>
  );
}
