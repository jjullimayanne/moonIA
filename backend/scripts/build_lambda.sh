#!/usr/bin/env bash
# Build the Lambda deployment zip for arm64 (Graviton), Python 3.12.
# Output: backend/dist/lambda.zip  (code + deps + normalized catalogs)
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf build dist && mkdir -p build dist
uv export --no-default-groups --no-hashes --frozen --no-emit-project -q -o build/requirements.txt
uv pip install --quiet --target build/pkg --python-platform aarch64-manylinux_2_28 \
  --python-version 3.12 --only-binary=:all: -r build/requirements.txt
# trim weight that Lambda never uses
find build/pkg -type d \( -name "__pycache__" -o -name "tests" -o -name "test" \) -prune -exec rm -rf {} +
rm -rf build/pkg/uvicorn* build/pkg/uvloop* build/pkg/watchfiles* build/pkg/websockets*
cp -r app build/pkg/app
mkdir -p build/pkg/data/catalogs && cp ../data/catalogs/*.csv build/pkg/data/catalogs/
(cd build/pkg && zip -q -r -9 ../../dist/lambda.zip .)
echo "unzipped: $(du -sh build/pkg | cut -f1)  zip: $(du -h dist/lambda.zip | cut -f1)"
