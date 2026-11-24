import { create } from "zustand";
import type { CatalogId, Crater, NamedFeature } from "./data/catalogs";
import type { BBox } from "./lib/lunar";

export type ViewMode = "3d" | "2d";

/** Top-level modules. Explorer is the map; the others are full-screen lab views. */
export const PAGES = [
  { id: "explorer", label: "Explorer" },
  { id: "training", label: "Training Studio" },
  { id: "pipeline", label: "Pipeline" },
  { id: "registry", label: "Experiments" },
] as const;
export type Page = (typeof PAGES)[number]["id"];

const pageFromHash = (): Page => {
  const h = typeof location !== "undefined" ? location.hash.replace("#/", "") : "";
  return (PAGES.find((p) => p.id === h)?.id ?? "explorer") as Page;
};

interface LayerState {
  visible: boolean;
  opacity: number;
}

interface MoonState {
  page: Page;
  setPage: (p: Page) => void;
  viewMode: ViewMode;
  rasters: Record<string, LayerState>;
  catalogs: Record<CatalogId, boolean>;
  showNames: boolean;
  showDetections: boolean;
  discoveryOnly: boolean;
  selectedDetection: import("./data/detections").Detection | null;
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
  page: pageFromHash(),
  setPage: (page) => {
    history.replaceState(null, "", page === "explorer" ? location.pathname : `#/${page}`);
    set({ page });
  },
  viewMode: "3d",
  rasters: {
    imagery: { visible: true, opacity: 1 },
    elevation: { visible: false, opacity: 0.7 },
    slope: { visible: false, opacity: 0.7 },
    shading: { visible: false, opacity: 0.5 },
  },
  catalogs: { head2010: true, povilaitis2018: false },
  showNames: true,
  showDetections: true,
  discoveryOnly: false,
  selectedDetection: null,
  diameterRange: [5, 2100],
  cursor: null,
  selectedPoint: null,
  selectedCrater: null,
  selectedFeature: null,
  roi: null,
  drawingRoi: false,
  flyTo: null,
  panels: { left: true, right: true, bottom: false },

  set: (p) => set(p),
  setRaster: (id, p) => set((s) => ({ rasters: { ...s.rasters, [id]: { ...s.rasters[id], ...p } } })),
  toggleCatalog: (id) => set((s) => ({ catalogs: { ...s.catalogs, [id]: !s.catalogs[id] } })),
  togglePanel: (p) => set((s) => ({ panels: { ...s.panels, [p]: !s.panels[p] } })),
  requestFlyTo: (lon, lat, heightKm = 600) => set({ flyTo: { lon, lat, heightKm, nonce: Date.now() } }),
}));
