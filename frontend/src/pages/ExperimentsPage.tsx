import { useExperimentIndex } from "../data/experiments";
import { useManifest, formatUpdate } from "../data/manifest";
import { Card, NoData, PageShell } from "./Shell";

const COLS = ["val_iou", "val_precision", "val_recall", "val_f1", "val_loc_err", "val_diam_err"] as const;

export default function ExperimentsPage() {
  const index = useExperimentIndex();
  const manifest = useManifest();
  const exps = index.data?.experiments ?? [];
  return (
    <PageShell
      title="Experiments & models"
      subtitle="Every local training run with its profile, validation metrics and quality-gate decision. Only approved runs become a published model version; the test set is reserved for the final scientific evaluation."
    >
      <Card title="Active model" className="mb-5">
        {manifest.data ? (
          <div className="num text-[12.5px]">
            {manifest.data.version} · experiment {manifest.data.experiment_id} · trained {formatUpdate(manifest.data.trained_at)} · sha256{" "}
            {manifest.data.sha256.slice(0, 12)}…
          </div>
        ) : (
          <p className="text-[12.5px] text-regolith-400">No model has passed the quality gate and been published yet.</p>
        )}
      </Card>
      {index.isLoading ? null : !exps.length ? (
        <NoData what="No experiments recorded yet." command="make pipeline PROFILE=development SYNC=local" />
      ) : (
        <Card>
          <table className="num w-full text-[11.5px]">
            <thead className="text-left text-regolith-400">
              <tr>
                <th className="pb-2 font-normal">Experiment</th>
                <th className="pb-2 font-normal">Profile</th>
                <th className="pb-2 font-normal">Date</th>
                {COLS.map((c) => (
                  <th key={c} className="pb-2 text-right font-normal">{c.replace("val_", "")}</th>
                ))}
                <th className="pb-2 text-right font-normal">Gate</th>
              </tr>
            </thead>
            <tbody>
              {exps.map((e) => (
                <tr key={e.id} className="border-t border-edge">
                  <td className="py-2">{e.id}</td>
                  <td className={e.profile === "smoke" ? "text-warn" : ""}>{e.profile}</td>
                  <td className="text-regolith-400">{formatUpdate(e.created_at)}</td>
                  {COLS.map((c) => (
                    <td key={c} className="text-right">{e.metrics[c] != null ? e.metrics[c].toFixed(3) : "—"}</td>
                  ))}
                  <td className={`text-right ${e.approved ? "text-ok" : "text-regolith-400"}`}>{e.approved ? `✓ ${e.model_version}` : "not approved"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </PageShell>
  );
}
