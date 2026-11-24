terraform {
  required_version = ">= 1.9"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
  # State is local by default (no cost). For team use, switch to an S3 backend
  # with use_lockfile = true (S3-native locking, no DynamoDB table needed).
}

provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Project   = "moonai"
      ManagedBy = "terraform"
      CostCap   = "usd-5-month"
    }
  }
}

data "aws_caller_identity" "current" {}
