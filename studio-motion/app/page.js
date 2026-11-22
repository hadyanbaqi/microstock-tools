"use client";
import { useCallback, useEffect, useState } from "react";
import KeysHub from "./components/KeysHub";
import MotionStudio from "./components/MotionStudio";
import { Icon } from "./components/ui";
import { getToken } from "./components/util";

const MOTION_ICON = "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM10 9.5v5l4.5-2.5Z";
const KEY_ICON = "M2.6 18.4A2 2 0 0 0 2 19.8V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.2a2 2 0 0 0 1.4-.6l.8-.8a6.5 6.5 0 1 0-4-4ZM16.5 7.5h.01";

export default function Home() {
  // Koneksi hub: false = closed, else the open tab.
  const [hubTab, setHubTab] = useState(false);
  const setSettingsOpen = useCallback((v) => setHubTab(v ? (typeof v === "string" ? v : "apify") : false), []);
  const [hasToken, setHasToken] = useState(false);
  const closeSettings = useCallback(() => setSettingsOpen(false), [setSettingsOpen]);
  const [motionJob, setMotionJob] = useState(null);

  // One focus trap for every modal (role="dialog" aria-modal): Tab and Shift+Tab stay inside the topmost one.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Tab") return;
      const all = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      const dlg = all[all.length - 1];
      if (!dlg) return;
      const f = [...dlg.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (!dlg.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    setHasToken(!!getToken());
    // Tokens in the server's pool count too (shared by every device).
    fetch("/api/apify-tokens?summary=1").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.usable) setHasToken(true); }).catch(() => {});
    // A link from Claude (MCP buat_video) opens that video order in the editor.
    const job = new URLSearchParams(window.location.search).get("motion");
    if (job) setMotionJob(job);
  }, []);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand" aria-label="Studio Motion">
            <span className="brand-logo" aria-hidden="true"><Icon d={MOTION_ICON} /></span>
            <span className="brand-name">Studio <em>Motion</em></span>
          </span>
          <div className="topbar-right">
            <button type="button" className={`token-btn ${hasToken ? "" : "off"}`} onClick={() => setSettingsOpen("ciora")}
              title="Hubungkan data riset dan AI" aria-label="Koneksi">
              <Icon d={KEY_ICON} /><span className="lbl">Koneksi</span><span className="dot" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <main className="wrap">
        <div className="view">
          <MotionStudio active jobId={motionJob} onKeys={() => setSettingsOpen("ciora")} />
        </div>
        <KeysHub open={!!hubTab} tab={hubTab || "ringkas"} onTab={setHubTab} onClose={closeSettings} onApifyChange={(on) => setHasToken(!!on)} />
      </main>
    </div>
  );
}
