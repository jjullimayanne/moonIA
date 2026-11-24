output "site_url" {
  value = "https://${aws_cloudfront_distribution.main.domain_name}"
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.main.id
}

output "site_bucket" {
  value = aws_s3_bucket.site.id
}

output "data_bucket" {
  value = aws_s3_bucket.data.id
}

output "artifacts_bucket" {
  value = aws_s3_bucket.artifacts.id
}

output "api_endpoint" {
  value = aws_apigatewayv2_api.http.api_endpoint
}

output "lambda_function_name" {
  value = aws_lambda_function.api.function_name
}

output "github_deploy_role_arn" {
  value = aws_iam_role.github_deploy.arn
}

output "model_publisher_policy_arn" {
  value = aws_iam_policy.model_publisher.arn
}
