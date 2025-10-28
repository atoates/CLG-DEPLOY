#!/bin/bash
# Test staging news endpoint

echo "Testing Staging News API"
echo "========================"
echo ""

STAGING_URL="https://clg-staging.up.railway.app"

echo "Testing news endpoint with BTC, ETH, SOL..."
echo ""

curl -X POST "$STAGING_URL/api/news" \
  -H "Content-Type: application/json" \
  -d '{"tokens": ["BTC", "ETH", "SOL"]}' \
  --silent | jq -r '
    if .news then
      "✅ News API Response:\n" +
      "Articles: \(.news | length)\n" +
      "Cached: \(.cached // false)\n" +
      "\nFirst 3 articles:\n" +
      (.news[0:3] | to_entries | map(
        "\(.key + 1). \(.value.title)\n" +
        "   Source: \(.value.source_name)\n" +
        "   Tokens: \(.value.tickers | join(", "))\n" +
        "   Date: \(.value.date)\n"
      ) | join("\n"))
    else
      "❌ Error: \(.error // "Unknown error")\n\(.message // "")"
    end
  '

echo ""
echo "========================"
echo "Test complete!"
