/** Plain-language explanations shown by the ⓘ hover tips. */
export const GLOSSARY = {
  imagery:
    "Photographic basemap of the lunar surface. The LROC Wide Angle Camera (on NASA's Lunar Reconnaissance Orbiter) imaged the whole Moon; this mosaic combines thousands of frames at ~100 m per pixel. It shows brightness (albedo and shading), not height.",
  elevation:
    "Topography: how high or low the ground is. Derived from LOLA, a laser altimeter on LRO that measured billions of heights, merged with stereo models from the Japanese Kaguya Terrain Camera. Heights are relative to a 1737.4 km reference sphere. Colors go from low (blue/purple) to high (red/white); hillshade adds artificial sunlight to reveal relief.",
  slope:
    "Steepness of the terrain in degrees, computed from the elevation model. Flat mare plains are blue; crater walls and mountains are yellow to red. Slope is key for understanding crater morphology and for picking regions worth studying in more detail.",
  catalogued:
    "Craters mapped by planetary scientists (human-made reference catalogs). Head et al. 2010: 5,185 craters ≥ 20 km across the whole Moon. Povilaitis et al. 2018: 19,335 craters from 5 to 20 km within ±60° latitude. Together they are the ground truth used by DeepMoon to train and evaluate the neural network.",
  detected:
    "Craters found automatically by our deep-learning model (a U-Net that segments crater rims in elevation data, following DeepMoon). This layer stays empty until a model is trained and evaluated. Nothing here is simulated.",
  filters:
    "Show only craters within a diameter range. The scale is logarithmic because crater sizes span three orders of magnitude (1 km to >2000 km). Each catalog is only complete within its own size range.",
  labels: "Official names of lunar features approved by the International Astronomical Union (IAU): craters, maria (seas), mountains, valleys and landing sites.",
  location:
    "Coordinates of the clicked point. Latitude is planetocentric (angle from the equator); longitude is measured eastward from the lunar prime meridian (the mean sub-Earth point). Reference: IAU Moon sphere, R = 1737.4 km.",
  terrain:
    "Values read from the real LOLA–Kaguya elevation model (59 m per pixel) at the clicked point. Elevation is relative to the 1737.4 km sphere; slope is computed with Horn's method over a 3×3 pixel window. Requires the backend API.",
  crater:
    "Catalog record of the smallest catalogued crater whose rim contains the clicked point: its diameter, center and source. Prediction confidence will appear when the AI model is available.",
  roi: "Region of interest: a rectangle you draw on the map. MoonAI counts the craters inside, computes the true area on the lunar sphere and crater density, and lets you export the result as GeoJSON or CSV.",
  analysis: "Tools to select an area of the Moon for analysis. Draw a rectangle by dragging on the map.",
  count: "Number of craters currently shown (active catalogs + diameter filter), for the whole Moon or for the selected region.",
  median: "Middle value of the crater diameters shown: half are smaller, half are larger.",
  density: "Craters per million km². Older surfaces have accumulated more impacts, so crater density is a classic proxy for relative surface age.",
  histogram:
    "How many craters fall in each size class. Bins grow by a factor of √2 — the standard binning in crater science — so small and large craters can be compared on one chart.",
  sfd: "Cumulative size-frequency distribution: N(≥D) is the number of craters per km² with diameter at least D. Plotted on log-log axes, its shape and level are used to date planetary surfaces. Each catalog is only plotted inside the size range it was compiled for.",
  inference:
    "Scientific evaluation of the AI crater detector against the reference catalogs: precision (how many detections are real), recall (how many real craters are found), F1, location and diameter errors, and speed. Filled in after training (Phase 4).",
  mode: "3D shows the Moon as a globe. 2D shows the same data in a flat equirectangular (lat/lon) map — the native projection of the source datasets.",
  search: "Type a feature name (e.g. Copernicus, Tycho, Mare Imbrium) or coordinates as 'lat, lon' (e.g. 9.62, -20.08 or 9.62N 20.08W).",
  api: "Status of the MoonAI backend (Python/FastAPI). It reads the elevation model for terrain values. The map, imagery and catalogs work without it.",
  model: "Status of the deep-learning crater detector. It will be marked ready only after it has been trained and scientifically evaluated.",
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
