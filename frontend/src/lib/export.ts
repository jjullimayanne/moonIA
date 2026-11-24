import type { Crater } from "../data/catalogs";
import { CRS_LABEL } from "./lunar";

/**
 * GeoJSON export. RFC 7946 assumes WGS84; lunar coordinates are therefore
 * declared explicitly in a foreign member ("moonai:crs") so no consumer
 * mistakes them for terrestrial positions.
 */
export function cratersToGeoJSON(craters: readonly Crater[], meta: Record<string, unknown>) {
  return {
    type: "FeatureCollection",
    "moonai:crs": CRS_LABEL,
    "moonai:meta": meta,
    features: craters.map((c) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [c.lon, c.lat] },
      properties: { catalog: c.catalog, diameter_km: c.diameter_km },
    })),
  };
}

export function cratersToCSV(craters: readonly Crater[]): string {
  const header = `# CRS: ${CRS_LABEL}\ncatalog,lon_deg_east,lat_deg,diameter_km`;
  return [header, ...craters.map((c) => `${c.catalog},${c.lon},${c.lat},${c.diameter_km}`)].join("\n");
}

export function download(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
