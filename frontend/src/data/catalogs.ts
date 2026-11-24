import { useQuery } from "@tanstack/react-query";

/** Real crater catalogs, preprocessed by backend/app/ingestion/catalogs.py into static JSON. */

export type CatalogId = "head2010" | "povilaitis2018";

export interface CatalogMeta {
  id: string;
  name: string;
  source_url: string;
  license: string;
  citation: string;
  description: string;
  crs: string;
  count: number;
  data_kind: "real" | "simulated";
  generated_at?: string;
}

export interface Crater {
  catalog: CatalogId;
  lon: number;
  lat: number;
  diameter_km: number;
}

export interface NamedFeature {
  lon: number;
  lat: number;
  diameter_km: number;
  name: string;
  type: string;
}

interface RawCatalog {
  meta: CatalogMeta;
  columns: string[];
  rows: Array<Array<number | string>>;
}

/**
 * `color` is the chart color (validated with the dataviz palette checker for the dark
 * surface: lightness band, CVD ΔE ≥ 19, contrast ≥ 3:1). `mapColor` is a lighter step
 * of the same hue for rims drawn over grey lunar imagery.
 */
export const CATALOG_STYLE: Record<CatalogId, { label: string; short: string; color: string; mapColor: string; completeKm: [number, number] }> = {
  head2010: { label: "Head et al. 2010 · D ≥ 20 km", short: "Head 2010", color: "#139fc0", mapColor: "#3fd6f5", completeKm: [20, 2050] },
  povilaitis2018: { label: "Povilaitis et al. 2018 · 5–20 km", short: "Povilaitis 2018", color: "#d0782f", mapColor: "#ffa057", completeKm: [5, 20] },
};

async function fetchRaw(id: string): Promise<RawCatalog> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/catalogs/${id}.json`);
  if (!res.ok) throw new Error(`Failed to load catalog ${id}: ${res.status}`);
  return res.json();
}

export function useCatalog(id: CatalogId) {
  return useQuery({
    queryKey: ["catalog", id],
    staleTime: Infinity,
    queryFn: async () => {
      const raw = await fetchRaw(id);
      const craters: Crater[] = raw.rows.map((r) => ({
        catalog: id,
        lon: r[0] as number,
        lat: r[1] as number,
        diameter_km: r[2] as number,
      }));
      return { meta: raw.meta, craters };
    },
  });
}

export function useNomenclature() {
  return useQuery({
    queryKey: ["catalog", "iau"],
    staleTime: Infinity,
    queryFn: async () => {
      const raw = await fetchRaw("iau");
      const features: NamedFeature[] = raw.rows.map((r) => ({
        lon: r[0] as number,
        lat: r[1] as number,
        diameter_km: r[2] as number,
        name: r[3] as string,
        type: r[4] as string,
      }));
      return { meta: raw.meta, features };
    },
  });
}
