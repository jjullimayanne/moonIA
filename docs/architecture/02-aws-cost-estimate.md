# 02 · AWS cost estimate (budget: US$ 5/month, target < US$ 3)

**Prices were validated on 2026‑11‑24** through the AWS Price List API (`aws pricing get-products`, region `us-east-1`, on-demand). Re-check before provisioning with `make cost-check`.

| Service | Unit price (us-east-1) |
|---|---|
| Lambda arm64 requests | $0.20 per 1M |
| Lambda arm64 duration | $0.0000133334 per GB-s (first 7.5B GB-s) |
| API Gateway HTTP API | $1.00 per 1M requests |
| CloudFront data transfer out (NA/EU) | $0.085 per GB (first 10 TB) |
| CloudFront HTTPS requests (US) | $0.0100 per 10k |
| S3 Standard storage | $0.023 per GB-month |
| S3 GET / PUT | $0.0004 per 1k / $0.005 per 1k |
| CloudWatch Logs ingestion / storage | $0.50 per GB / $0.03 per GB-month |
| AWS Budgets (cost budget with alerts) | $0 |

**Free tiers are deliberately ignored in the totals below** (per the requirement not to depend on promotional credits). The AWS "always free" allowances for Lambda (1M requests + 400k GB-s), CloudFront (1 TB + 10M requests) and CloudWatch would make every scenario below ≈ $0, but they can change.

## What generates cost (and what doesn't)

* **Imagery tiles: $0.** The browser fetches them directly from NASA Trek, never through AWS.
* **The DEM: $0 storage.** It's read by range requests from USGS, and inbound transfer to Lambda is free.
* **Frontend payload.** About 3.5 MB per first visit (JS 1.34 MB gzip, Cesium workers/assets, catalogs ~0.3 MB gzip), then browser-cached (hashed assets are immutable).
* **Terrain queries.** About 3 s × 1 GB per uncached point. Responses are edge-cached for 30 days since the DEM never changes.

## Scenarios

| Monthly usage | Bootcamp demo | Active project | Stress (cap) |
|---|---|---|---|
| Visits (first-time) | 500 | 5 000 | 20 000 |
| CloudFront GB out | 1.8 GB → $0.15 | 18 GB → $1.53 | 70 GB → $5.95 |
| CloudFront requests (~150/visit) | 75k → $0.08 | 750k → $0.75 | 3M → $3.00 |
| API calls (terrain + health) | 5k → $0.005 | 50k → $0.05 | throttled at 5 rps |
| Lambda GB-s (3 s × 1 GB per uncached call) | 6k → $0.08 | 60k → $0.80 | capped by concurrency 2 |
| S3 storage (site 15 MB + models/predictions ≤ 1 GB) | $0.03 | $0.03 | $0.46 (20 GB cap) |
| S3 requests | ~$0.01 | ~$0.05 | ~$0.10 |
| CloudWatch Logs (7-day retention) | ~$0.01 | ~$0.05 | ~$0.25 |
| **Total (no free tier)** | **≈ $0.37** | **≈ $3.26** | **> $5 → budget alarms** |
| **Total (with always-free tier)** | ≈ $0 | ≈ $0 | ≈ $0–1 |

## Guardrails implemented (`infrastructure/terraform`)

* No EC2, RDS, NAT Gateway, ALB, Kubernetes or SageMaker, and **nothing billed per hour**.
* Region `us-east-1`, free `*.cloudfront.net` domain, `PriceClass_100`.
* HTTP API throttling: 5 rps steady, burst 10. Lambda reserved concurrency: **disabled by default** because this account's Lambda concurrency quota is 10, and AWS rejects reservations that leave fewer than 10 unreserved. The API throttle is the effective cap. Request a free quota increase, then set `lambda_reserved_concurrency = 2`.
* Logs retained 7 days; no API access logs.
* Aggressive caching: hashed assets 1 year immutable, Cesium/catalogs 7 days, `index.html` no-cache, published model versions immutable, `latest.json` **1 h** (models update at most daily; the frontend reads it once per page load, no polling), DEM samples 30 days.
* S3 lifecycle: artifacts expire after 30 days and incomplete uploads are aborted. The publisher keeps at most *N* model versions.
* A CloudWatch alarm fires when the data bucket exceeds **20 GB**.
* AWS Budgets: alerts at **$1 / $3 / $5** actual plus a forecast > $5.

## ⚠ Known risk

**AWS Budgets is an alert, not a hard stop.** Billing data lags by up to ~24 h, and nothing is shut down automatically. The real caps are the throttles, the concurrency limit, the absence of always-on compute, and the storage alarm. A malicious traffic flood on CloudFront could still exceed $5 before you react. Mitigations, in order: lower the throttles, disable the distribution, or add AWS WAF rate-based rules (WAF costs ≈ $5+/month, so it's deliberately left out).
