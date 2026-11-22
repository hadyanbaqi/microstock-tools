"use client";
// The contributor watchlist lives in this browser's localStorage. Every time a watched
// item shows up in fresh data, a snapshot is added, so growth can be followed without a database.
import { useEffect, useState } from "react";
import { store } from "./util";

const CONTRIB_KEY = "stockscope:watchlist";
const MAX_SNAPSHOTS = 60;
const EVENT = "stockscope:watch";

const load = (key) => store(key) ?? [];
function save(key, list) {
  store(key, list);
  try { window.dispatchEvent(new Event(EVENT)); } catch {}
  return list;
}

// Re-renders when any watchlist changes, in this component or another.
export function useWatchlists() {
  const [state, setState] = useState({ contributors: [] });
  useEffect(() => {
    const read = () => setState({ contributors: load(CONTRIB_KEY) });
    read();
    window.addEventListener(EVENT, read);
    window.addEventListener("storage", read);
    return () => { window.removeEventListener(EVENT, read); window.removeEventListener("storage", read); };
  }, []);
  return state;
}

/* ---------- contributors ---------- */
const sig = (p) => `${p.order}|${p.asset}|${p.ai}|${p.maxItems}`;

function contributorSnapshot(list, data) {
  const id = data.creator?.id ?? data.params?.creatorId;
  const i = list.findIndex((w) => w.id === id);
  if (i < 0) return list;
  const s = data.summary;
  const snap = { at: data.fetchedAt, sig: sig(data.params), count: s.count, totalDownloads: s.totalDownloads,
    avgDownloads: s.avgDownloads, velocity: data.performance?.totalVelocity ?? 0 };
  const w = list[i];
  if (w.snapshots.some((x) => x.at === snap.at && x.sig === snap.sig)) return list;
  const next = [...list];
  next[i] = { ...w, name: data.creator?.name ?? w.name, snapshots: [...w.snapshots, snap].slice(-MAX_SNAPSHOTS) };
  return next;
}

export function recordContributor(data) {
  const list = load(CONTRIB_KEY);
  const next = contributorSnapshot(list, data);
  if (next !== list) save(CONTRIB_KEY, next);
}

export function toggleContributor(data) {
  const list = load(CONTRIB_KEY);
  const id = data.creator?.id;
  if (!id) return;
  if (list.some((w) => w.id === id)) return save(CONTRIB_KEY, list.filter((w) => w.id !== id));
  save(CONTRIB_KEY, contributorSnapshot([...list, { id, name: data.creator.name, addedAt: Date.now(), snapshots: [] }], data));
}

export const removeContributor = (id) => save(CONTRIB_KEY, load(CONTRIB_KEY).filter((w) => w.id !== id));

// Change since the previous snapshot taken with the same search settings.
export function contributorDelta(w) {
  const last = w.snapshots.at(-1);
  if (!last) return null;
  const prev = [...w.snapshots].reverse().find((x) => x !== last && x.sig === last.sig);
  if (!prev) return null;
  return { downloads: last.totalDownloads - prev.totalDownloads, days: Math.round((last.at - prev.at) / 864e5) };
}
