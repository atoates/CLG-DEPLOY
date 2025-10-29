#!/bin/bash
# Quick test to verify news is working after API key update

STAGING_URL="https://clg-staging.up.railway.app"

echo "🧪 Testing News API with New Key"
echo "================================="
echo ""

echo "1️⃣  Checking health..."
curl -s "$STAGING_URL/healthz" | jq '.' && echo "✅ Server is up" || echo "❌ Server not responding"
echo ""

echo "2️⃣  Checking API key configuration..."
CONFIG=$(curl -s "$STAGING_URL/api/debug/config")
echo "$CONFIG" | jq '.'

KEY_SET=$(echo "$CONFIG" | jq -r '.newsApiConfigured')
KEY_PREVIEW=$(echo "$CONFIG" | jq -r '.newsApiKeyPreview')

if [ "$KEY_SET" = "true" ]; then
  echo "✅ API key is configured"
  echo "   Preview: $KEY_PREVIEW"
else
  echo "❌ API key not configured"
  exit 1
fi
echo ""

echo "3️⃣  Testing news endpoint..."
NEWS_RESPONSE=$(curl -s -X POST "$STAGING_URL/api/news" \
  -H "Content-Type: application/json" \
  -d '{"tokens":["BTC","ETH"]}')

echo "$NEWS_RESPONSE" | jq '.'
echo ""

# Check if we got real news or system message
FIRST_TITLE=$(echo "$NEWS_RESPONSE" | jq -r '.news[0].title')
FIRST_SOURCE=$(echo "$NEWS_RESPONSE" | jq -r '.news[0].source.name')
NEWS_COUNT=$(echo "$NEWS_RESPONSE" | jq -r '.news | length')

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Results:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$FIRST_SOURCE" = "System" ]; then
  echo "❌ NOT WORKING - Got system message"
  echo "   Title: $FIRST_TITLE"
  echo ""
  echo "💡 Possible issues:"
  echo "   - API key still invalid"
  echo "   - Deployment not complete yet"
  echo "   - IP might be blacklisted"
else
  echo "✅ NEWS IS WORKING!"
  echo "   Articles found: $NEWS_COUNT"
  echo "   First article: $FIRST_TITLE"
  echo "   Source: $FIRST_SOURCE"
fi

echo ""
echo "🔄 If not working yet, wait 1-2 minutes and run again"
