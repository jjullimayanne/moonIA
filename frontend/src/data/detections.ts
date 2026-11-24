import { useQuery } from "@tanstack/react-query";
import { useManifest } from "./manifest";
import { artifactUrl } from "./experiments";

/** AI detections of the active model (moonai/predictions/vN/craters.geojson, lunar CRS). */
export interface Detection {
  lon: number;
  lat: number;
  diameter_km: number;
  confidence: number;
  catalog_match: boolean;
  split: string;
}

// validated with the dataviz palette checker against the two catalog colors (dark surface)
export const DETECTION_STYLE = { color: "#9b59d0", mapColor: "#c58cff", label: "AI detections" };

export function useDetections() {
  const manifest = useManifest();
  const url = manifest.data?.predictions_url;
  return useQuery({
    queryKey: ["detections", url],
    enabled: !!url,
    staleTime: Infinity,
    queryFn: async (): Promise<Detection[]> => {
      const r = await fetch(artifactUrl(url!));
      if (!r.ok) throw new Error(`predictions ${r.status}`);
      const gj = await r.json();
      return gj.features.map((f: { geometry: { coordinates: [number, number] }; properties: Omit<Detection, "lon" | "lat"> }) => ({
        lon: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
        ...f.properties,
      }));
    },
  });
}
