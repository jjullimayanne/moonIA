variable "region" {
  description = "AWS region. us-east-1 is required: CloudFront, Budgets and ACM live there and prices are lowest."
  type        = string
  default     = "us-east-1"
}

variable "project" {
  type    = string
  default = "moonai"
}

variable "github_repository" {
  description = "owner/repo allowed to deploy through GitHub Actions OIDC."
  type        = string
  default     = "jjullimayanne/moonIA"
}

variable "budget_email" {
  description = "Email that receives AWS Budgets alerts (US$ 1 / 3 / 5) and the storage alarm."
  type        = string
}

variable "monthly_budget_usd" {
  type    = number
  default = 5
}

variable "lambda_memory_mb" {
  description = "1024 MB gives enough CPU for GDAL range reads; cost ≈ US$0.0000133/GB-s on arm64."
  type        = number
  default     = 1024
}

variable "lambda_reserved_concurrency" {
  description = "Hard cap on concurrent Lambda executions. -1 = no reservation: this account's total quota is 10 (checked 2026-11-24) and AWS rejects reservations that leave < 10 unreserved. HTTP API throttling (5 rps / burst 10) is then the effective cap. After a (free) quota increase, set 2."
  type        = number
  default     = -1
}

variable "api_rate_limit" {
  description = "Steady-state requests/second allowed by the HTTP API."
  type        = number
  default     = 5
}

variable "api_burst_limit" {
  type    = number
  default = 10
}

variable "log_retention_days" {
  type    = number
  default = 7
}

variable "data_bucket_max_gb" {
  description = "Soft storage limit for the geospatial data bucket; a CloudWatch alarm fires above it."
  type        = number
  default     = 20
}

variable "lambda_zip_path" {
  description = "Path to the Lambda bundle built by backend/scripts/build_lambda.sh."
  type        = string
  default     = "../../backend/dist/lambda.zip"
}
