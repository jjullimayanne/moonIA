# MoonAI — one-command local ML pipeline. Training runs natively (MPS on Apple Silicon).
#   make pipeline PROFILE=development            # train + evaluate + publish to the local site
#   make pipeline PROFILE=production PUBLISH=true  # also push approved artifacts to S3
PROFILE ?= development
SYNC    ?= local
PUBLISH ?= false
ML      := cd ml && MLFLOW_DISABLE_AGENT_HINT=1 uv run python -m moonai_ml
PUBFLAG := $(if $(filter true,$(PUBLISH)),--publish,)

.PHONY: progress setup download preprocess train evaluate export predict publish pipeline resume status dry-run dashboard rollback cost-check test catalogs

setup:            ## install backend, ML and frontend dependencies
	cd backend && uv sync
	cd ml && uv sync
	cd frontend && npm install

catalogs:         ## download + normalize crater catalogs (Head 2010, Povilaitis 2018, IAU)
	cd backend && uv run python -m app.ingestion.catalogs

pipeline:         ## all stages, idempotent; publishing to S3 only with PUBLISH=true
	$(ML) pipeline --profile $(PROFILE) --sync $(SYNC) $(PUBFLAG)

download preprocess train evaluate export predict publish: ## stages run inside the idempotent pipeline (finished stages are skipped)
	$(ML) pipeline --profile $(PROFILE) --sync $(SYNC) --resume $(PUBFLAG)

resume:           ## continue the latest unfinished run of PROFILE
	$(ML) pipeline --profile $(PROFILE) --sync $(SYNC) --resume $(PUBFLAG)

dry-run:          ## show what would run, sizes and hardware, without doing it
	$(ML) pipeline --profile $(PROFILE) --dry-run

status:           ## active model + recent runs
	$(ML) status

rollback:         ## make VERSION the active model again: make rollback VERSION=v1
	$(ML) rollback $(VERSION)

dashboard:        ## local monitoring dashboard (Streamlit, no hosting cost)
	cd ml && uv run --group dashboard streamlit run ../dashboard/app.py

cost-check:       ## re-validate current AWS prices (read-only Price List API)
	./scripts/cost_check.sh

test:             ## all test suites
	cd backend && uv run pytest -q
	cd ml && uv run pytest -q
	cd frontend && npm test

progress:         ## live overall progress bar of the running pipeline
	python3 scripts/progress.py --watch
