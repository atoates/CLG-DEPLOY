#!/bin/bash
# Check staging logs for CoinDesk RSS activity

echo "Checking Staging Logs for CoinDesk RSS"
echo "======================================"
echo ""

STAGING_URL="https://clg-staging.up.railway.app"

echo "1. Checking if server is up..."
curl -s "$STAGING_URL/healthz" > /dev/null
if [ $? -eq 0 ]; then
  echo "✅ Server is responding"
else
  echo "❌ Server not responding"
  exit 1
fi

echo ""
echo "2. Triggering news fetch (this should use CoinDesk RSS)..."
echo "   Making POST request to /api/news..."

RESPONSE=$(curl -X POST "$STAGING_URL/api/news" \
  -H "Content-Type: application/json" \
  -d '{"tokens": ["BTC", "ETH"]}' \
  --silent)

echo "$RESPONSE" | jq -r '
  if .news then
    "   Articles returned: \(.news | length)\n" +
    "   Cached: \(.cached // false)\n" +
    "\n   Sources breakdown:" +
    (
      [.news[].source_name] | 
      group_by(.) | 
      map("   - \(.[0]): \(length) articles") | 
      join("\n")
    ) +
    "\n\n   CoinDesk articles: \([.news[] | select(.source_name == "CoinDesk")] | length)"
  else
    "   ❌ Error: \(.error // "Unknown")"
  end
'

echo ""
echo "======================================"
echo "If CoinDesk count is 0, the cache is being used."
echo "To force fresh fetch, clear the news cache in database."
