import { useEffect, useRef } from "react";
import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  Credit,
  Ellipsoid,
  EllipsoidTerrainProvider,
  GeographicProjection,
  GeographicTilingScheme,
  Globe,
  ImageryLayer,
  LabelCollection,
  LabelStyle,
  Material,
  Math as CesiumMath,
  NearFarScalar,
  PolylineCollection,
  Rectangle,
  SceneMode,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  UrlTemplateImageryProvider,
  Viewer,
  VerticalOrigin,
  DistanceDisplayCondition,
  Entity,
  CallbackProperty,
  ColorMaterialProperty,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { RASTER_LAYERS, trekTemplate } from "../data/layers";
import { CATALOG_STYLE, useCatalog, useNomenclature, type CatalogId, type Crater } from "../data/catalogs";
import { craterRim, greatCircleKm, normalizeLon } from "../lib/lunar";
import { useMoon } from "../store";

// The whole scene lives on the IAU Moon sphere (R = 1737.4 km), never WGS84.
const MOON = Ellipsoid.MOON;
Ellipsoid.default = MOON;

const trekTiling = () =>
  new GeographicTilingScheme({ ellipsoid: MOON, numberOfLevelZeroTilesX: 2, numberOfLevelZeroTilesY: 1 });

const CATALOG_IDS: CatalogId[] = ["head2010", "povilaitis2018"];

export function MoonViewer() {
  const container = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const layersRef = useRef<Record<string, ImageryLayer>>({});
  const rimsRef = useRef<Partial<Record<CatalogId, PolylineCollection>>>({});
  const labelsRef = useRef<LabelCollection | null>(null);
  const selectionRef = useRef<PolylineCollection | null>(null);
  const roiEntityRef = useRef<Entity | null>(null);

  const head = useCatalog("head2010");
  const pov = useCatalog("povilaitis2018");
  const names = useNomenclature();
  const catalogData: Record<CatalogId, Crater[] | undefined> = {
    head2010: head.data?.craters,
    povilaitis2018: pov.data?.craters,
  };

  const { rasters, catalogs, diameterRange, showNames, viewMode, flyTo, selectedCrater, roi, drawingRoi } =
    useMoon();

  // ---- viewer lifecycle ---------------------------------------------------
  useEffect(() => {
    if (!container.current) return;
    const viewer = new Viewer(container.current, {
      ellipsoid: MOON,
      globe: new Globe(MOON),
      mapProjection: new GeographicProjection(MOON),
      terrainProvider: new EllipsoidTerrainProvider({ ellipsoid: MOON }),
      baseLayer: false,
      animation: false,
      timeline: false,
      geocoder: false,
      homeButton: false,
      baseLayerPicker: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      skyAtmosphere: false,
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
    });
    const { scene } = viewer;
    scene.globe.baseColor = Color.fromCssColorString("#1a1c20");
    scene.globe.showGroundAtmosphere = false;
    scene.globe.enableLighting = false;
    scene.fog.enabled = false;
    // occlude labels/rims on the far side of the Moon
    scene.globe.depthTestAgainstTerrain = true;
    if (scene.moon) scene.moon.show = false; // we're standing on it
    if (scene.sun) scene.sun.show = false;
    scene.backgroundColor = Color.BLACK;
    scene.screenSpaceCameraController.minimumZoomDistance = 2_000;
    scene.screenSpaceCameraController.maximumZoomDistance = 30_000_000;

    for (const def of RASTER_LAYERS) {
      const provider = new UrlTemplateImageryProvider({
        url: trekTemplate(def),
        tilingScheme: trekTiling(),
        maximumLevel: def.maxLevel,
        rectangle: Rectangle.fromDegrees(-180, def.coverage.south, 180, def.coverage.north),
        credit: new Credit(`${def.instrument} — NASA Moon Trek`),
      });
      const layer = viewer.imageryLayers.addImageryProvider(provider);
      layer.show = false;
      layersRef.current[def.id] = layer;
    }

    for (const id of CATALOG_IDS) rimsRef.current[id] = scene.primitives.add(new PolylineCollection());
    selectionRef.current = scene.primitives.add(new PolylineCollection());
    labelsRef.current = scene.primitives.add(new LabelCollection());

    viewer.camera.setView({ destination: Cartesian3.fromDegrees(-15, 10, 7_500_000, MOON) });

    const handler = new ScreenSpaceEventHandler(scene.canvas);
    const toLonLat = (pos: Cartesian2) => {
      const cart = viewer.camera.pickEllipsoid(pos, MOON);
      if (!cart) return null;
      const c = Cartographic.fromCartesian(cart, MOON);
      return { lon: normalizeLon(CesiumMath.toDegrees(c.longitude)), lat: CesiumMath.toDegrees(c.latitude) };
    };

    let roiStart: { lon: number; lat: number } | null = null;
    handler.setInputAction((e: ScreenSpaceEventHandler.MotionEvent) => {
      const p = toLonLat(e.endPosition);
      useMoon.getState().set({ cursor: p });
      if (roiStart && p) {
        useMoon.getState().set({
          roi: {
            west: Math.min(roiStart.lon, p.lon),
            east: Math.max(roiStart.lon, p.lon),
            south: Math.min(roiStart.lat, p.lat),
            north: Math.max(roiStart.lat, p.lat),
          },
        });
        scene.requestRender();
      }
    }, ScreenSpaceEventType.MOUSE_MOVE);

    handler.setInputAction((e: ScreenSpaceEventHandler.PositionedEvent) => {
      if (!useMoon.getState().drawingRoi) return;
      roiStart = toLonLat(e.position);
    }, ScreenSpaceEventType.LEFT_DOWN);

    handler.setInputAction(() => {
      if (roiStart) {
        roiStart = null;
        useMoon.getState().set({ drawingRoi: false });
      }
    }, ScreenSpaceEventType.LEFT_UP);

    handler.setInputAction((e: ScreenSpaceEventHandler.PositionedEvent) => {
      const st = useMoon.getState();
      if (st.drawingRoi) return;
      const p = toLonLat(e.position);
      if (!p) return;
      st.set({ selectedPoint: p, selectedCrater: pickCrater(p), selectedFeature: pickFeature(p) });
    }, ScreenSpaceEventType.LEFT_CLICK);

    viewerRef.current = viewer;
    return () => {
      handler.destroy();
      viewer.destroy();
      viewerRef.current = null;
      layersRef.current = {};
      rimsRef.current = {};
    };
  }, []);

  // Smallest visible catalogued crater whose rim contains the clicked point.
  const pickRef = useRef<{ craters: Crater[]; feats: NonNullable<typeof names.data>["features"] }>({
    craters: [],
    feats: [],
  });
  const pickCrater = (p: { lon: number; lat: number }) => {
    let best: Crater | null = null;
    for (const c of pickRef.current.craters) {
      if (Math.abs(c.lat - p.lat) > c.diameter_km / 50 + 0.1) continue; // cheap prefilter (~30 km/deg)
      const d = greatCircleKm(p.lon, p.lat, c.lon, c.lat);
      if (d <= c.diameter_km / 2 && (!best || c.diameter_km < best.diameter_km)) best = c;
    }
    return best;
  };
  const pickFeature = (p: { lon: number; lat: number }) => {
    let best: (typeof pickRef.current.feats)[number] | null = null;
    for (const f of pickRef.current.feats) {
      if (f.diameter_km <= 0 || Math.abs(f.lat - p.lat) > f.diameter_km / 50 + 0.1) continue;
      if (greatCircleKm(p.lon, p.lat, f.lon, f.lat) <= f.diameter_km / 2 && (!best || f.diameter_km < best.diameter_km))
        best = f;
    }
    return best;
  };

  // ---- imagery layers -----------------------------------------------------
  useEffect(() => {
    for (const [id, st] of Object.entries(rasters)) {
      const layer = layersRef.current[id];
      if (!layer) continue;
      layer.show = st.visible;
      layer.alpha = st.opacity;
    }
    viewerRef.current?.scene.requestRender();
  }, [rasters]);

  // ---- crater rims --------------------------------------------------------
  useEffect(() => {
    const [dmin, dmax] = diameterRange;
    const visible: Crater[] = [];
    for (const id of CATALOG_IDS) {
      const coll = rimsRef.current[id];
      const data = catalogData[id];
      if (!coll) continue;
      coll.removeAll();
      if (!catalogs[id] || !data) continue;
      const material = Material.fromType("Color", {
        color: Color.fromCssColorString(CATALOG_STYLE[id].mapColor).withAlpha(0.85),
      });
      for (const c of data) {
        if (c.diameter_km < dmin || c.diameter_km > dmax) continue;
        visible.push(c);
        const segs = c.diameter_km > 200 ? 128 : c.diameter_km > 30 ? 64 : 32;
        // lift large rims slightly so chords don't dip below the tessellated globe
        const h = Math.min(4000, c.diameter_km * 6);
        const ring = craterRim(c.lon, c.lat, c.diameter_km, segs);
        const heights: number[] = [];
        for (let i = 0; i < ring.length; i += 2) heights.push(ring[i], ring[i + 1], h);
        coll.add({ positions: Cartesian3.fromDegreesArrayHeights(heights, MOON), width: 1.25, material });
      }
    }
    pickRef.current.craters = visible;
    viewerRef.current?.scene.requestRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogs, diameterRange, head.data, pov.data]);

  // ---- IAU names ----------------------------------------------------------
  useEffect(() => {
    const labels = labelsRef.current;
    if (!labels) return;
    labels.removeAll();
    pickRef.current.feats = names.data?.features ?? [];
    if (showNames && names.data) {
      for (const f of names.data.features) {
        // zoom-dependent label density: large features from afar, smaller craters only up close
        const major = ["ME", "OC", "MA"].includes(f.type) || f.diameter_km >= 180;
        const medium = !major && (["SI", "LC"].includes(f.type) || (f.type === "AA" && f.diameter_km >= 50));
        const minor = !major && !medium && f.type === "AA" && f.diameter_km >= 15;
        if (!major && !medium && !minor) continue;
        const far = major ? 14_000_000 : medium ? 2_500_000 : 700_000;
        labels.add({
          position: Cartesian3.fromDegrees(f.lon, f.lat, 3000, MOON),
          text: f.name,
          font: major ? "500 13px 'Space Grotesk', sans-serif" : "400 11px 'Space Grotesk', sans-serif",
          fillColor: Color.fromCssColorString(major ? "#e8edf2" : "#b8c2cc"),
          outlineColor: Color.BLACK.withAlpha(0.85),
          outlineWidth: 3,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.CENTER,
          distanceDisplayCondition: new DistanceDisplayCondition(0, far),
          translucencyByDistance: new NearFarScalar(far * 0.4, 1, far, 0.2),
        });
      }
    }
    viewerRef.current?.scene.requestRender();
  }, [names.data, showNames]);

  // ---- selection highlight ------------------------------------------------
  useEffect(() => {
    const coll = selectionRef.current;
    if (!coll) return;
    coll.removeAll();
    if (selectedCrater) {
      const ring = craterRim(selectedCrater.lon, selectedCrater.lat, selectedCrater.diameter_km, 128);
      const pts: number[] = [];
      for (let i = 0; i < ring.length; i += 2) pts.push(ring[i], ring[i + 1], 5000);
      coll.add({
        positions: Cartesian3.fromDegreesArrayHeights(pts, MOON),
        width: 3,
        material: Material.fromType("PolylineGlow", { color: Color.WHITE, glowPower: 0.25 }),
      });
    }
    viewerRef.current?.scene.requestRender();
  }, [selectedCrater]);

  // ---- ROI rectangle ------------------------------------------------------
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (!roiEntityRef.current) {
      roiEntityRef.current = viewer.entities.add({
        rectangle: {
          coordinates: new CallbackProperty(() => {
            const r = useMoon.getState().roi;
            return r ? Rectangle.fromDegrees(r.west, r.south, r.east, r.north) : Rectangle.fromDegrees(0, 0, 0, 0);
          }, false),
          material: new ColorMaterialProperty(Color.fromCssColorString("#38e1ff").withAlpha(0.12)),
          outline: false,
          height: 0,
        },
        show: false,
      });
    }
    roiEntityRef.current.show = !!roi;
    viewer.scene.screenSpaceCameraController.enableInputs = !drawingRoi;
    viewer.scene.requestRender();
  }, [roi, drawingRoi]);

  // ---- 2D / 3D ------------------------------------------------------------
  useEffect(() => {
    const scene = viewerRef.current?.scene;
    if (!scene) return;
    if (viewMode === "2d" && scene.mode !== SceneMode.SCENE2D) scene.morphTo2D(1.2);
    if (viewMode === "3d" && scene.mode !== SceneMode.SCENE3D) scene.morphTo3D(1.2);
  }, [viewMode]);

  // ---- fly to -------------------------------------------------------------
  useEffect(() => {
    if (!flyTo || !viewerRef.current) return;
    viewerRef.current.camera.flyTo({
      destination: Cartesian3.fromDegrees(flyTo.lon, flyTo.lat, flyTo.heightKm * 1000, MOON),
      duration: 2.2,
    });
  }, [flyTo]);

  return <div ref={container} className="absolute inset-0 moon-viewer" />;
}
