# ---------------------------------------------------------------------------
# S3 buckets: static site, geospatial data / precomputed results, artifacts.
# All private; the site is only readable through CloudFront (OAC).
# ---------------------------------------------------------------------------

locals {
  prefix = "${var.project}-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket" "site" {
  bucket        = "${local.prefix}-site"
  force_destroy = true
}

resource "aws_s3_bucket" "data" {
  bucket = "${local.prefix}-data"
}

resource "aws_s3_bucket" "artifacts" {
  bucket        = "${local.prefix}-artifacts"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "all" {
  for_each                = { site = aws_s3_bucket.site.id, data = aws_s3_bucket.data.id, artifacts = aws_s3_bucket.artifacts.id }
  bucket                  = each.value
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "all" {
  for_each = { site = aws_s3_bucket.site.id, data = aws_s3_bucket.data.id, artifacts = aws_s3_bucket.artifacts.id }
  bucket   = each.value
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# Keep only the latest Lambda bundles; old artifacts would silently accrue storage.
resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule {
    id     = "expire-old-bundles"
    status = "Enabled"
    filter {}
    expiration {
      days = 30
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "data" {
  bucket = aws_s3_bucket.data.id
  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "CloudFrontOAC"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.site.arn}/*"
      Condition = { StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.main.arn } }
    }]
  })
}

# SSE-S3 (AES-256) at rest — free. (KMS would add per-request charges.)
resource "aws_s3_bucket_server_side_encryption_configuration" "all" {
  for_each = { site = aws_s3_bucket.site.id, data = aws_s3_bucket.data.id, artifacts = aws_s3_bucket.artifacts.id }
  bucket   = each.value
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
