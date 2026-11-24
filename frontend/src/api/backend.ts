import { useQuery } from "@tanstack/react-query";

/**
 * Optional FastAPI backend. The static site (GitHub Pages) works without it;
 * features that need it (DEM elevation/slope, inference) show as offline.
 */
// "" = same origin (CloudFront /api/*), "off" = static-only deployment (e.g. GitHub Pages).
export const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
export const API_ENABLED = API_URL !== "off";

export interface Health {
  status: string;
  version: string;
  model: { status: "not_trained" | "ready"; name: string | null };
}

export interface TerrainSample {
  lon: number;
  lat: number;
  elevation_m: number;
  slope_deg: number;
  pixel_size_m: number;
  source: string;
}

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: async (): Promise<Health> => {
      const r = await fetch(`${API_URL}/api/health`, { signal: AbortSignal.timeout(3000) });
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    },
    enabled: API_ENABLED,
    retry: false,
    refetchInterval: 300_000, // 5 min: idle tabs must not generate API cost
  });
}

export function useTerrain(point: { lon: number; lat: number } | null, enabled: boolean) {
  return useQuery({
    queryKey: ["terrain", point?.lon, point?.lat],
    enabled: enabled && !!point && Math.abs(point.lat) < 60,
    retry: false,
    staleTime: Infinity,
    queryFn: async (): Promise<TerrainSample> => {
      const r = await fetch(`${API_URL}/api/terrain/point?lon=${point!.lon}&lat=${point!.lat}`, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!r.ok) throw new Error((await r.json()).detail ?? r.statusText);
      return r.json();
    },
  });
}
