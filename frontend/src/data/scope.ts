import { useMemo } from "react";
import { useCatalog, type CatalogId, type Crater } from "./catalogs";
import { useMoon } from "../store";
import { bboxAreaKm2, inBBox, MOON_RADIUS_KM } from "../lib/lunar";

const IDS: CatalogId[] = ["head2010", "povilaitis2018"];

/** Craters of the enabled catalogs inside the ROI (or the whole Moon), after the diameter filter. */
export function useScopeCraters() {
  const head = useCatalog("head2010");
  const pov = useCatalog("povilaitis2018");
  const { catalogs, diameterRange, roi } = useMoon();

  return useMemo(() => {
    const data = { head2010: head.data?.craters, povilaitis2018: pov.data?.craters };
    const [dmin, dmax] = diameterRange;
    const byCatalog: Record<CatalogId, Crater[]> = { head2010: [], povilaitis2018: [] };
    for (const id of IDS) {
      if (!catalogs[id]) continue;
      for (const c of data[id] ?? []) {
        if (c.diameter_km < dmin || c.diameter_km > dmax) continue;
        if (roi && !inBBox(c.lon, c.lat, roi)) continue;
        byCatalog[id].push(c);
      }
    }
    const areaKm2 = roi ? bboxAreaKm2(roi) : 4 * Math.PI * MOON_RADIUS_KM ** 2;
    return { byCatalog, all: [...byCatalog.head2010, ...byCatalog.povilaitis2018], areaKm2, scope: roi ? "roi" : "global" } as const;
  }, [head.data, pov.data, catalogs, diameterRange, roi]);
}
