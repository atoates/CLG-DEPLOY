#!/bin/bash
# Diagnose news API issues on staging

STAGING_URL="https://clg-staging.up.railway.app"

echo "🔍 Diagnosing News API Issues on Staging"
echo "========================================"
echo ""

echo "1️⃣  Checking environment configuration..."
echo "-------------------------------------------"
curl -s "$STAGING_URL/api/debug/env-check" | jq '.' || echo "❌ Failed to get env-check"
echo ""

echo "2️⃣  Checking API key configuration..."
echo "--------------------------------------"
curl -s "$STAGING_URL/api/debug/config" | jq '.' || echo "❌ Failed to get config"
echo ""

echo "3️⃣  Testing news endpoint with BTC..."
echo "--------------------------------------"
RESPONSE=$(curl -s -X POST "$STAGING_URL/api/news" \
  -H "Content-Type: application/json" \
  -d '{"tokens":["BTC"]}')

echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
echo ""

echo "4️⃣  Checking Railway logs (last 50 lines)..."
echo "----------------------------------------------"
if command -v railway &> /dev/null; then
  railway logs --environment staging --lines 50 | grep -i "news\|error\|blacklist\|403" || echo "No news-related errors found"
else
  echo "⚠️  Railway CLI not installed. Install with: npm i -g @railway/cli"
fi

echo ""
echo "💡 Quick Fixes:"
echo "==============="
echo "1. Check Railway Variables tab for these env vars:"
echo "   - NEWSAPI_KEY or NEWS_API or CRYPTONEWS_API_KEY"
echo "   - Value should be from https://cryptonews-api.com"
echo ""
echo "2. If API key is correct, check for IP blacklist"
echo "   - Error message: 'IP blacklisted'"
echo "   - Contact: support@stocknewsapi.com"
echo ""
echo "3. Verify the news endpoint works:"
echo "   curl -X POST $STAGING_URL/api/news -H 'Content-Type: application/json' -d '{\"tokens\":[\"BTC\"]}'"
