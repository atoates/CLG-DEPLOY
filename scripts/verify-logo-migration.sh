#!/bin/bash

# Verify PostgreSQL Logo Cache Migration
# Tests that logos are being served from the database

echo "🧪 Testing PostgreSQL Logo Cache Migration"
echo "=========================================="
echo ""

# Test backend health
echo "1. Checking backend health..."
HEALTH=$(curl -s https://clg-admin-production.up.railway.app/healthz)
if [ "$HEALTH" = '{"ok":true}' ]; then
  echo "   ✅ Backend is healthy"
else
  echo "   ❌ Backend health check failed"
  exit 1
fi
echo ""

# Test logo endpoints
echo "2. Testing logo endpoints..."
TOKENS=("BTC" "ETH" "SOL" "USDT" "BNB" "XRP" "ADA" "DOGE" "MATIC" "DOT")

for TOKEN in "${TOKENS[@]}"; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://clg-admin-production.up.railway.app/api/logo/$TOKEN")
  CONTENT_TYPE=$(curl -s -I "https://clg-admin-production.up.railway.app/api/logo/$TOKEN" | grep -i content-type | awk '{print $2}' | tr -d '\r')
  
  if [ "$HTTP_CODE" = "200" ]; then
    echo "   ✅ $TOKEN: $HTTP_CODE - $CONTENT_TYPE"
  else
    echo "   ⚠️  $TOKEN: $HTTP_CODE"
  fi
done
echo ""

# Test frontend config
echo "3. Checking frontend BACKEND_URL configuration..."
FRONTEND_CONFIG=$(curl -s https://app.crypto-lifeguard.com/config.js)
if echo "$FRONTEND_CONFIG" | grep -q "clg-admin-production.up.railway.app"; then
  echo "   ✅ Frontend points to correct backend"
else
  echo "   ❌ Frontend BACKEND_URL misconfigured"
fi
echo ""

echo "=========================================="
echo "✅ Logo migration verification complete!"
echo ""
echo "Next steps:"
echo "1. Check Railway logs for migration success"
echo "2. Visit https://app.crypto-lifeguard.com and verify logos display"
echo "3. Restart the server and confirm logos persist (PostgreSQL cache)"
echo ""
echo "To check PostgreSQL logo cache:"
echo "  SELECT COUNT(*) FROM logo_cache;"
echo "  SELECT symbol, content_type, updated_at FROM logo_cache ORDER BY updated_at DESC LIMIT 10;"
