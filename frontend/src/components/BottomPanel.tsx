import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronDown, ChevronUp, BarChart3, Table2 } from "lucide-react";
import { useMoon } from "../store";
import { useScopeCraters } from "../data/scope";
import { CATALOG_STYLE, type CatalogId } from "../data/catalogs";
import { cumulativeSfd, histogram, median } from "../lib/stats";
import { Badge } from "./Panel";
import { InfoTip } from "./InfoTip";
import { GLOSSARY } from "../data/glossary";

const IDS: CatalogId[] = ["head2010", "povilaitis2018"];
const AXIS = { stroke: "#4b5562", tick: { fill: "#8b96a3", fontSize: 10, fontFamily: "JetBrains Mono" } };

function Stat({ label, value, sub, info }: { label: string; value: string; sub?: string; info: string }) {
  return (
    <div className="min-w-0">
      <div className="label flex items-center gap-1.5">{label}<InfoTip text={info} size={11} /></div>
      <div className="num mt-0.5 text-[19px] leading-none font-medium text-regolith-50">{value}</div>
      {sub && <div className="mt-0.5 truncate text-[10px] text-regolith-600">{sub}</div>}
    </div>
  );
}

function ChartTooltip({ active, payload, label, unit }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string; unit: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-md px-2.5 py-1.5 text-[11px]">
      <div className="num mb-1 text-regolith-400">{label} {unit}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
          <span className="text-regolith-200">{CATALOG_STYLE[p.name as CatalogId]?.short ?? p.name}</span>
          <span className="num ml-auto pl-3 text-regolith-50">{typeof p.value === "number" && p.value < 0.01 ? p.value.toExponential(2) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

function Legend({ ids }: { ids: CatalogId[] }) {
  return (
    <div className="flex gap-3">
      {ids.map((id) => (
        <span key={id} className="flex items-center gap-1.5 text-[10px] text-regolith-200">
          <span className="h-2 w-2 rounded-sm" style={{ background: CATALOG_STYLE[id].color }} />
          {CATALOG_STYLE[id].short}
        </span>
      ))}
    </div>
  );
}

export function BottomPanel() {
  const { panels, togglePanel, catalogs } = useMoon();
  const scope = useScopeCraters();
  const [table, setTable] = useState(false);
  const active = IDS.filter((id) => catalogs[id]);

  const hist = useMemo(
    () => histogram(Object.fromEntries(active.map((id) => [id, scope.byCatalog[id].map((c) => c.diameter_km)])), 4, 1500),
    [scope, active.join()],
  );
  const sfd = useMemo(() => {
    const at = [5, 7, 10, 14, 20, 28, 40, 57, 80, 113, 160, 226, 320];
    const per = active.map((id) => cumulativeSfd(scope.byCatalog[id].map((c) => c.diameter_km), scope.areaKm2, at));
    // Only plot each catalog inside the diameter range it was compiled for — outside it
    // the curve reflects catalog design, not the lunar crater population.
    return at.map((d, i) => ({
      d,
      ...Object.fromEntries(
        active.map((id, k) => {
          const [lo, hi] = CATALOG_STYLE[id].completeKm;
          return [id, d >= lo && d <= hi && per[k][i].n > 0 ? per[k][i].n : null];
        }),
      ),
    }));
  }, [scope, active.join()]);

  const diams = scope.all.map((c) => c.diameter_km);
  const trimmed = hist.filter((b) => active.some((id) => (b[id] as number) > 0));

  return (
    <>
      <section
        className={`glass absolute right-3 bottom-3 left-3 z-10 h-[212px] rounded-xl transition-all duration-300 ${
          panels.bottom ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-[120%] opacity-0"
        }`}
      >
        <div className="grid h-full grid-cols-[200px_1fr_1fr_220px] gap-5 px-5 py-4">
          <div className="flex flex-col justify-between">
            <Stat label={scope.scope === "roi" ? "Craters in region" : "Craters (filtered)"} value={scope.all.length.toLocaleString()} info={GLOSSARY.count} sub={active.map((id) => `${CATALOG_STYLE[id].short}: ${scope.byCatalog[id].length.toLocaleString()}`).join(" · ") || "no catalog enabled"} />
            <Stat label="Median diameter" info={GLOSSARY.median} value={diams.length ? `${median(diams).toFixed(1)} km` : "—"} />
            <Stat label="Density" info={GLOSSARY.density} value={`${((scope.all.length / scope.areaKm2) * 1e6).toFixed(1)}`} sub="craters per 10⁶ km²" />
          </div>

          <div className="flex min-w-0 flex-col">
            <div className="mb-1 flex items-center gap-3">
              <h3 className="label">Diameter distribution · √2 bins (km)</h3>
              <InfoTip text={GLOSSARY.histogram} size={11} />
              <span className="flex-1" />
              {active.length > 1 && <Legend ids={active} />}
              <button onClick={() => setTable(!table)} className="text-regolith-400 hover:text-signal" title="Toggle table view" aria-label="Toggle table view">
                {table ? <BarChart3 size={13} /> : <Table2 size={13} />}
              </button>
            </div>
            {table ? (
              <div className="scroll-thin num flex-1 overflow-y-auto text-[10.5px]">
                <table className="w-full">
                  <thead className="text-regolith-400">
                    <tr><th className="text-left font-normal">bin (km)</th>{active.map((id) => <th key={id} className="text-right font-normal">{CATALOG_STYLE[id].short}</th>)}</tr>
                  </thead>
                  <tbody>
                    {trimmed.map((b) => (
                      <tr key={b.label} className="border-t border-edge"><td>{b.lo.toFixed(1)}–{b.hi.toFixed(1)}</td>{active.map((id) => <td key={id} className="text-right">{b[id]}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trimmed} barCategoryGap={2} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
                  <CartesianGrid vertical={false} stroke="#ffffff" strokeOpacity={0.05} />
                  <XAxis dataKey="label" {...AXIS} tickLine={false} />
                  <YAxis {...AXIS} tickLine={false} axisLine={false} width={44} />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<ChartTooltip unit="km" />} />
                  {active.map((id) => (
                    <Bar key={id} dataKey={id} stackId="d" fill={CATALOG_STYLE[id].color} stroke="#0c0e12" strokeWidth={1} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="flex min-w-0 flex-col">
            <div className="mb-1 flex items-center gap-3">
              <h3 className="label">Cumulative SFD · N(≥D) per km²</h3>
              <InfoTip text={GLOSSARY.sfd} size={11} />
              <span className="flex-1" />
              {active.length > 1 && <Legend ids={active} />}
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sfd} margin={{ top: 4, right: 8, bottom: 0, left: -6 }}>
                <CartesianGrid stroke="#ffffff" strokeOpacity={0.05} />
                <XAxis dataKey="d" scale="log" type="number" domain={[5, 320]} ticks={[5, 10, 20, 40, 80, 160, 320]} {...AXIS} tickLine={false} />
                <YAxis scale="log" type="number" domain={["auto", "auto"]} allowDataOverflow {...AXIS} tickLine={false} axisLine={false} width={50} tickFormatter={(v: number) => v.toExponential(0)} />
                <Tooltip content={<ChartTooltip unit="km" />} />
                {active.map((id) => (
                  <Line key={id} dataKey={id} stroke={CATALOG_STYLE[id].color} strokeWidth={2} dot={{ r: 2.5, strokeWidth: 0, fill: CATALOG_STYLE[id].color }} connectNulls={false} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-col border-l border-edge pl-5">
            <div className="flex items-center gap-2">
              <h3 className="label">Inference results</h3>
              <InfoTip text={GLOSSARY.inference} size={11} />
              <span className="flex-1" />
              <Badge kind="pending" />
            </div>
            <div className="mt-2 space-y-1.5 text-[11px]">
              {["Precision", "Recall", "F1-score", "Location error", "Diameter error", "Inference time"].map((m) => (
                <div key={m} className="flex justify-between">
                  <span className="text-regolith-400">{m}</span>
                  <span className="num text-regolith-600">—</span>
                </div>
              ))}
            </div>
            <p className="mt-auto text-[10px] leading-snug text-regolith-600">
              Populated from evaluated experiments (Phase 4). Target baseline: DeepMoon — recall 92%, median fractional errors ≤ 11%.
            </p>
          </div>
        </div>
      </section>
      <button
        onClick={() => togglePanel("bottom")}
        className="glass absolute left-1/2 z-10 -translate-x-1/2 rounded-t-md px-4 text-regolith-400 transition-all hover:text-signal"
        style={{ bottom: panels.bottom ? 224 : 0 }}
        aria-label="Toggle metrics panel"
      >
        {panels.bottom ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>
    </>
  );
}
