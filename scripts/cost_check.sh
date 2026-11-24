#!/usr/bin/env bash
# Re-validates the unit prices used in docs/architecture/02-aws-cost-estimate.md (read-only, free).
set -euo pipefail
q() { aws pricing get-products --region us-east-1 --service-code "$1" --max-results 20 --output json --filters "${@:2}" \
  | python3 -c "import sys,json
for p in json.load(sys.stdin)['PriceList']:
  p=json.loads(p)
  for t in p['terms']['OnDemand'].values():
    for d in t['priceDimensions'].values(): print('  ',d['pricePerUnit']['USD'],'USD/'+d['unit'],'-',d['description'][:90])" | head -4; }
echo "Lambda arm64 duration";  q AWSLambda Type=TERM_MATCH,Field=regionCode,Value=us-east-1 Type=TERM_MATCH,Field=group,Value=AWS-Lambda-Duration-ARM
echo "Lambda arm64 requests";  q AWSLambda Type=TERM_MATCH,Field=regionCode,Value=us-east-1 Type=TERM_MATCH,Field=group,Value=AWS-Lambda-Requests-ARM
echo "HTTP API";               q AmazonApiGateway Type=TERM_MATCH,Field=regionCode,Value=us-east-1 Type=TERM_MATCH,Field=operation,Value=ApiGatewayHttpApi
echo "S3 Standard storage";    q AmazonS3 Type=TERM_MATCH,Field=regionCode,Value=us-east-1 Type=TERM_MATCH,Field=storageClass,Value="General Purpose" Type=TERM_MATCH,Field=volumeType,Value=Standard
echo "CloudFront out (US)";    q AmazonCloudFront Type=TERM_MATCH,Field=fromLocation,Value="United States" Type=TERM_MATCH,Field=transferType,Value="CloudFront Outbound"
echo "Month-to-date spend:";   aws ce get-cost-and-usage --time-period Start=$(date +%Y-%m-01),End=$(date -v+1d +%Y-%m-%d 2>/dev/null || date -d tomorrow +%Y-%m-%d) \
  --granularity MONTHLY --metrics UnblendedCost --query 'ResultsByTime[0].Total.UnblendedCost' --output text 2>/dev/null || echo "  (Cost Explorer not enabled)"
