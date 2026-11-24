FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.12 /uv /usr/local/bin/uv
WORKDIR /srv/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-default-groups --group dev
COPY backend/app ./app
COPY data/catalogs /srv/data/catalogs
ENV MOONAI_DATA_DIR=/srv/data PATH="/srv/backend/.venv/bin:$PATH"
EXPOSE 8000
CMD ["uvicorn", "app.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
