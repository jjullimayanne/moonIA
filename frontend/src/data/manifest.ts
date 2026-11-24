import { useQuery } from "@tanstack/react-query";

/**
 * Active-model manifest published by the local ML pipeline (`make publish`) to
 * /moonai/manifests/latest.json. Models update at most daily, so the manifest is
 * read once per page load (no polling) and CDN-cached for 1 h.
 */
export interface ModelManifest {
  schema_version: string;
  version: string; // e.g. "v3"
  experiment_id: string;
  trained_at: string; // ISO-8601 UTC
  published_at: string; // ISO-8601 UTC
  dataset_version: string;
  model_url: string; // relative, immutable
  predictions_url: string; // relative, immutable
  sha256: string;
  input: { shape: number[]; dtype: string; layout: string };
  normalization: { method: string; params: Record<string, number> };
  metrics: Record<string, number>; // validation metrics used by the quality gate
}

export function useManifest() {
  return useQuery({
    queryKey: ["manifest"],
    staleTime: Infinity,
    retry: false,
    queryFn: async (): Promise<ModelManifest | null> => {
      try {
        const r = await fetch(`${import.meta.env.BASE_URL}moonai/manifests/latest.json`);
        // Static hosts answer unknown paths with index.html — treat anything non-JSON as "not published".
        if (!r.ok || !r.headers.get("content-type")?.includes("json")) return null;
        return (await r.json()) as ModelManifest;
      } catch {
        return null;
      }
    },
  });
}

export function formatUpdate(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(d);
}
