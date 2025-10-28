#!/bin/bash
# Test news on production after deployment

PROD_URL="https://app.crypto-lifeguard.com"

echo "🚀 Testing Production Deployment"
echo "=================================="
echo ""
echo "Waiting for Railway to deploy (90 seconds)..."
sleep 90

echo ""
echo "1️⃣  Checking production health..."
curl -s "$PROD_URL/healthz" | jq '.' && echo "✅ Production is up" || echo "❌ Production not responding"
echo ""

echo "2️⃣  Checking API key configuration..."
CONFIG=$(curl -s "$PROD_URL/api/debug/config")
echo "$CONFIG" | jq '.'

KEY_SET=$(echo "$CONFIG" | jq -r '.newsApiConfigured')
KEY_PREVIEW=$(echo "$CONFIG" | jq -r '.newsApiKeyPreview')

if [ "$KEY_SET" = "true" ]; then
  echo "✅ API key is configured"
  echo "   Preview: $KEY_PREVIEW"
else
  echo "❌ API key not configured - UPDATE RAILWAY PRODUCTION VARIABLES!"
  exit 1
fi
echo ""

echo "3️⃣  Testing news endpoint on PRODUCTION..."
NEWS_RESPONSE=$(curl -s -X POST "$PROD_URL/api/news" \
  -H "Content-Type: application/json" \
  -d '{"tokens":["BTC","ETH","SOL"]}')

echo "$NEWS_RESPONSE" | jq '.'
echo ""

# Check if we got real news
FIRST_TITLE=$(echo "$NEWS_RESPONSE" | jq -r '.news[0].title')
FIRST_SOURCE=$(echo "$NEWS_RESPONSE" | jq -r '.news[0].source.name')
NEWS_COUNT=$(echo "$NEWS_RESPONSE" | jq -r '.news | length')

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 PRODUCTION Results:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$FIRST_SOURCE" = "System" ]; then
  echo "❌ NEWS NOT WORKING"
  echo "   Title: $FIRST_TITLE"
  echo ""
  echo "⚠️  ACTION REQUIRED:"
  echo "   1. Go to Railway Dashboard"
  echo "   2. Select PRODUCTION environment"
  echo "   3. Go to Variables tab"
  echo "   4. Update NEWSAPI_KEY with the SAME value as staging"
  echo "   5. Make sure there are NO extra characters (no \\n= prefix)"
else
  echo "✅ NEWS IS WORKING ON PRODUCTION!"
  echo "   Articles found: $NEWS_COUNT"
  echo "   First article: $FIRST_TITLE"
  echo "   Source: $FIRST_SOURCE"
  echo ""
  echo "🎉 Deployment successful!"
fi

echo ""
echo "🌐 Visit: $PROD_URL"
