import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MapPin, TriangleAlert } from "lucide-react";
import { useManifest, formatUpdate } from "../data/manifest";
import { useDetections, DETECTION_STYLE, type Detection } from "../data/detections";
import { useExperimentFile } from "../data/experiments";
import { useNomenclature } from "../data/catalogs";
import { greatCircleKm, formatLat, formatLon } from "../lib/lunar";
import { useMoon } from "../store";
import { Card, NoData, PageShell } from "./Shell";

const AXIS = { stroke: "#4b5562", tick: { fill: "#8b96a3", fontSize: 10, fontFamily: "JetBrains Mono" } };

interface EvalFile {
  validation: { precision: number; recall: number; f1: number; by_radius_px: Array<{ r_px: [number, number]; n_true: number; recall: number | null }> };
  test: { precision: number; recall: number; f1: number } | null;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <div className="label">{label}</div>
      <div className="num mt-2 text-[26px] leading-none">{value}</div>
      {sub && <div className="mt-1.5 text-[11px] text-regolith-400">{sub}</div>}
    </Card>
  );
}

export default function Discoveries() {
  const manifest = useManifest();
  const m = manifest.data;
  const det = useDetections();
  const ev = useExperimentFile<EvalFile>(m?.experiment_id, "evaluation_metrics.json");
  const names = useNomenclature();
  const { set, setPage, requestFlyTo } = useMoon();
  const [limit, setLimit] = useState(25);

  const all = det.data ?? [];
  const candidates = useMemo(() => all.filter((d) => !d.catalog_match).sort((a, b) => b.confidence - a.confidence), [all]);

  // nearest IAU-named feature; "confirmed" when an officially named crater sits at the same
  // place with a compatible size (independent of the training catalogs)
  const nearest = (d: Detection) => {
    let best: { name: string; km: number; diameter: number; type: string } | null = null;
    for (const f of names.data?.features ?? []) {
      if (Math.abs(f.lat - d.lat) > 3) continue;
      const km = greatCircleKm(d.lon, d.lat, f.lon, f.lat);
      if (!best || km < best.km) best = { name: f.name, km, diameter: f.diameter_km, type: f.type };
    }
    return best;
  };
  const iauConfirmed = (d: Detection) => {
    const n = nearest(d);
    return !!n && ["AA", "SF"].includes(n.type) && n.km <= Math.max(1.5, d.diameter_km / 2) && n.diameter > 0 &&
      n.diameter / d.diameter_km < 2 && d.diameter_km / n.diameter < 2;
  };
  const confirmed = useMemo(() => (names.data ? candidates.filter(iauConfirmed).length : 0), [candidates, names.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const view = (d: Detection) => {
    set({ showDetections: true, discoveryOnly: true, selectedPoint: { lon: d.lon, lat: d.lat }, selectedDetection: d, selectedCrater: null, selectedFeature: null });
    setPage("explorer");
    requestFlyTo(d.lon, d.lat, Math.max(30, d.diameter_km * 8));
  };

  if (manifest.isLoading) return null;
  if (!m)
    return (
      <PageShell title="AI Discoveries" subtitle="Craters found by the AI model that are missing from the reference catalogs.">
        <NoData what="No approved model has been published yet." command="make pipeline PROFILE=development SYNC=local" />
      </PageShell>
    );

  const bySize = ev.data?.validation.by_radius_px.map((b) => ({ size: `${b.r_px[0]}–${b.r_px[1]}`, recall: b.recall ?? 0, n: b.n_true })) ?? [];

  return (
    <PageShell
      title="AI Discoveries"
      subtitle={`What model ${m.version} found on the Moon: every detection in the held-out longitude bands, compared with the human-made catalogs. Trained ${formatUpdate(m.trained_at)} on your local machine.`}
    >
      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Craters detected" value={all.length.toLocaleString()} sub="unique, after merging overlapping tiles" />
        <Stat label="Match the catalog" value={(all.length - candidates.length).toLocaleString()} sub={all.length ? `${Math.round((100 * (all.length - candidates.length)) / all.length)} % of detections` : undefined} />
        <Stat
          label="Uncatalogued candidates"
          value={candidates.length.toLocaleString()}
          sub={names.data ? `${confirmed} coincide with an IAU-named crater — real craters the training catalogs miss` : "need expert verification"}
        />
        <Stat
          label="Test precision · recall"
          value={ev.data?.test ? `${ev.data.test.precision.toFixed(2)} · ${ev.data.test.recall.toFixed(2)}` : "—"}
          sub="unseen longitudes 60°–180° E, evaluated once"
        />
      </div>

      <div className="mt-5 flex gap-3 rounded-xl border border-warn/25 bg-warn/5 p-4 text-[12px] leading-relaxed text-regolith-200">
        <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warn" />
        <p>
          <b>Candidates, not confirmed discoveries.</b> A detection is a candidate when it matches no crater of the Head 2010 / Povilaitis 2018
          catalogs. Some are real craters the catalogs miss (they are incomplete below 5 km and near their limits); others are false
          positives. A <span className="text-ok">✓</span> means an officially IAU-named crater of similar size lies at the same position, which is
          independent evidence the crater is real. For model v1, 48.9 % of candidates are IAU-confirmed, against 2.3 % when the same
          candidates are shifted 30–80 km at random (chance level), about 21× above chance (<span className="num">scripts/iau_crosscheck.py</span>). This model is a reduced DeepMoon reproduction (validation precision {ev.data ? ev.data.validation.precision.toFixed(2) : "—"}), so
          every candidate should be checked against imagery before any claim is made.
        </p>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-[1fr_1.6fr]">
        <Card title="What the model finds well · recall by crater size (validation)">
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={bySize} margin={{ left: -14, right: 6 }}>
                <CartesianGrid vertical={false} stroke="#fff" strokeOpacity={0.05} />
                <XAxis dataKey="size" {...AXIS} tickLine={false} />
                <YAxis domain={[0, 1]} {...AXIS} tickLine={false} axisLine={false} width={40} />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  contentStyle={{ background: "#0c0e12", border: "1px solid #ffffff22", fontSize: 11 }}
                  formatter={(v, _n, p) => [`${(Number(v) * 100).toFixed(0)} % of ${(p.payload as { n: number }).n} craters`, "recall"]}
                  labelFormatter={(l) => `radius ${l} px`}
                />
                <Bar dataKey="recall" fill={DETECTION_STYLE.color} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-[11px] text-regolith-400">
            Radius in pixels of the input tile. Small craters are found more often; large rims exceed the network's receptive field.
          </p>
        </Card>

        <Card title={`Top candidates by confidence (${candidates.length})`}>
          <div className="scroll-thin max-h-[420px] overflow-y-auto">
            <table className="num w-full text-[11.5px]">
              <thead className="sticky top-0 bg-[#0c0e12] text-left text-regolith-400">
                <tr>
                  <th className="pb-2 font-normal">Location</th>
                  <th className="pb-2 text-right font-normal">Ø km</th>
                  <th className="pb-2 text-right font-normal">Conf.</th>
                  <th className="pb-2 pl-3 font-normal" title="✓ = an IAU-named crater of similar size at the same position (independent of the training catalogs)">IAU check</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {candidates.slice(0, limit).map((d, i) => {
                  const n = nearest(d);
                  return (
                    <tr key={i} className="border-t border-edge">
                      <td className="py-1.5">{formatLat(d.lat, 2)}, {formatLon(d.lon, 2)}</td>
                      <td className="text-right">{d.diameter_km.toFixed(1)}</td>
                      <td className="text-right">{d.confidence.toFixed(2)}</td>
                      <td className="max-w-44 truncate pl-3 font-sans text-regolith-400">
                        {n ? (
                          iauConfirmed(d) ? (
                            <span className="text-ok" title={`IAU-named crater ${n.name} (Ø ${n.diameter.toFixed(1)} km) at ${n.km.toFixed(1)} km — independent confirmation`}>
                              ✓ {n.name}
                            </span>
                          ) : (
                            `${n.name} · ${n.km.toFixed(0)} km`
                          )
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="text-right">
                        <button onClick={() => view(d)} className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-sans text-signal hover:bg-signal/10">
                          <MapPin size={12} /> View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {limit < candidates.length && (
              <button onClick={() => setLimit(limit + 50)} className="mt-3 w-full rounded-md border border-edge py-1.5 text-[11.5px] text-regolith-200 hover:text-signal">
                Show more
              </button>
            )}
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
