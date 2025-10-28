#!/bin/bash
# Monitor news API logs in real-time on Railway

echo "🔍 Monitoring News API Logs on Railway Staging"
echo "==============================================="
echo ""
echo "Waiting for deployment to complete (30 seconds)..."
sleep 30

echo ""
echo "Testing news API to generate logs..."
curl -X POST "https://clg-staging.up.railway.app/api/news" \
  -H "Content-Type: application/json" \
  -d '{"tokens":["BTC","ETH"]}' \
  -s > /dev/null

echo "Waiting for logs to appear (5 seconds)..."
sleep 5

echo ""
echo "📋 Recent logs (looking for [News] entries):"
echo "============================================="

if command -v railway &> /dev/null; then
  # If railway CLI is available, use it
  railway logs --environment staging --lines 100 2>/dev/null | grep -E "\[News\]|news|News|error|Error" || echo "No news-related logs found"
else
  echo "⚠️  Railway CLI not installed"
  echo ""
  echo "To view logs manually:"
  echo "1. Go to: https://railway.app/dashboard"
  echo "2. Select your project"
  echo "3. Click on the service"
  echo "4. Go to 'Deployments' tab"
  echo "5. Click on latest deployment"
  echo "6. View logs and search for '[News]'"
fi

echo ""
echo "💡 What to look for in logs:"
echo "============================"
echo "✅ '[News] Token: BTC, Status: 200' - API call succeeded"
echo "✅ '[News] Response for BTC: X articles' - Got articles"
echo "❌ '[News] Token: BTC, Status: 401' - Invalid API key"
echo "❌ '[News] Token: BTC, Status: 403' - IP blacklisted"
echo "❌ '[News] Error for BTC (XXX): ...' - API error details"
echo "❌ '[News] Exception for BTC: ...' - Network/timeout error"
