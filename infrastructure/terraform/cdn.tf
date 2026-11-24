# ---------------------------------------------------------------------------
# CloudFront: one HTTPS entry point on the free *.cloudfront.net domain.
#   /*          → site bucket (React build)
#   /moonai/*   → data bucket (versioned models, predictions, manifests)
#   /api/*      → HTTP API (Lambda); responses cached by their Cache-Control
# PriceClass_100 (NA + EU edges) is the cheapest class.
# ---------------------------------------------------------------------------

locals {
  # AWS managed policies (IDs are global constants)
  cache_optimized_id              = "658327ea-f89d-4fab-a63d-7e88639e58f6" # CachingOptimized: honors origin Cache-Control
  origin_req_all_except_host      = "b689b0a8-53d0-40ab-baf2-68738e2966ac" # AllViewerExceptHostHeader
  security_headers_policy_id      = "67f7725c-6f97-4210-82d7-5512b31e9d03" # SecurityHeadersPolicy
  api_origin_domain               = replace(aws_apigatewayv2_api.http.api_endpoint, "https://", "")
}

resource "aws_cloudfront_origin_access_control" "s3" {
  name                              = "${var.project}-s3-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# API responses: cache keyed on the full query string (terrain samples are deterministic).
resource "aws_cloudfront_cache_policy" "api" {
  name        = "${var.project}-api"
  min_ttl     = 0
  default_ttl = 0
  max_ttl     = 31536000
  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_gzip   = true
    enable_accept_encoding_brotli = true
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "all"
    }
  }
}

resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  comment             = "MoonAI — lunar exploration platform"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  http_version        = "http2and3"
  is_ipv6_enabled     = true

  origin {
    origin_id                = "site"
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.s3.id
  }

  origin {
    origin_id                = "data"
    domain_name              = aws_s3_bucket.data.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.s3.id
  }

  origin {
    origin_id   = "api"
    domain_name = local.api_origin_domain
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
      origin_read_timeout    = 30
    }
  }

  default_cache_behavior {
    target_origin_id           = "site"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = local.cache_optimized_id
    response_headers_policy_id = local.security_headers_policy_id
  }

  ordered_cache_behavior {
    path_pattern               = "/moonai/*"
    target_origin_id           = "data"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = local.cache_optimized_id
    response_headers_policy_id = local.security_headers_policy_id
  }

  ordered_cache_behavior {
    path_pattern               = "/api/*"
    target_origin_id           = "api"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = aws_cloudfront_cache_policy.api.id
    origin_request_policy_id   = local.origin_req_all_except_host
    response_headers_policy_id = local.security_headers_policy_id
  }

  # SPA fallback is not needed (single route); S3 403 → index.html keeps deep links working.
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 60
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

resource "aws_s3_bucket_policy" "data" {
  bucket = aws_s3_bucket.data.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "CloudFrontOACPublishedArtifacts"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.data.arn}/moonai/*"
      Condition = { StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.main.arn } }
    }]
  })
}
