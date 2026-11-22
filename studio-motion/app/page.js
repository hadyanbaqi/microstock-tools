import Studio from "./components/Studio";

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff9a5c" /><stop offset="1" stopColor="#ff6a2b" /></linearGradient></defs>
      <rect width="28" height="28" rx="8" fill="url(#lg)" />
      <path d="M11 8.8v10.4a.8.8 0 0 0 1.2.7l8.2-5.2a.8.8 0 0 0 0-1.4l-8.2-5.2a.8.8 0 0 0-1.2.7Z" fill="#160a04" />
    </svg>
  );
}

export default function Home() {
  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand" aria-label="Studio Motion"><Logo /><span className="brand-word">Studio<span>Motion</span></span></span>
          <span className="topbar-note mono">Render di browser · tanpa upload</span>
        </div>
      </header>
      <main className="wrap"><Studio /></main>
    </div>
  );
}
