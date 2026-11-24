import { useMoon } from "../store";
import { formatLat, formatLon } from "../lib/lunar";

/** Live cursor readout + mini scale note, floating over the map. */
export function MapHud() {
  const { cursor, panels } = useMoon();
  return (
    <div
      className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 transition-all duration-300"
      style={{ bottom: panels.bottom ? 244 : 20 }}
    >
      <div className="glass num flex items-center gap-3 rounded-full px-3.5 py-1 text-[11px] text-regolith-200">
        <span className="h-1.5 w-1.5 rounded-full bg-signal shadow-[0_0_8px_#38e1ff]" />
        {cursor ? (
          <>
            <span>{formatLat(cursor.lat, 3)}</span>
            <span className="text-regolith-600">|</span>
            <span>{formatLon(cursor.lon, 3)}</span>
          </>
        ) : (
          <span className="text-regolith-400">Moon · IAU sphere R 1737.4 km</span>
        )}
      </div>
    </div>
  );
}
