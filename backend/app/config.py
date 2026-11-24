from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MOONAI_", env_file=".env", extra="ignore")

    data_dir: Path = REPO_ROOT / "data"
    frontend_data_dir: Path = REPO_ROOT / "frontend" / "public" / "data"
    # LOLA + Kaguya TC merged DEM, 512 ppd (~59 m/px), ±60° lat, int16 with scale 0.5 m.
    # Read remotely by window through GDAL /vsicurl/ (HTTP range requests); can be
    # pointed to a local copy for speed.
    dem_url: str = (
        "/vsicurl/https://planetarymaps.usgs.gov/mosaic/LolaKaguya_Topo/"
        "Lunar_LRO_LOLAKaguya_DEMmerge_60N60S_512ppd.tif"
    )
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:8080",
        "https://jjullimayanne.github.io",
    ]


settings = Settings()
