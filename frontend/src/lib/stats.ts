/** Crater statistics used by the science panel. */

export interface Bin {
  label: string;
  lo: number;
  hi: number;
  [series: string]: number | string;
}

/**
 * Log-spaced (√2) diameter bins, the standard binning for crater
 * size-frequency distributions (Crater Analysis Techniques Working Group, 1979).
 */
export function sqrt2Bins(minKm: number, maxKm: number): Array<[number, number]> {
  const bins: Array<[number, number]> = [];
  let lo = Math.SQRT2 ** Math.floor(Math.log(minKm) / Math.log(Math.SQRT2) + 1e-9);
  while (lo < maxKm) {
    const hi = lo * Math.SQRT2;
    bins.push([lo, hi]);
    lo = hi;
  }
  return bins;
}

export function histogram(series: Record<string, number[]>, minKm = 5, maxKm = 512): Bin[] {
  const bins = sqrt2Bins(minKm, maxKm);
  return bins.map(([lo, hi]) => {
    const row: Bin = { label: lo < 10 ? lo.toFixed(1) : lo.toFixed(0), lo, hi };
    for (const [name, diams] of Object.entries(series)) {
      let n = 0;
      for (const d of diams) if (d >= lo && d < hi) n++;
      row[name] = n;
    }
    return row;
  });
}

/** Cumulative size-frequency distribution N(≥D) per km² at the given diameters. */
export function cumulativeSfd(diams: number[], areaKm2: number, at: number[]): Array<{ d: number; n: number }> {
  const sorted = [...diams].sort((a, b) => a - b);
  return at.map((d) => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < d) lo = mid + 1;
      else hi = mid;
    }
    return { d, n: areaKm2 > 0 ? (sorted.length - lo) / areaKm2 : 0 };
  });
}

export function median(values: number[]): number {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
