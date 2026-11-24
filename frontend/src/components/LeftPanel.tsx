import { ChevronLeft, ChevronRight, Image, Mountain, TrendingUp, CircleDashed, Sparkles, SlidersHorizontal, Type } from "lucide-react";
import { useMoon } from "../store";
import { RASTER_LAYERS, type LayerGroup } from "../data/layers";
import { CATALOG_STYLE, useCatalog, type CatalogId } from "../data/catalogs";
import { Badge, Section, Toggle } from "./Panel";
import { InfoTip } from "./InfoTip";
import { GLOSSARY } from "../data/glossary";

const GROUPS: Array<{ id: LayerGroup; title: string; icon: typeof Image }> = [
  { id: "imagery", title: "Surface imagery", icon: Image },
  { id: "elevation", title: "Elevation", icon: Mountain },
  { id: "slope", title: "Slope", icon: TrendingUp },
];

function RasterGroup({ group }: { group: LayerGroup }) {
  const { rasters, setRaster } = useMoon();
  return (
    <div className="space-y-2.5">
      {RASTER_LAYERS.filter((l) => l.group === group).map((l) => {
        const st = rasters[l.id];
        return (
          <div key={l.id}>
            <div className="flex items-center gap-2">
              <Toggle on={st.visible} onClick={() => setRaster(l.id, { visible: !st.visible })} />
              <span className={`flex-1 text-[12px] ${st.visible ? "text-regolith-50" : "text-regolith-400"}`}>{l.label}</span>
              <InfoTip text={`${l.description} Source: ${l.instrument}, ${l.resolution}${l.coverage.north < 90 ? `, latitudes ±${l.coverage.north}°` : ", global"}. Served by NASA Moon Trek.`} />
            </div>
            <div className="mt-0.5 pl-9 text-[10px] text-regolith-600">
              {l.resolution}
              {l.coverage.north < 90 ? ` · ±${l.coverage.north}° lat` : " · global"}
            </div>
            {st.visible && (
              <div className="animate-in mt-1.5 pl-9">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={st.opacity}
                  onChange={(e) => setRaster(l.id, { opacity: +e.target.value })}
                  className="h-1 w-full"
                  aria-label={`${l.label} opacity`}
                />
                {l.legend && (
                  <div className="mt-1.5" title={l.legend.note}>
                    <div className="h-1.5 rounded-sm" style={{ background: l.legend.gradient }} />
                    <div className="mt-0.5 flex justify-between text-[9.5px] text-regolith-400">
                      <span>{l.legend.from}</span>
                      <span className="text-regolith-600">qualitative</span>
                      <span>{l.legend.to}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CatalogToggle({ id }: { id: CatalogId }) {
  const { catalogs, toggleCatalog } = useMoon();
  const q = useCatalog(id);
  const style = CATALOG_STYLE[id];
  return (
    <div className="flex items-center gap-2">
      <Toggle on={catalogs[id]} onClick={() => toggleCatalog(id)} color={style.mapColor} />
      <span className="h-2.5 w-2.5 rounded-full border-[1.5px]" style={{ borderColor: style.mapColor }} />
      <div className="flex-1">
        <div className={`text-[12px] ${catalogs[id] ? "text-regolith-50" : "text-regolith-400"}`}>{style.label}</div>
        <div className="num text-[10px] text-regolith-600">
          {q.isLoading ? "loading…" : q.isError ? "failed to load" : `${q.data?.meta.count.toLocaleString()} craters`}
        </div>
      </div>
      <Badge kind="real" />
    </div>
  );
}

const LOG_MIN = Math.log10(1);
const LOG_MAX = Math.log10(2100);

function DiameterFilter() {
  const { diameterRange, set } = useMoon();
  const toSlider = (d: number) => ((Math.log10(d) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100;
  const fromSlider = (v: number) => 10 ** (LOG_MIN + (v / 100) * (LOG_MAX - LOG_MIN));
  const [lo, hi] = diameterRange;
  return (
    <div>
      <div className="flex justify-between text-[12px]">
        <span className="text-regolith-400">Diameter</span>
        <span className="num text-regolith-50">
          {lo.toFixed(lo < 10 ? 1 : 0)} – {hi.toFixed(0)} km
        </span>
      </div>
      <div className="mt-2 space-y-1">
        <input type="range" min={0} max={100} step={0.5} value={toSlider(lo)} aria-label="Minimum diameter" className="w-full"
          onChange={(e) => set({ diameterRange: [Math.min(fromSlider(+e.target.value), hi), hi] })} />
        <input type="range" min={0} max={100} step={0.5} value={toSlider(hi)} aria-label="Maximum diameter" className="w-full"
          onChange={(e) => set({ diameterRange: [lo, Math.max(fromSlider(+e.target.value), lo)] })} />
      </div>
      <div className="mt-1 text-[10px] text-regolith-600">Log scale. Catalogs are complete only within their stated ranges.</div>
    </div>
  );
}

export function LeftPanel() {
  const { panels, togglePanel, showNames, set } = useMoon();
  return (
    <>
      <aside
        className={`glass scroll-thin absolute top-[68px] bottom-3 left-3 z-10 w-72 overflow-y-auto rounded-xl transition-all duration-300 ${
          panels.left ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-[110%] opacity-0"
        }`}
        style={{ bottom: panels.bottom ? 236 : 12 }}
      >
        {GROUPS.map((g) => (
          <Section key={g.id} title={g.title} icon={g.icon} info={GLOSSARY[g.id]}>
            <RasterGroup group={g.id} />
          </Section>
        ))}
        <Section title="Catalogued craters" icon={CircleDashed} info={GLOSSARY.catalogued}>
          <div className="space-y-3">
            <CatalogToggle id="head2010" />
            <CatalogToggle id="povilaitis2018" />
          </div>
        </Section>
        <Section title="Detected craters" icon={Sparkles} aside={<Badge kind="pending" />} info={GLOSSARY.detected}>
          <p className="text-[11.5px] leading-relaxed text-regolith-400">
            U-Net detections (DeepMoon reproduction) will appear here after training and evaluation in Phase 4. Nothing is
            simulated in this layer.
          </p>
        </Section>
        <Section title="Filters" icon={SlidersHorizontal} info={GLOSSARY.filters}>
          <DiameterFilter />
        </Section>
        <Section title="Labels" icon={Type} info={GLOSSARY.labels}>
          <div className="flex items-center gap-2">
            <Toggle on={showNames} onClick={() => set({ showNames: !showNames })} />
            <span className="flex-1 text-[12px]">IAU nomenclature</span>
            <Badge kind="real" />
          </div>
        </Section>
      </aside>
      <button
        onClick={() => togglePanel("left")}
        className="glass absolute top-1/2 z-10 -translate-y-1/2 rounded-r-md py-3 text-regolith-400 transition-all hover:text-signal"
        style={{ left: panels.left ? 300 : 0 }}
        aria-label="Toggle layers panel"
      >
        {panels.left ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>
    </>
  );
}
