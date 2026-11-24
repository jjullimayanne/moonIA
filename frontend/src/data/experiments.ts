import { useQuery } from "@tanstack/react-query";

/**
 * Contract with the local ML pipeline (ml/moonai_ml/publishing). Everything under
 * /moonai/ is produced by real local runs; nothing here is generated in the browser.
 *
 *   moonai/experiments/index.json                list of published experiments
 *   moonai/experiments/<id>/experiment.json      config, dataset, hardware, architecture
 *   moonai/experiments/<id>/training_history.json  per-epoch metrics
 *   moonai/experiments/<id>/evaluation_metrics.json
 *   moonai/experiments/<id>/samples/index.json   fixed validation samples per epoch (PNG)
 *   moonai/live/progress.json                    optional live progress of a running job
 */

export interface ExperimentSummary {
  id: string;
  profile: "smoke" | "development" | "production";
  created_at: string;
  status: "completed" | "failed" | "running";
  approved: boolean;
  model_version: string | null;
  metrics: Record<string, number>;
}

export interface ExperimentIndex {
  schema_version: string;
  updated_at: string;
  experiments: ExperimentSummary[];
}

export interface EpochRecord {
  epoch: number;
  train_loss: number;
  val_loss: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  iou: number;
  lr: number;
  seconds: number;
}

export interface Experiment {
  id: string;
  profile: string;
  created_at: string;
  git_commit: string | null;
  seed: number;
  config: Record<string, unknown>;
  dataset: Record<string, unknown>;
  hardware: Record<string, unknown>;
  architecture: { name: string; params: number; levels: number; filters: number[]; input: number[] };
}

export interface SampleIndex {
  samples: Array<{ id: string; split: string; lon_range: [number, number]; lat_range: [number, number] }>;
  epochs: number[];
  activation_layers: string[];
  activation_epochs: number[];
}

export interface LiveProgress {
  experiment_id: string;
  status: "running" | "completed" | "failed" | "interrupted";
  sync_interval_s?: number;
  epoch: number;
  total_epochs: number;
  step: number;
  total_steps: number;
  metrics: Record<string, number>;
  updated_at: string;
}

export const artifactUrl = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;

async function getJson<T>(path: string, bust = false): Promise<T | null> {
  try {
    // live files: a per-minute query string bypasses the CDN cache (GitHub Pages caches ~10 min)
    const url = artifactUrl(path) + (bust ? `?t=${Math.floor(Date.now() / 60_000)}` : "");
    const r = await fetch(url, { cache: "no-cache" });
    if (!r.ok || !r.headers.get("content-type")?.includes("json")) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

/** The index refreshes every 2 min while any experiment is still running (live Colab training). */
export const useExperimentIndex = () =>
  useQuery({
    queryKey: ["experiments"],
    retry: false,
    queryFn: () => getJson<ExperimentIndex>("moonai/experiments/index.json", true),
    refetchInterval: (q) => (q.state.data?.experiments.some((e) => e.status === "running") ? 120_000 : false),
  });

export const useExperimentFile = <T,>(id: string | undefined, file: string, live = false) =>
  useQuery({
    queryKey: ["experiment", id, file],
    enabled: !!id,
    staleTime: live ? 0 : Infinity,
    retry: false,
    refetchInterval: live ? 120_000 : false,
    queryFn: () => getJson<T>(`moonai/experiments/${id}/${file}`, live),
  });

/** Live progress: polled every 60 s only while the Training Studio is open. */
export const useLiveProgress = () =>
  useQuery({ queryKey: ["live"], retry: false, refetchInterval: 60_000, queryFn: () => getJson<LiveProgress>("moonai/live/progress.json", true) });
