import { describe, expect, it } from "vitest";
import { bboxAreaKm2, craterRim, greatCircleKm, inBBox, MOON_RADIUS_KM, normalizeLon, parseCoordinates } from "./lunar";
import { cumulativeSfd, histogram, median, sqrt2Bins } from "./stats";

describe("lunar geodesy", () => {
  it("normalizes longitudes to [-180, 180)", () => {
    expect([0, 180, 270, 359.5, -190].map(normalizeLon)).toEqual([0, -180, -90, -0.5, 170]);
  });

  it("computes great-circle distance on the 1737.4 km sphere", () => {
    expect(greatCircleKm(0, 0, 0, 90)).toBeCloseTo((Math.PI * MOON_RADIUS_KM) / 2, 6);
    expect(greatCircleKm(179.5, 0, -179.5, 0)).toBeCloseTo((Math.PI / 180) * MOON_RADIUS_KM, 6);
  });

  it("gives the full sphere area and handles antimeridian boxes", () => {
    expect(bboxAreaKm2({ west: -180, south: -90, east: 180, north: 90 })).toBeCloseTo(4 * Math.PI * MOON_RADIUS_KM ** 2, 0);
    expect(bboxAreaKm2({ west: 170, south: -10, east: -170, north: 10 })).toBeCloseTo(
      bboxAreaKm2({ west: -10, south: -10, east: 10, north: 10 }),
      6,
    );
    expect(inBBox(-175, 0, { west: 170, south: -5, east: -170, north: 5 })).toBe(true);
  });

  it("places every crater-rim vertex at exactly D/2 from the centre", () => {
    const rim = craterRim(-20.08, 9.62, 93, 36);
    for (let i = 0; i < rim.length; i += 2) expect(greatCircleKm(-20.08, 9.62, rim[i], rim[i + 1])).toBeCloseTo(46.5, 6);
  });

  it("parses coordinates in several notations", () => {
    expect(parseCoordinates("9.62, -20.08")).toEqual({ lat: 9.62, lon: -20.08 });
    expect(parseCoordinates("9.62N 20.08W")).toEqual({ lat: 9.62, lon: -20.08 });
    expect(parseCoordinates("-43.3 348.8")?.lon).toBeCloseTo(-11.2, 6);
    expect(parseCoordinates("Copernicus")).toBeNull();
    expect(parseCoordinates("95, 10")).toBeNull();
  });
});

describe("crater statistics", () => {
  it("builds contiguous √2 bins", () => {
    const b = sqrt2Bins(5, 100);
    expect(b[0][0]).toBeLessThanOrEqual(5);
    for (let i = 1; i < b.length; i++) expect(b[i][0]).toBeCloseTo(b[i - 1][1], 9);
  });

  it("counts each crater exactly once", () => {
    const d = [5.1, 6, 8, 12, 25, 40, 300];
    const h = histogram({ a: d }, 4, 1500);
    expect(h.reduce((s, b) => s + (b.a as number), 0)).toBe(d.length);
  });

  it("computes cumulative densities and medians", () => {
    expect(cumulativeSfd([5, 10, 20], 100, [5, 10, 21])).toEqual([
      { d: 5, n: 0.03 },
      { d: 10, n: 0.02 },
      { d: 21, n: 0 },
    ]);
    expect(median([3, 1, 2, 10])).toBe(2.5);
  });
});
