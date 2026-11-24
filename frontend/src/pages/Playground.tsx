import { useEffect, useRef, useState } from "react";
import { Cpu, ShieldCheck } from "lucide-react";
import { artifactUrl, useExperimentFile, type SampleIndex } from "../data/experiments";
import { useManifest } from "../data/manifest";
import { Card, NoData, PageShell } from "./Shell";

// inferno-like ramp for rim probability (dark → bright)
const RAMP = [
  [0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99], [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 255, 164],
];
const ramp = (v: number) => {
  const x = Math.min(0.9999, Math.max(0, v)) * (RAMP.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  return RAMP[i].map((c, k) => c + (RAMP[i + 1][k] - c) * f);
};

async function tilePixels(url: string): Promise<Float32Array> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();
  const c = new OffscreenCanvas(256, 256);
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, 256, 256);
  const d = ctx.getImageData(0, 0, 256, 256).data;
  const x = new Float32Array(256 * 256);
  for (let i = 0; i < x.length; i++) x[i] = d[i * 4] / 255; // same normalization as training (x / 255)
  return x;
}

export default function Playground() {
  const manifest = useManifest();
  const m = manifest.data;
  const samples = useExperimentFile<SampleIndex>(m?.experiment_id, "samples/index.json");
  const worker = useRef<Worker | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<string>("");
  const [ready, setReady] = useState(false);
  const [tile, setTile] = useState<string>();
  const [ms, setMs] = useState<number>();

  useEffect(() => {
    if (!m) return;
    const w = new Worker(new URL("../workers/inference.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    setStatus("Downloading and verifying model…");
    w.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === "loaded") {
        setReady(true);
        setStatus(`Model ${m.version} loaded (${(msg.bytes / 2 ** 20).toFixed(1)} MB) · SHA-256 verified`);
      } else if (msg.type === "result") {
        setMs(msg.ms);
        const ctx = canvas.current!.getContext("2d")!;
        const im = ctx.createImageData(256, 256);
        msg.prob.forEach((p: number, i: number) => {
          const [r, g, b] = ramp(p);
          im.data.set([r, g, b, 255], i * 4);
        });
        ctx.putImageData(im, 0, 0);
      } else if (msg.type === "error") setStatus(`Error: ${msg.message}`);
    };
    w.postMessage({ type: "load", url: artifactUrl(m.model_url), sha256: m.sha256 });
    return () => w.terminate();
  }, [m]);

  const run = async (id: string) => {
    setTile(id);
    const x = await tilePixels(artifactUrl(`moonai/experiments/${m!.experiment_id}/samples/${id}_input.png`));
    worker.current?.postMessage({ type: "run", data: x }, [x.buffer]);
  };

  return (
    <PageShell
      title="AI Playground"
      subtitle="Run the published crater model directly in your browser (ONNX Runtime Web in a Web Worker — no server, no cloud GPU). Pick a real validation tile of the lunar DEM and watch the network predict crater rims."
    >
      {manifest.isLoading ? null : !m ? (
        <NoData what="No approved model has been published yet — the playground runs only real, gate-approved models." command="make pipeline PROFILE=development SYNC=local" />
      ) : (
        <div className="space-y-5">
          <Card>
            <div className="flex flex-wrap items-center gap-4 text-[12px]">
              <span className="flex items-center gap-2"><Cpu size={14} className="text-signal" /> model {m.version} · experiment {m.experiment_id}</span>
              <span className="flex items-center gap-2 text-regolith-400"><ShieldCheck size={14} className={ready ? "text-ok" : ""} /> {status}</span>
              {ms != null && <span className="num ml-auto text-regolith-200">inference {ms.toFixed(0)} ms / tile (wasm, 1 thread)</span>}
            </div>
          </Card>
          <div className="grid gap-5 md:grid-cols-[1fr_auto]">
            <Card title="Choose a validation tile">
              <div className="grid grid-cols-4 gap-2 md:grid-cols-6">
                {samples.data?.samples.map((s) => (
                  <button key={s.id} disabled={!ready} onClick={() => run(s.id)} className={`overflow-hidden rounded-md border-2 transition ${tile === s.id ? "border-signal" : "border-transparent hover:border-edge"} disabled:opacity-40`}>
                    <img src={artifactUrl(`moonai/experiments/${m.experiment_id}/samples/${s.id}_input.png`)} alt={s.id} className="aspect-square w-full" />
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-regolith-400">
                Tiles come from the validation longitude band (−60°…60°), never seen during training.
              </p>
            </Card>
            <Card title="Input · ground truth · browser prediction">
              <div className="grid grid-cols-3 gap-2">
                {tile ? (
                  <>
                    <img src={artifactUrl(`moonai/experiments/${m.experiment_id}/samples/${tile}_input.png`)} alt="input" className="h-44 w-44 rounded-md" />
                    <img src={artifactUrl(`moonai/experiments/${m.experiment_id}/samples/${tile}_target.png`)} alt="ground truth" className="h-44 w-44 rounded-md" />
                  </>
                ) : (
                  <div className="col-span-2 flex h-44 w-[22rem] items-center justify-center text-[12px] text-regolith-400">pick a tile</div>
                )}
                <canvas ref={canvas} width={256} height={256} className="h-44 w-44 rounded-md bg-black" />
              </div>
            </Card>
          </div>
        </div>
      )}
    </PageShell>
  );
}
