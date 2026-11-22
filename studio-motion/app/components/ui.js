"use client";
import { useEffect, useRef, useState } from "react";
import { copyText } from "./util";
// Small presentational pieces shared by the reports.

export const Icon = ({ d, size }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);

export const Stat = ({ label, value, note, color, big }) => (
  <div className={`stat ${big ? "score" : ""}`}>
    <small>{label}</small>
    <b style={color ? { color } : undefined}>{value}</b>
    {note != null && <small>{note}</small>}
  </div>
);

export function Meter({ label, count, value, pct, onClick, active, title }) {
  return (
    <div className={`meter ${onClick ? "clickable" : ""} ${active ? "on" : ""}`} onClick={onClick} title={title}>
      <div className="meter-label">
        <span>{label}{count != null && <small className="muted"> ({count})</small>}</span>
        <span className="mono">{value}</span>
      </div>
      <div className="track"><div className="bar" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>
    </div>
  );
}

// Monthly bar chart for the 12-month activity series from analyze().
export function Spark({ data }) {
  const max = Math.max(1, ...(data ?? []).map((u) => u.count));
  return (
    <>
      <div className="spark">
        {data?.map((u) => <div key={u.month} title={`${u.month}: ${u.count} aset`} style={{ height: `${(u.count / max) * 100}%` }} />)}
      </div>
      <div className="meter-label muted" style={{ fontSize: 11 }}><span>{data?.[0]?.month}</span><span>{data?.at(-1)?.month}</span></div>
    </>
  );
}

// Pill sub-navigation inside a report.
export function SubTabs({ tabs, value, onChange }) {
  return (
    <div className="subtabs" role="tablist">
      {tabs.map(([k, label, badge]) => (
        <button key={k} type="button" role="tab" aria-selected={value === k} className={value === k ? "on" : ""} onClick={() => onChange(k)}>
          {label}{badge != null && <span className="badge">{badge}</span>}
        </button>
      ))}
    </div>
  );
}

export const scoreColor = (v) => (v >= 60 ? "var(--good)" : v >= 35 ? "var(--mid)" : "var(--low)");

// Copies text and briefly confirms it on the button itself.
export function CopyButton({ label, text }) {
  const [done, setDone] = useState(false);
  return <button type="button" onClick={() => { copyText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}>{done ? "Tersalin ✓" : label}</button>;
}

// Sequential ramp on the dark surface: near-surface graphite → brand lime; faster selling = brighter.
const RAMP = [[34, 36, 30], [200, 240, 49]];
export const heatColor = (t) => `rgb(${RAMP[0].map((c, i) => Math.round(c + (RAMP[1][i] - c) * t)).join(",")})`;

// Grid of rounded cells tinted by value; text flips to white on dark cells.
export function Heatmap({ cols, rows, max, format = (v) => v, onRow, rowExtra, legend = ["lebih lambat", "lebih cepat"] }) {
  return (
    <>
      <div className="scroll">
        <table className="heatmap">
          <thead><tr><th></th>{cols.map((c) => <th key={c} className="num">{c}</th>)}{rowExtra && <th></th>}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={onRow ? "clickable" : ""} onClick={onRow ? () => onRow(r) : undefined}>
                <td className="heat-label">{r.label}</td>
                {r.values.map((v, i) => {
                  // Log scale so one outlier doesn't wash out every other cell.
                  const t = v == null ? 0 : Math.max(0.04, Math.min(1, Math.log1p(v) / Math.log1p(max || 1)));
                  return (
                    <td key={i} className={`heat-cell ${v == null ? "empty" : ""}`} title={r.titles?.[i]}
                      style={v == null ? undefined : { background: heatColor(t), color: t > 0.5 ? "var(--on-ink)" : "var(--ink)" }}>
                      {v == null ? "–" : format(v)}
                    </td>
                  );
                })}
                {rowExtra && <td className="num">{rowExtra(r)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="heat-legend" aria-hidden="true">
        <span>{legend[0]}</span>
        {[0.04, 0.25, 0.5, 0.75, 1].map((t) => <i key={t} style={{ background: heatColor(t) }} />)}
        <span>{legend[1]}</span>
      </div>
    </>
  );
}

// Squarified treemap layout (Bruls et al.): items sorted by value desc → rectangles in a w×h box.
function squarify(items, w, h) {
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  const list = items.map((it) => ({ ...it, area: (it.value / total) * w * h }));
  const out = [];
  let rect = { x: 0, y: 0, w, h }, row = [];
  const worst = (r, side) => {
    const s = r.reduce((a, b) => a + b.area, 0);
    const mx = Math.max(...r.map((x) => x.area)), mn = Math.min(...r.map((x) => x.area));
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
  };
  const place = (r) => {
    const s = r.reduce((a, b) => a + b.area, 0);
    if (rect.w >= rect.h) {
      const cw = s / rect.h; let y = rect.y;
      for (const it of r) { const ch = it.area / cw; out.push({ ...it, x: rect.x, y, w: cw, h: ch }); y += ch; }
      rect = { x: rect.x + cw, y: rect.y, w: rect.w - cw, h: rect.h };
    } else {
      const ch = s / rect.w; let x = rect.x;
      for (const it of r) { const cw = it.area / ch; out.push({ ...it, x, y: rect.y, w: cw, h: ch }); x += cw; }
      rect = { x: rect.x, y: rect.y + ch, w: rect.w, h: rect.h - ch };
    }
  };
  for (const it of list) {
    const side = Math.min(rect.w, rect.h);
    if (!row.length || worst([...row, it], side) <= worst(row, side)) row.push(it);
    else { place(row); row = [it]; }
  }
  if (row.length) place(row);
  return out;
}

// Treemap of tiles { key, label, value, tone, sub, title }: size = value, colour = tone class.
export function Treemap({ tiles, onPick }) {
  // Lay out for the box we actually get: wide on desktop, taller on phones (keeps tiles readable).
  const ref = useRef(null);
  const [[W, H], setRatio] = useState([24, 10]);
  const [px, setPx] = useState(900);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      const w = e.contentRect.width;
      setPx(w);
      setRatio(w < 560 ? [10, 12] : [24, 10]);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const boxes = squarify([...tiles].sort((a, b) => b.value - a.value), W, H);
  return (
    <div ref={ref} className="treemap" style={{ aspectRatio: `${W} / ${H}` }}>
      {boxes.map((b) => {
        // Pixel size decides what fits: name + numbers, name only, or nothing (tooltip/aria-label still tell).
        const wPx = (b.w / W) * px, hPx = (b.h / W) * px;
        const small = wPx < 110 || hPx < 64, tiny = wPx < 56 || hPx < 34;
        const style = { left: `${(b.x / W) * 100}%`, top: `${(b.y / H) * 100}%`, width: `${(b.w / W) * 100}%`, height: `${(b.h / H) * 100}%` };
        const body = tiny ? null : <><b className="clamp1">{b.label}</b>{!small && <span>{b.sub}</span>}</>;
        return onPick && b.pickable !== false
          ? <button key={b.key} type="button" className={`tile ${b.tone} ${small ? "small" : ""}`} style={style} title={b.title} aria-label={b.title} onClick={() => onPick(b.key)}>{body}</button>
          : <div key={b.key} className={`tile ${b.tone} ${small ? "small" : ""}`} style={style} title={b.title}>{body}</div>;
      })}
    </div>
  );
}


// Shown while fetching from Apify (20–90 s): bouncing bars, the stage we are probably in, elapsed seconds.
// `steps` = [[fromSecond, text], ...]; stages are estimates by time, the request itself has no progress.
export function Loader({ title, steps = [], note, children }) {
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(start);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const sec = Math.floor((now - start) / 1000);
  const step = steps.filter(([s]) => sec >= s).at(-1)?.[1];
  return (
    <div className="loader panel" role="status" aria-live="polite">
      <div className="loader-art" aria-hidden="true"><i /><i /><i /><i /><i /></div>
      <div className="loader-text">
        <b>{title}</b>
        <span className="hint" style={{ margin: 0 }}>{step}{step ? " · " : ""}{sec} detik</span>
        {note && <span className="hint" style={{ margin: 0 }}>{note}</span>}
        {children}
      </div>
    </div>
  );
}

// Grey placeholder cards in the shape of the asset gallery.
export function SkeletonCards({ n = 8 }) {
  return (
    <div className="skeleton-grid" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="skeleton-card"><div className="sk sk-img" /><div className="sk sk-line" /><div className="sk sk-line short" /></div>
      ))}
    </div>
  );
}

export const SEARCH_STEPS = [
  [0, "Menghubungi Apify"],
  [4, "Mengambil aset dari Adobe Stock"],
  [30, "Masih mengambil; jumlah aset besar butuh lebih lama"],
  [75, "Hampir selesai, biasanya di bawah 2 menit"],
];

// Compact filter control: a pill with a small label and the current value (native select underneath, so it
// stays keyboard and screen-reader friendly). `def` = the default value; a changed pill is highlighted.
export function FilterPill({ label, value, onChange, options, def, title }) {
  const changed = def !== undefined && String(value) !== String(def);
  return (
    <label className={`fpill ${changed ? "set" : ""}`} title={title}>
      <span className="fpill-label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={String(v)} value={v}>{l}</option>)}
      </select>
      <svg className="fpill-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </label>
  );
}
