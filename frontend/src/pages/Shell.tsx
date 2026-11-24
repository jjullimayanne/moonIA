import type { ReactNode } from "react";
import { Terminal } from "lucide-react";

/** Full-screen module layout drawn over the (paused) lunar map. */
export function PageShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="animate-in absolute inset-x-0 top-[68px] bottom-0 z-10 overflow-y-auto bg-void/92 backdrop-blur-sm scroll-thin">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-regolith-400">{subtitle}</p>
        <div className="mt-7">{children}</div>
      </div>
    </main>
  );
}

/** Honest empty state: explains what produces the data instead of showing demo numbers. */
export function NoData({ what, command }: { what: string; command: string }) {
  return (
    <div className="glass rounded-xl p-8 text-center">
      <p className="text-[14px] text-regolith-200">{what}</p>
      <p className="mt-2 text-[12px] text-regolith-400">
        This view only shows artifacts produced by real local training runs. Generate them with:
      </p>
      <code className="num mt-4 inline-flex items-center gap-2 rounded-lg border border-edge bg-black/40 px-4 py-2 text-[12px] text-signal">
        <Terminal size={13} /> {command}
      </code>
    </div>
  );
}

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`glass rounded-xl p-5 ${className}`}>
      {title && <h3 className="label mb-3">{title}</h3>}
      {children}
    </section>
  );
}
