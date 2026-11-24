/**
 * Raster layers served by NASA Moon Trek WMTS (verified 2026-11-24).
 * All are in EPSG:104903 (GCS_Moon_2000, sphere R=1737.4 km), equirectangular,
 * 2×1 tiles at level 0 with top-left corner (-180°, 90°) — exactly Cesium's
 * GeographicTilingScheme on Ellipsoid.MOON. See docs/scientific/01-data-sources.md.
 */

export type LayerGroup = "imagery" | "elevation" | "slope";
/** User-facing layer: each may stack a global product under a high-res ±60° one. */
export type UiLayer = "imagery" | "elevation" | "slope" | "shading";

export interface RasterLayerDef {
  id: string;
  trekId: string;
  label: string;
  group: LayerGroup;
  ui: UiLayer;
  ext: "jpg" | "png";
  maxLevel: number;
  coverage: { south: number; north: number };
  resolution: string;
  instrument: string;
  description: string;
  legend?: { from: string; to: string; gradient: string; note: string };
}

const TREK = "https://trek.nasa.gov/tiles/Moon/EQ";

export const trekTemplate = (l: RasterLayerDef) =>
  `${TREK}/${l.trekId}/1.0.0/default/default028mm/{z}/{y}/{x}.${l.ext}`;

const ELEVATION_RAMP =
  "linear-gradient(90deg,#3b1f78,#2c5bd0,#25a9c9,#43c46a,#e5d43c,#e07a2c,#c22f2f,#f4f4f4)";

export const RASTER_LAYERS: RasterLayerDef[] = [
  {
    id: "wac",
    trekId: "LRO_WAC_Mosaic_Global_303ppd_v02",
    ui: "imagery",
    label: "LROC WAC global mosaic",
    group: "imagery",
    ext: "jpg",
    maxLevel: 8,
    coverage: { south: -90, north: 90 },
    resolution: "303 px/deg · ~100 m/px",
    instrument: "LRO Wide Angle Camera",
    description: "Grayscale photo mosaic of the entire Moon, the default basemap.",
  },
  {
    id: "lola-clrshade",
    trekId: "LRO_LOLA_ClrShade_Global_128ppd_v04",
    ui: "elevation",
    label: "LOLA color shaded relief (global)",
    group: "elevation",
    ext: "png",
    maxLevel: 5,
    coverage: { south: -90, north: 90 },
    resolution: "128 px/deg · ~237 m/px",
    instrument: "LRO LOLA altimeter (DEM v4)",
    description: "Global elevation colored from low to high with shaded relief. Covers the poles.",
    legend: {
      from: "low",
      to: "high",
      gradient: ELEVATION_RAMP,
      note: "Qualitative ramp — Trek does not publish the numeric scale. Click the map for exact DEM elevation (backend).",
    },
  },
  {
    id: "lolakaguya-clrhillshade",
    trekId: "LRO_LOLAKaguya_ClrHillshade_60N60S_512ppd",
    ui: "elevation",
    label: "LOLA + Kaguya color hillshade",
    group: "elevation",
    ext: "png",
    maxLevel: 10,
    coverage: { south: -60, north: 60 },
    resolution: "512 px/deg · ~59 m/px",
    instrument: "LOLA + SELENE Terrain Camera",
    description: "Highest-resolution elevation colors with relief shading — the same DEM used by DeepMoon and by the terrain readout.",
    legend: {
      from: "low",
      to: "high",
      gradient: ELEVATION_RAMP,
      note: "Qualitative ramp. Same DEM the backend samples for elevation (Barker et al. 2016).",
    },
  },
  {
    id: "lolakaguya-hillshade",
    trekId: "LRO_LOLAKaguya_Hillshade_60N60S_512ppd",
    ui: "shading",
    label: "LOLA + Kaguya hillshade",
    group: "elevation",
    ext: "png",
    maxLevel: 10,
    coverage: { south: -60, north: 60 },
    resolution: "512 px/deg · ~59 m/px",
    instrument: "LOLA + SELENE Terrain Camera",
    description: "Grayscale shaded relief: elevation lit by an artificial sun, which makes crater rims and ridges pop out.",
  },
  {
    id: "lola-slope-global",
    trekId: "LRO_LOLA_ClrSlope_Global_16ppd",
    ui: "slope",
    label: "Slope · LOLA global (poles)",
    group: "slope",
    ext: "png",
    maxLevel: 2,
    coverage: { south: -90, north: 90 },
    resolution: "16 px/deg · ~1.9 km/px",
    instrument: "LRO LOLA bidirectional slope",
    description: "Coarser slope map computed directly along LOLA laser tracks; use it for the polar regions beyond ±60°.",
    legend: {
      from: "flat",
      to: "steep",
      gradient: "linear-gradient(90deg,#1b3a8a,#1fa5c9,#5ccf5a,#f0dc3a,#ef7d2a,#d22e2e)",
      note: "Qualitative ramp. Baseline 30–120 m along LOLA tracks.",
    },
  },
  {
    id: "lolakaguya-slope",
    trekId: "LRO_LOLAKaguya_ClrSlope_60N60S_512ppd",
    ui: "slope",
    label: "Slope · LOLA + Kaguya",
    group: "slope",
    ext: "png",
    maxLevel: 10,
    coverage: { south: -60, north: 60 },
    resolution: "512 px/deg · ~59 m/px",
    instrument: "Derived from LOLA + Kaguya DEM",
    description: "Terrain steepness computed from the 59 m elevation model.",
    legend: {
      from: "flat",
      to: "steep",
      gradient: "linear-gradient(90deg,#1b3a8a,#1fa5c9,#5ccf5a,#f0dc3a,#ef7d2a,#d22e2e)",
      note: "Qualitative ramp. Exact slope (Horn, 3×3) is computed by the backend at the clicked point.",
    },
  },
];

export const UI_LAYERS: Array<{ id: UiLayer; label: string; info: string; legend?: RasterLayerDef["legend"] }> = [
  {
    id: "imagery",
    label: "Surface imagery",
    info: "Photo mosaic of the whole Moon from the LRO Wide Angle Camera (~100 m/px). Shows brightness, not height.",
  },
  {
    id: "elevation",
    label: "Elevation",
    info: "Terrain height from the LOLA laser altimeter + Kaguya stereo: 59 m/px within ±60° latitude, 237 m/px global LOLA toward the poles. Blue = low, red/white = high.",
    legend: RASTER_LAYERS.find((l) => l.id === "lolakaguya-clrhillshade")!.legend,
  },
  {
    id: "slope",
    label: "Slope",
    info: "Terrain steepness from the same elevation model: 59 m/px within ±60°, 1.9 km/px LOLA slope toward the poles. Blue = flat, red = steep.",
    legend: RASTER_LAYERS.find((l) => l.id === "lolakaguya-slope")!.legend,
  },
  {
    id: "shading",
    label: "Relief shading",
    info: "Grayscale hillshade (59 m/px, ±60°): the terrain lit by an artificial sun so rims and ridges stand out. Combine with imagery or elevation.",
  },
];
