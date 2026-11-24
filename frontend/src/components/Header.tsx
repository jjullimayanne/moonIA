import { useMemo, useState } from "react";
import { Box, Map, Search } from "lucide-react";
import { useMoon, PAGES, type Page } from "../store";
import { API_ENABLED, useHealth } from "../api/backend";
import { useCatalog, useNomenclature } from "../data/catalogs";
import { formatUpdate, useManifest } from "../data/manifest";
import { parseCoordinates } from "../lib/lunar";

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <defs>
          <radialGradient id="mg" cx="35%" cy="35%">
            <stop offset="0" stopColor="#f1f5f9" />
            <stop offset="1" stopColor="#64748b" />
          </radialGradient>
        </defs>
        <circle cx="16" cy="16" r="12" fill="url(#mg)" />
        <circle cx="12" cy="12" r="2.6" fill="#94a3b8" opacity=".8" />
        <circle cx="20" cy="19" r="3.4" fill="#94a3b8" opacity=".7" />
        <circle cx="16" cy="16" r="15" fill="none" stroke="#38e1ff" strokeOpacity=".55" strokeDasharray="2 3" />
      </svg>
      <div className="leading-none">
        <div className="text-[15px] font-semibold tracking-tight">
          Moon<span className="text-signal">AI</span>
        </div>
        <div className="mt-0.5 text-[9px] tracking-[0.2em] text-regolith-400 uppercase">Lunar Intelligence</div>
      </div>
    </div>
  );
}

/** One compact status pill: API reachability, model state and last update (details on hover). */
function StatusPill() {
  const health = useHealth();
  const manifest = useManifest();
  const head = useCatalog("head2010");
  const m = manifest.data;
  const apiOk = API_ENABLED && health.isSuccess;
  const when = m ? m.published_at : head.data?.meta.generated_at;
  const detail = [
    API_ENABLED ? (apiOk ? "API online — terrain queries enabled." : "API offline — map and catalogs still work.") : "Static mode — no API.",
    m ? `Active model ${m.version}, trained ${formatUpdate(m.trained_at)}.` : "No AI model published yet.",
    `Last update ${formatUpdate(when)}${m ? " (model)" : " (catalog data)"}. Models refresh at most once a day.`,
  ].join(" ");
  return (
    <div className="flex items-center gap-2 rounded-full border border-edge px-3 py-1 text-[11px]" title={detail}>
      <span className={`h-1.5 w-1.5 rounded-full ${apiOk ? "bg-ok shadow-[0_0_8px_#4ade80]" : "bg-regolith-600"}`} />
      <span className="text-regolith-400">{m ? `Model ${m.version}` : "Updated"}</span>
      <span className="num text-regolith-200">{formatUpdate(when)}</span>
    </div>
  );
}

function Nav() {
  const { page, setPage } = useMoon();
  return (
    <nav className="flex items-center gap-0.5">
      {PAGES.map((p) => (
        <button
          key={p.id}
          onClick={() => setPage(p.id as Page)}
          className={`rounded-md px-2.5 py-1 text-[12px] transition ${
            page === p.id ? "bg-white/8 text-regolith-50" : "text-regolith-400 hover:text-regolith-50"
          }`}
        >
          {p.label}
        </button>
      ))}
    </nav>
  );
}

function SearchBox() {
  const { set, requestFlyTo } = useMoon();
  const names = useNomenclature();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const coords = parseCoordinates(q);
  const matches = useMemo(() => {
    if (!names.data || q.trim().length < 2 || coords) return [];
    const s = q.trim().toLowerCase();
    return names.data.features
      .filter((f) => f.name.toLowerCase().includes(s))
      .sort((a, b) => Number(!a.name.toLowerCase().startsWith(s)) - Number(!b.name.toLowerCase().startsWith(s)) || b.diameter_km - a.diameter_km)
      .slice(0, 8);
  }, [names.data, q, coords]);

  const go = (lon: number, lat: number, d?: number) => {
    requestFlyTo(lon, lat, d ? Math.max(40, d * 4) : 400);
    set({ selectedPoint: { lon, lat } });
    setOpen(false);
  };

  return (
    <div className="relative w-full max-w-sm">
      <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-regolith-400" />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (coords) go(coords.lon, coords.lat);
            else if (matches[0]) go(matches[0].lon, matches[0].lat, matches[0].diameter_km);
          }
        }}
        placeholder="Search a crater or lat, lon"
        title="Feature name (Copernicus, Tycho, Mare Imbrium) or coordinates such as 9.62, -20.08 or 9.62N 20.08W"
        className="w-full rounded-lg border border-edge bg-black/30 py-1.5 pr-3 pl-8 text-[12px] placeholder:text-regolith-600 focus:border-signal/50 focus:outline-none"
      />
      {open && (matches.length > 0 || coords) && (
        <div className="glass animate-in absolute top-full mt-1.5 w-full overflow-hidden rounded-lg py-1 text-[12px]">
          {coords && (
            <button onMouseDown={() => go(coords.lon, coords.lat)} className="flex w-full justify-between px-3 py-1.5 hover:bg-signal/10">
              <span>Go to coordinates</span>
              <span className="num text-regolith-400">{coords.lat.toFixed(3)}, {coords.lon.toFixed(3)}</span>
            </button>
          )}
          {matches.map((f) => (
            <button
              key={`${f.name}${f.lon}`}
              onMouseDown={() => go(f.lon, f.lat, f.diameter_km)}
              className="flex w-full justify-between px-3 py-1.5 text-left hover:bg-signal/10"
            >
              <span>{f.name}</span>
              <span className="num text-regolith-400">{f.diameter_km.toFixed(0)} km</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Header() {
  const { viewMode, set, page } = useMoon();
  return (
    <header className="glass absolute top-3 right-3 left-3 z-20 flex h-12 items-center gap-4 rounded-xl px-4">
      <Logo />
      <div className="h-6 w-px bg-edge" />
      <Nav />
      {page === "explorer" && (
        <>
          <div className="ml-2 flex rounded-lg border border-edge p-0.5 text-[11px]">
            {(["3d", "2d"] as const).map((m) => (
              <button
                key={m}
                onClick={() => set({ viewMode: m })}
                className={`flex items-center gap-1.5 rounded-md px-2 py-1 transition ${
                  viewMode === m ? "bg-signal/15 text-signal" : "text-regolith-400 hover:text-regolith-50"
                }`}
              >
                {m === "3d" ? <Box size={12} /> : <Map size={12} />}
                {m.toUpperCase()}
              </button>
            ))}
          </div>
          <SearchBox />
        </>
      )}
      <div className="ml-auto flex items-center gap-2">
        <StatusPill />
        <a
          href="https://github.com/jjullimayanne/moonIA"
          target="_blank"
          rel="noreferrer"
          className="rounded-md p-1.5 text-regolith-400 hover:text-regolith-50"
          aria-label="GitHub repository"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8" />
          </svg>
        </a>
      </div>
    </header>
  );
}
