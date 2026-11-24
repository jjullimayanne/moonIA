"""Registry of verified real data sources (checked 2026-11-24, see docs/scientific/01-data-sources.md)."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class CatalogSource:
    id: str
    name: str
    url: str
    license: str
    citation: str
    description: str
    diameter_range_km: tuple[float, float] | None
    lat_coverage: tuple[float, float]
    notes: list[str] = field(default_factory=list)


DEEPMOON_RAW = "https://raw.githubusercontent.com/silburt/DeepMoon/master/catalogues"

CATALOGS: dict[str, CatalogSource] = {
    "head2010": CatalogSource(
        id="head2010",
        name="Head et al. (2010) — LOLA craters ≥ 20 km",
        url=f"{DEEPMOON_RAW}/HeadCraters.csv",
        license="MIT (DeepMoon repository redistribution); original catalog: Head et al. 2010",
        citation="Head, J. W. et al. (2010). Global distribution of large lunar craters. Science 329, 1504–1507. doi:10.1126/science.1195050",
        description="Global catalog of 5 185 craters with D ≥ 20 km mapped on LOLA topography. Ground truth used by DeepMoon.",
        diameter_range_km=(20.0, 2050.0),
        lat_coverage=(-90.0, 90.0),
    ),
    "povilaitis2018": CatalogSource(
        id="povilaitis2018",
        name="Povilaitis et al. (2018) — LROC craters 5–20 km",
        url=f"{DEEPMOON_RAW}/LROCCraters.csv",
        license="MIT (DeepMoon repository redistribution); original catalog: Povilaitis et al. 2018",
        citation="Povilaitis, R. Z. et al. (2018). Crater density differences: Exploring regional resurfacing, secondary crater populations, and crater saturation equilibrium on the Moon. PSS 162, 41–51. doi:10.1016/j.pss.2017.05.006",
        description="19 335 craters 5–20 km within ±60° latitude mapped on LROC WAC. Ground truth used by DeepMoon.",
        diameter_range_km=(5.0, 20.0),
        lat_coverage=(-60.0, 60.0),
    ),
    "iau": CatalogSource(
        id="iau",
        name="IAU Gazetteer of Planetary Nomenclature — Moon",
        url="https://planetarynames.wr.usgs.gov/shapefiles/MOON_nomenclature_center_pts.zip",
        license="Public domain (USGS / IAU WGPSN)",
        citation="Gazetteer of Planetary Nomenclature. IAU WGPSN / USGS Astrogeology Science Center. https://planetarynames.wr.usgs.gov",
        description="Official named lunar features (craters, maria, montes, ...). Used for name search and labels.",
        diameter_range_km=None,
        lat_coverage=(-90.0, 90.0),
        notes=["Longitudes delivered as 0–360° E; normalized to [-180, 180)."],
    ),
}
