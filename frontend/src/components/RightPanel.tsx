import { Crosshair, CircleDot, ScanSearch, Download, Mountain, X } from "lucide-react";
import { useMoon } from "../store";
import { useHealth, useTerrain } from "../api/backend";
import { CATALOG_STYLE } from "../data/catalogs";
import { useScopeCraters } from "../data/scope";
import { formatLat, formatLon } from "../lib/lunar";
import { cratersToCSV, cratersToGeoJSON, download } from "../lib/export";
import { Row, Section } from "./Panel";
import { GLOSSARY } from "../data/glossary";

function TerrainBlock() {
  const { selectedPoint } = useMoon();
  const health = useHealth();
  const terrain = useTerrain(selectedPoint, health.isSuccess);
  if (!selectedPoint) return null;
  if (Math.abs(selectedPoint.lat) >= 60)
    return <p className="text-[11px] text-regolith-400">The 59 m LOLA–Kaguya DEM covers only ±60° latitude.</p>;
  if (!health.isSuccess)
    return (
      <p className="text-[11px] leading-relaxed text-regolith-400">
        Elevation and slope are computed by the backend from the LOLA–Kaguya DEM. Run the API locally to enable it
        (<span className="num text-regolith-200">docker compose up</span>).
      </p>
    );
  if (terrain.isLoading) return <p className="num text-[11px] text-signal">Reading DEM window (remote COG)…</p>;
  if (terrain.isError) return <p className="text-[11px] text-warn">{String(terrain.error.message)}</p>;
  const t = terrain.data!;
  return (
    <>
      <Row k="Elevation" v={`${t.elevation_m.toFixed(0)} m`} />
      <Row k="Slope (Horn 3×3)" v={`${t.slope_deg.toFixed(1)}°`} />
      <Row k="DEM pixel" v={`${t.pixel_size_m.toFixed(1)} m`} />
      <p className="mt-1 text-[10px] text-regolith-600">Elevation relative to the 1737.4 km reference sphere.</p>
    </>
  );
}

function RoiBlock() {
  const { roi, set } = useMoon();
  const scope = useScopeCraters();
  if (!roi) return null;
  const density = (scope.all.length / scope.areaKm2) * 1e6;
  const meta = { roi, generated: new Date().toISOString(), catalogs: Object.keys(scope.byCatalog) };
  return (
    <Section
      title="Region of interest"
      icon={ScanSearch}
      info={GLOSSARY.roi}
      aside={
        <button onClick={() => set({ roi: null })} className="text-regolith-400 hover:text-regolith-50" aria-label="Clear region">
          <X size={13} />
        </button>
      }
    >
      <Row k="Lon" v={`${formatLon(roi.west, 2)} → ${formatLon(roi.east, 2)}`} />
      <Row k="Lat" v={`${formatLat(roi.south, 2)} → ${formatLat(roi.north, 2)}`} />
      <Row k="Area" v={`${Math.round(scope.areaKm2).toLocaleString()} km²`} />
      {(Object.keys(scope.byCatalog) as Array<keyof typeof scope.byCatalog>).map((id) => (
        <Row key={id} k={CATALOG_STYLE[id].short} v={scope.byCatalog[id].length.toLocaleString()} />
      ))}
      <Row k="Density" v={`${density.toFixed(1)} / 10⁶ km²`} />
      <div className="mt-3 grid grid-cols-2 gap-2">
        {[
          ["GeoJSON", () => download("moonai_roi_craters.geojson", JSON.stringify(cratersToGeoJSON(scope.all, meta), null, 1), "application/geo+json")],
          ["CSV", () => download("moonai_roi_craters.csv", cratersToCSV(scope.all), "text/csv")],
        ].map(([label, fn]) => (
          <button
            key={label as string}
            onClick={fn as () => void}
            className="flex items-center justify-center gap-1.5 rounded-md border border-edge py-1.5 text-[11px] text-regolith-200 transition hover:border-signal/50 hover:text-signal"
          >
            <Download size={12} /> {label as string}
          </button>
        ))}
      </div>
      <p className="mt-3 rounded-md border border-warn/20 bg-warn/5 p-2 text-[10.5px] leading-relaxed text-regolith-200">
        Regions are flagged only as <b>areas of interest for further investigation</b>. Slope and catalogued crater
        counts at these resolutions are not sufficient to assess landing safety.
      </p>
    </Section>
  );
}

export function RightPanel() {
  const { selectedPoint, selectedCrater, selectedFeature, selectedDetection, roi, set } = useMoon();
  const open = !!(selectedPoint || roi);
  const close = () => set({ selectedPoint: null, selectedCrater: null, selectedFeature: null, selectedDetection: null });
  return (
    <aside
      className={`glass scroll-thin absolute top-[68px] right-3 z-10 max-h-[calc(100%-140px)] w-72 overflow-y-auto rounded-xl transition-all duration-300 ${
        open ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-[110%] opacity-0"
      }`}
    >
      {selectedPoint && (
        <Section
          title={selectedCrater ? "Crater" : "Location"}
          icon={selectedCrater ? CircleDot : Crosshair}
          info={selectedCrater ? GLOSSARY.crater : GLOSSARY.location}
          aside={
            <button onClick={close} className="text-regolith-400 hover:text-regolith-50" aria-label="Close inspector">
              <X size={13} />
            </button>
          }
        >
          <div className="animate-in">
            {(selectedFeature || selectedCrater) && (
              <div className="mb-2 flex items-center gap-2">
                {selectedCrater && (
                  <span className="h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: CATALOG_STYLE[selectedCrater.catalog].mapColor }} />
                )}
                <span className="text-[15px] font-medium">{selectedFeature?.name ?? "Unnamed crater"}</span>
              </div>
            )}
            {selectedCrater && (
              <>
                <Row k="Diameter" v={`${selectedCrater.diameter_km.toFixed(1)} km`} />
                <Row k="Catalog" v={CATALOG_STYLE[selectedCrater.catalog].short} mono={false} />
              </>
            )}
            <Row k="Latitude" v={formatLat(selectedPoint.lat, 4)} />
            <Row k="Longitude" v={formatLon(selectedPoint.lon, 4)} />
          </div>
        </Section>
      )}

      {selectedDetection && (
        <Section title="AI detection" icon={CircleDot} info={GLOSSARY.detected}>
          <Row k="Diameter" v={`${selectedDetection.diameter_km.toFixed(1)} km`} />
          <Row k="Confidence (template corr.)" v={selectedDetection.confidence.toFixed(2)} />
          <Row k="In catalog?" v={selectedDetection.catalog_match ? "yes — matched" : "no — candidate"} mono={false} />
        </Section>
      )}

      {selectedPoint && (
        <Section title="Terrain" icon={Mountain} info={GLOSSARY.terrain}>
          <TerrainBlock />
        </Section>
      )}

      <RoiBlock />
    </aside>
  );
}
