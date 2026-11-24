import { BarChart3, SquareDashed } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMoon } from "../store";
import { GLOSSARY } from "../data/glossary";

function ToolButton({ icon: Icon, label, active, onClick, hint }: { icon: LucideIcon; label: string; active: boolean; onClick: () => void; hint: string }) {
  return (
    <button
      onClick={onClick}
      title={hint}
      className={`glass flex items-center gap-2 rounded-lg px-3 py-2 text-[11.5px] transition ${
        active ? "border-signal/60 text-signal" : "text-regolith-200 hover:text-signal"
      }`}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}

/** Floating map tools: region selection and the statistics sheet. */
export function MapTools() {
  const { drawingRoi, roi, panels, set, togglePanel } = useMoon();
  return (
    <div
      className="absolute right-3 z-10 flex gap-2 transition-all duration-300"
      style={{ bottom: panels.bottom ? 244 : 16 }}
    >
      <ToolButton
        icon={SquareDashed}
        label={drawingRoi ? "Drag on the map…" : roi ? "New region" : "Select region"}
        active={drawingRoi}
        onClick={() => set({ drawingRoi: !drawingRoi })}
        hint={GLOSSARY.roi}
      />
      <ToolButton icon={BarChart3} label="Statistics" active={panels.bottom} onClick={() => togglePanel("bottom")} hint={GLOSSARY.histogram} />
    </div>
  );
}
