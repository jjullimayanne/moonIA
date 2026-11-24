"""AWS Lambda entry point (API Gateway HTTP API → Mangum → FastAPI)."""

from mangum import Mangum

from app.api.main import app

handler = Mangum(app, lifespan="off")
