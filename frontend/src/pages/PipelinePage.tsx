import { Database, Filter, Sigma, CircleDashed, Split, Network, Dumbbell, ClipboardCheck, Cpu, Map } from "lucide-react";
import { Card, PageShell } from "./Shell";

/**
 * The ten pipeline stages. Descriptions reflect what the code actually does
 * (ml/moonai_ml); stage examples will be filled from real run artifacts.
 */
const STAGES = [
  { icon: Database, title: "1 · Data acquisition", text: "DeepMoon training tiles (Zenodo, CC-BY-SA-4.0) are streamed by HTTP range requests — only the samples a profile needs — and verified against Zenodo MD5 checksums. Catalogs: Head 2010 (≥20 km) and Povilaitis 2018 (5–20 km)." },
  { icon: Filter, title: "2 · Pre-processing", text: "Tiles are 256×256 orthographic crops of the LOLA–Kaguya DEM (118 m/px source, crop sizes 500–6500 px). Each tile keeps its lon/lat bounds so every pixel maps back to lunar coordinates." },
  { icon: Sigma, title: "3 · Normalization", text: "8-bit elevation values are scaled to [0, 1] (x / 255) — the exact convention of the published DeepMoon data, recorded in the model metadata so browser inference reproduces it." },
  { icon: CircleDashed, title: "4 · Mask generation", text: "Targets are binary rings (1 px rims) drawn at each catalogued crater's position and radius — the network learns rims, not filled disks." },
  { icon: Split, title: "5 · Dataset split", text: "Train, validation and test tiles come from disjoint longitude bands. The pipeline checks the bounds of every tile and refuses to train if the bands overlap (no spatial leakage)." },
  { icon: Network, title: "6 · U-Net", text: "3-level encoder–decoder with skip connections (DeepMoon: 112 filters, 3×3 conv, dropout 0.15, sigmoid output). Smaller widths are used for smoke/dev profiles." },
  { icon: Dumbbell, title: "7 · Training", text: "Adam + binary cross-entropy, early stopping and LR schedule on validation loss, checkpoints and resume. Runs locally on Apple Silicon (MPS), NVIDIA (CUDA) or CPU; tracked in local MLflow." },
  { icon: ClipboardCheck, title: "8 · Evaluation", text: "Rims are extracted by template matching and matched one-to-one to catalog craters (DeepMoon criteria). Precision, recall, F1, IoU, location and diameter errors, per diameter bin and resolution." },
  { icon: Cpu, title: "9 · Inference", text: "Approved models are exported to ONNX, checked for numerical equivalence with PyTorch and sized for ONNX Runtime Web, so inference can run in the browser — no AWS compute." },
  { icon: Map, title: "10 · Geospatial detections", text: "Detections are converted from pixels to lunar lon/lat/diameter (IAU sphere, R = 1737.4 km) and published as versioned GeoJSON for the Explorer." },
];

export default function PipelinePage() {
  return (
    <PageShell
      title="How MoonAI learns to find craters"
      subtitle="From raw lunar topography to geolocated crater detections — the ten stages of the local pipeline, following the DeepMoon methodology (Silburt et al. 2019)."
    >
      <div className="grid gap-4 md:grid-cols-2">
        {STAGES.map(({ icon: Icon, title, text }) => (
          <Card key={title}>
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-signal/10 text-signal">
                <Icon size={15} />
              </span>
              <h3 className="text-[14px] font-medium">{title}</h3>
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-regolith-400">{text}</p>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
