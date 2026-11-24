import { create } from "zustand";
import type { CatalogId, Crater, NamedFeature } from "./data/catalogs";
import type { BBox } from "./lib/lunar";

export type ViewMode = "3d" | "2d";

interface LayerState {
  visible: boolean;
  opacity: number;
}

interface MoonState {
  viewMode: ViewMode;
  rasters: Record<string, LayerState>;
  catalogs: Record<CatalogId, boolean>;
  showNames: boolean;
  diameterRange: [number, number];
  cursor: { lon: number; lat: number } | null;
  selectedPoint: { lon: number; lat: number } | null;
  selectedCrater: Crater | null;
  selectedFeature: NamedFeature | null;
  roi: BBox | null;
  drawingRoi: boolean;
  flyTo: { lon: number; lat: number; heightKm: number; nonce: number } | null;
  panels: { left: boolean; right: boolean; bottom: boolean };

  set: (p: Partial<MoonState>) => void;
  setRaster: (id: string, p: Partial<LayerState>) => void;
  toggleCatalog: (id: CatalogId) => void;
  togglePanel: (p: keyof MoonState["panels"]) => void;
  requestFlyTo: (lon: number, lat: number, heightKm?: number) => void;
}

export const useMoon = create<MoonState>((set) => ({
  viewMode: "3d",
  rasters: {
    wac: { visible: true, opacity: 1 },
    "lola-clrshade": { visible: false, opacity: 0.7 },
    "lolakaguya-clrhillshade": { visible: false, opacity: 0.75 },
    "lolakaguya-hillshade": { visible: false, opacity: 0.6 },
    "lolakaguya-slope": { visible: false, opacity: 0.75 },
    "lola-slope-global": { visible: false, opacity: 0.75 },
  },
  catalogs: { head2010: true, povilaitis2018: false },
  showNames: true,
  diameterRange: [5, 2100],
  cursor: null,
  selectedPoint: null,
  selectedCrater: null,
  selectedFeature: null,
  roi: null,
  drawingRoi: false,
  flyTo: null,
  panels: { left: true, right: true, bottom: true },

  set: (p) => set(p),
  setRaster: (id, p) => set((s) => ({ rasters: { ...s.rasters, [id]: { ...s.rasters[id], ...p } } })),
  toggleCatalog: (id) => set((s) => ({ catalogs: { ...s.catalogs, [id]: !s.catalogs[id] } })),
  togglePanel: (p) => set((s) => ({ panels: { ...s.panels, [p]: !s.panels[p] } })),
  requestFlyTo: (lon, lat, heightKm = 600) => set({ flyTo: { lon, lat, heightKm, nonce: Date.now() } }),
}));
