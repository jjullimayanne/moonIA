import { useMemo, useState } from "react";
import { Box, Map, Search, Cpu, Server, Clock } from "lucide-react";
import { useMoon } from "../store";
import { API_ENABLED, useHealth } from "../api/backend";
import { useCatalog, useNomenclature } from "../data/catalogs";
import { formatUpdate, useManifest } from "../data/manifest";
import { parseCoordinates } from "../lib/lunar";
import { InfoTip } from "./InfoTip";
import { GLOSSARY } from "../data/glossary";

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

function Status({ ok, label, detail, icon: Icon }: { ok: boolean | null; label: string; detail: string; icon: typeof Cpu }) {
  const color = ok === null ? "bg-regolith-600" : ok ? "bg-ok" : "bg-warn";
  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1 text-[11px]" title={detail}>
      <Icon size={13} className="text-regolith-400" />
      <span className="text-regolith-200">{label}</span>
      <span className={`h-1.5 w-1.5 rounded-full ${color} ${ok ? "shadow-[0_0_8px_#4ade80]" : ""}`} />
    </div>
  );
}

/** "Last update" chip: model publish time when a model exists, otherwise the catalog build time. */
function LastUpdate() {
  const manifest = useManifest();
  const head = useCatalog("head2010");
  const m = manifest.data;
  const when = m ? m.published_at : head.data?.meta.generated_at;
  const what = m ? `Model ${m.version}` : "Data";
  const detail = m
    ? `Active model ${m.version} (experiment ${m.experiment_id}), trained ${formatUpdate(m.trained_at)}, published ${formatUpdate(m.published_at)}. Models are refreshed at most once a day.`
    : "No AI model published yet. Showing when the crater catalogs were last built. Models are refreshed at most once a day.";
  return (
    <div className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px]" title={detail}>
      <Clock size={13} className="text-regolith-400" />
      <span className="text-regolith-400">{what} · updated</span>
      <span className="num text-regolith-200">{formatUpdate(when)}</span>
    </div>
  );
}

export function Header() {
  const { viewMode, set, requestFlyTo } = useMoon();
  const health = useHealth();
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

  const backendOk = health.isSuccess ? true : health.isError ? false : null;
  const model = health.data?.model.status;

  return (
    <header className="glass absolute top-3 right-3 left-3 z-20 flex h-12 items-center gap-4 rounded-xl px-4">
      <Logo />
      <div className="mx-2 h-6 w-px bg-edge" />

      <div className="flex rounded-lg border border-edge p-0.5 text-[11px]">
        {(["3d", "2d"] as const).map((m) => (
          <button
            key={m}
            onClick={() => set({ viewMode: m })}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 transition ${
              viewMode === m ? "bg-signal/15 text-signal" : "text-regolith-400 hover:text-regolith-50"
            }`}
          >
            {m === "3d" ? <Box size={13} /> : <Map size={13} />}
            {m.toUpperCase()}
          </button>
        ))}
      </div>
      <InfoTip text={GLOSSARY.mode} />

      <div className="relative max-w-md flex-1">
        <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-regolith-400" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (coords) go(coords.lon, coords.lat);
              else if (matches[0]) go(matches[0].lon, matches[0].lat, matches[0].diameter_km);
            }
          }}
          placeholder="Crater name (Copernicus) or lat, lon (9.62, -20.08)"
          className="w-full rounded-lg border border-edge bg-black/30 py-1.5 pr-3 pl-8 text-[12px] placeholder:text-regolith-600 focus:border-signal/50 focus:outline-none"
        />
        {open && (matches.length > 0 || coords) && (
          <div className="glass animate-in absolute top-full mt-1.5 w-full overflow-hidden rounded-lg py-1 text-[12px]">
            {coords && (
              <button onClick={() => go(coords.lon, coords.lat)} className="flex w-full justify-between px-3 py-1.5 hover:bg-signal/10">
                <span>Go to coordinates</span>
                <span className="num text-regolith-400">
                  {coords.lat.toFixed(3)}, {coords.lon.toFixed(3)}
                </span>
              </button>
            )}
            {matches.map((f) => (
              <button
                key={`${f.name}${f.lon}`}
                onClick={() => go(f.lon, f.lat, f.diameter_km)}
                className="flex w-full justify-between px-3 py-1.5 text-left hover:bg-signal/10"
              >
                <span>{f.name}</span>
                <span className="num text-regolith-400">{f.diameter_km.toFixed(0)} km</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1">
        <InfoTip text={GLOSSARY.search} />
        <span className="w-3" />
        <Status
          icon={Server}
          ok={backendOk}
          label={!API_ENABLED ? "Static mode" : backendOk ? "API online" : backendOk === false ? "API offline" : "API…"}
          detail={backendOk ? "FastAPI backend reachable — DEM queries enabled" : "Static mode: catalogs and imagery work; DEM queries need the backend"}
        />
        <Status
          icon={Cpu}
          ok={model === "ready" ? true : backendOk ? false : null}
          label={model === "ready" ? "Model ready" : "Model: not trained"}
          detail="U-Net crater detector is under development (Phase 4). No predictions are shown until a model is trained and evaluated."
        />
        <InfoTip text={`${GLOSSARY.api} ${GLOSSARY.model}`} />
        <div className="mx-1 h-5 w-px bg-edge" />
        <LastUpdate />
        <a
          href="https://github.com/jjullimayanne/moonIA"
          target="_blank"
          rel="noreferrer"
          className="ml-1 rounded-md p-1.5 text-regolith-400 hover:text-regolith-50"
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
