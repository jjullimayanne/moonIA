import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Pause, Play, Radio } from "lucide-react";
import {
  artifactUrl,
  useExperimentFile,
  useExperimentIndex,
  useLiveProgress,
  type EpochRecord,
  type Experiment,
  type SampleIndex,
} from "../data/experiments";
import { formatUpdate } from "../data/manifest";
import { Card, NoData, PageShell } from "./Shell";

const AXIS = { stroke: "#4b5562", tick: { fill: "#8b96a3", fontSize: 10, fontFamily: "JetBrains Mono" } };
// validated categorical pair (dark surface) reused from the catalog palette
const C_TRAIN = "#139fc0";
const C_VAL = "#d0782f";
const STALE_MS = 15 * 60_000;

function LiveBanner() {
  const live = useLiveProgress();
  const p = live.data;
  if (!p) return null;
  const age = Date.now() - new Date(p.updated_at).getTime();
  const stale = p.status === "running" && age > STALE_MS;
  const pct = p.total_steps ? Math.round((100 * p.step) / p.total_steps) : 0;
  return (
    <Card className="mb-5">
      <div className="flex items-center gap-3 text-[12.5px]">
        <Radio size={14} className={p.status === "running" && !stale ? "text-ok" : "text-regolith-400"} />
        <span className="font-medium">{p.experiment_id}</span>
        <span className="text-regolith-400">
          {stale ? "no recent updates (local machine offline or job stopped)" : p.status} · epoch {p.epoch}/{p.total_epochs}
        </span>
        <span className="num ml-auto text-regolith-400">last sync {formatUpdate(p.updated_at)}</span>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/5">
        <div className="h-full bg-signal transition-all" style={{ width: `${pct}%` }} />
      </div>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="num mt-1 text-[20px]">{value == null ? "—" : value.toFixed(3)}</div>
    </div>
  );
}

export default function TrainingStudio() {
  const index = useExperimentIndex();
  const exps = index.data?.experiments ?? [];
  const [selected, setSelected] = useState<string>();
  const id = selected ?? exps[0]?.id;
  const exp = useExperimentFile<Experiment>(id, "experiment.json");
  const hist = useExperimentFile<{ epochs: EpochRecord[] }>(id, "training_history.json");
  const samples = useExperimentFile<SampleIndex>(id, "samples/index.json");

  const epochs = hist.data?.epochs ?? [];
  const [epoch, setEpoch] = useState(1);
  const [playing, setPlaying] = useState(false);
  const sampleEpochs = samples.data?.epochs ?? [];
  const shownEpoch = useMemo(
    () => sampleEpochs.filter((e) => e <= epoch).at(-1) ?? sampleEpochs[0],
    [sampleEpochs, epoch],
  );

  useEffect(() => setEpoch(epochs.at(-1)?.epoch ?? 1), [id, epochs.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!playing || !epochs.length) return;
    const t = setInterval(() => setEpoch((e) => (e >= epochs.at(-1)!.epoch ? (setPlaying(false), e) : e + 1)), 900);
    return () => clearInterval(t);
  }, [playing, epochs]);

  const rec = epochs.find((e) => e.epoch === epoch);

  return (
    <PageShell
      title="Training Studio"
      subtitle="Replay how the U-Net learned to see crater rims: losses and metrics per epoch, a fixed set of validation tiles, and selected internal activations. Every frame comes from a real local training run."
    >
      <LiveBanner />
      {index.isLoading ? null : !exps.length ? (
        <NoData what="No training run has been published yet." command="make pipeline PROFILE=smoke SYNC=local" />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={id}
              onChange={(e) => setSelected(e.target.value)}
              className="rounded-lg border border-edge bg-black/40 px-3 py-1.5 text-[12px]"
              aria-label="Experiment"
            >
              {exps.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.id} · {e.profile}
                  {e.approved ? " · approved" : ""}
                </option>
              ))}
            </select>
            {exp.data?.profile === "smoke" && (
              <span className="rounded border border-warn/40 px-1.5 py-0.5 text-[10px] text-warn">
                SMOKE RUN — pipeline test on a tiny subset, not a scientific result
              </span>
            )}
          </div>

          {epochs.length > 0 && (
            <Card>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => {
                    if (epoch >= epochs.at(-1)!.epoch) setEpoch(epochs[0].epoch);
                    setPlaying(!playing);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-signal/15 text-signal"
                  aria-label={playing ? "Pause" : "Play"}
                >
                  {playing ? <Pause size={14} /> : <Play size={14} />}
                </button>
                <input
                  type="range"
                  min={epochs[0].epoch}
                  max={epochs.at(-1)!.epoch}
                  value={epoch}
                  onChange={(e) => setEpoch(+e.target.value)}
                  className="flex-1"
                  aria-label="Epoch"
                />
                <span className="num w-24 text-right text-[13px]">
                  epoch {epoch}/{epochs.at(-1)!.epoch}
                </span>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-4 md:grid-cols-6">
                <Metric label="Train loss" value={rec?.train_loss} />
                <Metric label="Val loss" value={rec?.val_loss} />
                <Metric label="Val IoU" value={rec?.iou} />
                <Metric label="Precision" value={rec?.precision} />
                <Metric label="Recall" value={rec?.recall} />
                <Metric label="F1" value={rec?.f1} />
              </div>
            </Card>
          )}

          <div className="grid gap-5 md:grid-cols-2">
            <Card title="Loss (binary cross-entropy)">
              <div className="mb-2 flex gap-3 text-[10px] text-regolith-200">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: C_TRAIN }} />train</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: C_VAL }} />validation</span>
              </div>
              <div className="h-52">
                <ResponsiveContainer>
                  <LineChart data={epochs} margin={{ left: -10, right: 8 }}>
                    <CartesianGrid stroke="#fff" strokeOpacity={0.05} />
                    <XAxis dataKey="epoch" {...AXIS} tickLine={false} />
                    <YAxis {...AXIS} tickLine={false} axisLine={false} width={48} />
                    <Tooltip contentStyle={{ background: "#0c0e12", border: "1px solid #ffffff22", fontSize: 11 }} />
                    <ReferenceLine x={epoch} stroke="#38e1ff" strokeOpacity={0.5} />
                    <Line dataKey="train_loss" name="train" stroke={C_TRAIN} strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line dataKey="val_loss" name="validation" stroke={C_VAL} strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title="Validation IoU · F1 (after template matching)">
              <div className="h-[226px]">
                <ResponsiveContainer>
                  <LineChart data={epochs} margin={{ left: -10, right: 8 }}>
                    <CartesianGrid stroke="#fff" strokeOpacity={0.05} />
                    <XAxis dataKey="epoch" {...AXIS} tickLine={false} />
                    <YAxis domain={[0, 1]} {...AXIS} tickLine={false} axisLine={false} width={48} />
                    <Tooltip contentStyle={{ background: "#0c0e12", border: "1px solid #ffffff22", fontSize: 11 }} />
                    <ReferenceLine x={epoch} stroke="#38e1ff" strokeOpacity={0.5} />
                    <Line dataKey="iou" name="IoU" stroke={C_TRAIN} strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line dataKey="f1" name="F1" stroke={C_VAL} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {samples.data && shownEpoch != null && (
            <Card title={`Fixed validation tiles · epoch ${shownEpoch}`}>
              <div className="mb-2 grid grid-cols-[120px_1fr_1fr_1fr] gap-3 text-[10px] tracking-wider text-regolith-400 uppercase">
                <span />
                <span>DEM input</span>
                <span>Ground truth rims</span>
                <span>Prediction</span>
              </div>
              <div className="space-y-3">
                {samples.data.samples.map((s) => (
                  <div key={s.id} className="grid grid-cols-[120px_1fr_1fr_1fr] items-center gap-3">
                    <div className="num text-[10px] text-regolith-400">
                      {s.id}
                      <br />
                      {s.lon_range.map((v) => v.toFixed(1)).join("…")}° E
                      <br />
                      {s.lat_range.map((v) => v.toFixed(1)).join("…")}° N
                    </div>
                    {["input", "target"].map((k) => (
                      <img key={k} src={artifactUrl(`moonai/experiments/${id}/samples/${s.id}_${k}.png`)} alt={`${s.id} ${k}`} className="aspect-square w-full rounded-md [image-rendering:pixelated]" />
                    ))}
                    <img
                      src={artifactUrl(`moonai/experiments/${id}/samples/epoch_${String(shownEpoch).padStart(3, "0")}/${s.id}_pred.png`)}
                      alt={`${s.id} prediction epoch ${shownEpoch}`}
                      className="aspect-square w-full rounded-md [image-rendering:pixelated]"
                    />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {samples.data && samples.data.activation_layers.length > 0 && (
            <Card title="What the network sees · mean activation of selected layers">
              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${samples.data.activation_layers.length}, minmax(0,1fr))` }}>
                {samples.data.activation_layers.map((layer) => {
                  const ae = samples.data!.activation_epochs.filter((e) => e <= epoch).at(-1) ?? samples.data!.activation_epochs[0];
                  return (
                    <figure key={layer}>
                      <img
                        src={artifactUrl(`moonai/experiments/${id}/activations/epoch_${String(ae).padStart(3, "0")}/${layer}.png`)}
                        alt={`${layer} activations`}
                        className="aspect-square w-full rounded-md [image-rendering:pixelated]"
                      />
                      <figcaption className="num mt-1 text-[10px] text-regolith-400">
                        {layer} · ep {ae}
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
            </Card>
          )}

          {exp.data && (
            <Card title="Run details">
              <pre className="num scroll-thin max-h-72 overflow-auto text-[11px] text-regolith-200">
                {JSON.stringify({ architecture: exp.data.architecture, hardware: exp.data.hardware, config: exp.data.config, dataset: exp.data.dataset }, null, 2)}
              </pre>
            </Card>
          )}
        </div>
      )}
    </PageShell>
  );
}
