import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { InfoTip } from "./InfoTip";

export function Section({ title, icon: Icon, children, aside, info }: { title: string; icon?: LucideIcon; children: ReactNode; aside?: ReactNode; info?: string }) {
  return (
    <section className="border-b border-edge px-4 py-3.5 last:border-0">
      <div className="mb-2.5 flex items-center gap-2">
        {Icon && <Icon size={12} className="text-signal" />}
        <h3 className="label">{title}</h3>
        {info && <InfoTip text={info} />}
        <span className="flex-1" />
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Toggle({ on, onClick, color }: { on: boolean; onClick: () => void; color?: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={`relative h-4 w-7 shrink-0 rounded-full transition ${on ? "bg-signal/30" : "bg-regolith-600/40"}`}
    >
      <span
        className="absolute top-0.5 h-3 w-3 rounded-full transition-all"
        style={{ left: on ? 14 : 2, background: on ? (color ?? "#38e1ff") : "#8b96a3" }}
      />
    </button>
  );
}

export function Badge({ kind }: { kind: "real" | "simulated" | "pending" }) {
  const styles = {
    real: "border-ok/30 text-ok",
    simulated: "border-warn/40 text-warn",
    pending: "border-regolith-600 text-regolith-400",
  };
  const text = { real: "REAL DATA", simulated: "SIMULATED", pending: "PENDING" };
  return <span className={`rounded border px-1 py-px text-[8.5px] tracking-wider ${styles[kind]}`}>{text[kind]}</span>;
}

export function Row({ k, v, mono = true }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-[12px]">
      <span className="text-regolith-400">{k}</span>
      <span className={`text-right text-regolith-50 ${mono ? "num" : ""}`}>{v}</span>
    </div>
  );
}
