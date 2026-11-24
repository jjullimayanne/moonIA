import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

const WIDTH = 260;

/**
 * Hover/focus info icon. The tip is portalled to <body> with fixed positioning so
 * scrollable side panels never clip it.
 */
export function InfoTip({ text, size = 12 }: { text: string; size?: number }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - WIDTH / 2), window.innerWidth - WIDTH - 8);
    const above = r.bottom + 160 > window.innerHeight;
    setPos({ left, top: above ? r.top - 8 : r.bottom + 8, above });
  };

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={text}
        onMouseEnter={show}
        onMouseLeave={() => setPos(null)}
        onFocus={show}
        onBlur={() => setPos(null)}
        className="inline-flex shrink-0 cursor-help items-center text-regolith-600 transition hover:text-signal focus:text-signal focus:outline-none"
      >
        <Info size={size} />
      </button>
      {pos &&
        createPortal(
          <div
            role="tooltip"
            className="glass animate-in pointer-events-none fixed z-50 rounded-lg px-3 py-2 text-[11.5px] leading-relaxed font-normal tracking-normal text-regolith-200 normal-case"
            style={{ left: pos.left, top: pos.top, width: WIDTH, transform: pos.above ? "translateY(-100%)" : undefined }}
          >
            {text}
          </div>,
          document.body,
        )}
    </>
  );
}
