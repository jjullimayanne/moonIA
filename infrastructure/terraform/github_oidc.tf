# ---------------------------------------------------------------------------
# GitHub Actions → AWS with OIDC (no long-lived keys). The role can only be
# assumed from the main branch / "production" environment of this repository.
# ---------------------------------------------------------------------------

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

resource "aws_iam_role" "github_deploy" {
  name = "${var.project}-github-deploy"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = { "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com" }
        StringLike = {
          "token.actions.githubusercontent.com:sub" = [
            "repo:${var.github_repository}:ref:refs/heads/main",
            "repo:${var.github_repository}:environment:production",
          ]
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "github_deploy" {
  role = aws_iam_role.github_deploy.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "SiteSync"
        Effect   = "Allow"
        Action   = ["s3:ListBucket", "s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = [aws_s3_bucket.site.arn, "${aws_s3_bucket.site.arn}/*"]
      },
      {
        Sid      = "LambdaArtifact"
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = "${aws_s3_bucket.artifacts.arn}/lambda/*"
      },
      {
        Sid      = "LambdaUpdate"
        Effect   = "Allow"
        Action   = ["lambda:UpdateFunctionCode", "lambda:GetFunction"]
        Resource = aws_lambda_function.api.arn
      },
      {
        Sid      = "Invalidate"
        Effect   = "Allow"
        Action   = ["cloudfront:CreateInvalidation"]
        Resource = aws_cloudfront_distribution.main.arn
      },
    ]
  })
}

# Local model publishing (make publish) uses YOUR temporary credentials
# (aws sso login / profile). This managed policy is the least privilege it needs;
# attach it to that identity explicitly.
resource "aws_iam_policy" "model_publisher" {
  name = "${var.project}-model-publisher"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Action    = ["s3:ListBucket"]
        Resource  = aws_s3_bucket.data.arn
        Condition = { StringLike = { "s3:prefix" = ["moonai/*"] } }
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = "${aws_s3_bucket.data.arn}/moonai/*"
      },
      {
        Effect   = "Allow"
        Action   = ["cloudfront:CreateInvalidation"]
        Resource = aws_cloudfront_distribution.main.arn
      },
    ]
  })
}
