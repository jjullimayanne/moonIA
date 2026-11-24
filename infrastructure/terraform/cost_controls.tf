# ---------------------------------------------------------------------------
# Cost guardrails. NOTE: AWS Budgets only ALERTS — it never stops spending.
# Hard limits come from throttling, reserved concurrency and no always-on compute.
# A single cost budget with notifications is free.
# ---------------------------------------------------------------------------

resource "aws_budgets_budget" "monthly" {
  name         = "${var.project}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # US$ 1 / 3 / 5 actual spend (20 % / 60 % / 100 % of US$ 5)
  dynamic "notification" {
    for_each = [20, 60, 100]
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = [var.budget_email]
    }
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.budget_email]
  }
}

resource "aws_sns_topic" "alerts" {
  name = "${var.project}-alerts"
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.budget_email
}

# S3 has no hard quota: alarm when the data bucket exceeds the agreed size.
# Uses the free daily BucketSizeBytes metric; first 10 alarms are free tier.
resource "aws_cloudwatch_metric_alarm" "data_bucket_size" {
  alarm_name          = "${var.project}-data-bucket-over-${var.data_bucket_max_gb}gb"
  namespace           = "AWS/S3"
  metric_name         = "BucketSizeBytes"
  statistic           = "Maximum"
  period              = 86400
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = var.data_bucket_max_gb * 1024 * 1024 * 1024
  treat_missing_data  = "notBreaching"
  dimensions = {
    BucketName  = aws_s3_bucket.data.id
    StorageType = "StandardStorage"
  }
  alarm_actions = [aws_sns_topic.alerts.arn]
}
