import { ChevronLeft, ChevronRight, Layers, CircleDashed } from "lucide-react";
import { useMoon } from "../store";
import { UI_LAYERS } from "../data/layers";
import { CATALOG_STYLE, useCatalog, type CatalogId } from "../data/catalogs";
import { GLOSSARY } from "../data/glossary";
import { Section, Toggle } from "./Panel";
import { InfoTip } from "./InfoTip";

function LayerRow({ id, label, info, legend }: (typeof UI_LAYERS)[number]) {
  const { rasters, setRaster } = useMoon();
  const st = rasters[id];
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <Toggle on={st.visible} onClick={() => setRaster(id, { visible: !st.visible })} />
        <span className={`flex-1 text-[12.5px] ${st.visible ? "text-regolith-50" : "text-regolith-400"}`}>{label}</span>
        <InfoTip text={info} />
      </div>
      {st.visible && id !== "imagery" && (
        <div className="animate-in mt-2 flex items-center gap-2 pl-9.5">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={st.opacity}
            onChange={(e) => setRaster(id, { opacity: +e.target.value })}
            className="h-1 flex-1"
            aria-label={`${label} opacity`}
          />
          {legend && <div className="h-1.5 w-14 rounded-sm" style={{ background: legend.gradient }} title={`${legend.from} → ${legend.to}`} />}
        </div>
      )}
    </div>
  );
}

function CatalogRow({ id }: { id: CatalogId }) {
  const { catalogs, toggleCatalog } = useMoon();
  const q = useCatalog(id);
  const style = CATALOG_STYLE[id];
  return (
    <div className="flex items-center gap-2.5">
      <Toggle on={catalogs[id]} onClick={() => toggleCatalog(id)} color={style.mapColor} />
      <span className="h-2.5 w-2.5 shrink-0 rounded-full border-[1.5px]" style={{ borderColor: style.mapColor }} />
      <span className={`flex-1 text-[12.5px] ${catalogs[id] ? "text-regolith-50" : "text-regolith-400"}`}>{style.label}</span>
      <span className="num text-[10px] text-regolith-600">{q.data ? q.data.meta.count.toLocaleString() : "…"}</span>
    </div>
  );
}

const LOG_MAX = Math.log10(2100);

function DiameterFilter() {
  const { diameterRange, set } = useMoon();
  const toSlider = (d: number) => (Math.log10(d) / LOG_MAX) * 100;
  const fromSlider = (v: number) => 10 ** ((v / 100) * LOG_MAX);
  const [lo, hi] = diameterRange;
  return (
    <div className="pt-1">
      <div className="flex items-center gap-1.5 text-[11.5px]">
        <span className="text-regolith-400">Diameter</span>
        <InfoTip text={GLOSSARY.filters} size={11} />
        <span className="num ml-auto text-regolith-200">
          {lo.toFixed(lo < 10 ? 1 : 0)}–{hi.toFixed(0)} km
        </span>
      </div>
      <div className="mt-1.5 flex gap-2">
        <input type="range" min={0} max={100} step={0.5} value={toSlider(lo)} aria-label="Minimum diameter" className="w-1/2"
          onChange={(e) => set({ diameterRange: [Math.min(fromSlider(+e.target.value), hi), hi] })} />
        <input type="range" min={0} max={100} step={0.5} value={toSlider(hi)} aria-label="Maximum diameter" className="w-1/2"
          onChange={(e) => set({ diameterRange: [lo, Math.max(fromSlider(+e.target.value), lo)] })} />
      </div>
    </div>
  );
}

export function LeftPanel() {
  const { panels, togglePanel, showNames, set } = useMoon();
  return (
    <>
      <aside
        className={`glass scroll-thin absolute top-[68px] left-3 z-10 max-h-[calc(100%-140px)] w-64 overflow-y-auto rounded-xl transition-all duration-300 ${
          panels.left ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-[110%] opacity-0"
        }`}
      >
        <Section title="Map layers" icon={Layers}>
          <div className="space-y-3">
            {UI_LAYERS.map((l) => (
              <LayerRow key={l.id} {...l} />
            ))}
          </div>
        </Section>
        <Section title="Craters" icon={CircleDashed} info={GLOSSARY.catalogued}>
          <div className="space-y-3">
            <CatalogRow id="head2010" />
            <CatalogRow id="povilaitis2018" />
            <div className="flex items-center gap-2.5">
              <Toggle on={showNames} onClick={() => set({ showNames: !showNames })} />
              <span className={`flex-1 text-[12.5px] ${showNames ? "text-regolith-50" : "text-regolith-400"}`}>Feature names</span>
              <InfoTip text={GLOSSARY.labels} />
            </div>
            <div className="flex items-center gap-2.5 opacity-50" title={GLOSSARY.detected}>
              <Toggle on={false} onClick={() => {}} />
              <span className="flex-1 text-[12.5px] text-regolith-400">AI detections</span>
              <span className="text-[10px] text-regolith-600">soon</span>
            </div>
            <DiameterFilter />
          </div>
        </Section>
      </aside>
      <button
        onClick={() => togglePanel("left")}
        className="glass absolute top-1/2 z-10 -translate-y-1/2 rounded-r-md py-3 text-regolith-400 transition-all hover:text-signal"
        style={{ left: panels.left ? 268 : 0 }}
        aria-label="Toggle layers panel"
      >
        {panels.left ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>
    </>
  );
}
