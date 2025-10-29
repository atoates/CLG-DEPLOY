#!/bin/bash
# Smoke test script to verify production is working after deployment

set -e

PROD_URL="https://app.crypto-lifeguard.com"
STAGING_URL="https://clg-staging.up.railway.app"

echo "🧪 Running production smoke tests..."
echo ""

# Test 1: Health endpoint
echo "1️⃣  Testing health endpoint..."
health_response=$(curl -s -o /dev/null -w "%{http_code}" "$PROD_URL/healthz")
if [ "$health_response" != "200" ]; then
  echo "   ❌ Health check failed: HTTP $health_response"
  exit 1
fi
echo "   ✅ Health check passed"

# Test 2: Main page loads
echo "2️⃣  Testing main page..."
main_response=$(curl -s -o /dev/null -w "%{http_code}" "$PROD_URL/")
if [ "$main_response" != "200" ]; then
  echo "   ❌ Main page failed: HTTP $main_response"
  exit 1
fi
echo "   ✅ Main page loads"

# Test 3: Static assets (check if JS bundles exist)
echo "3️⃣  Testing static assets..."
# Get the main HTML and extract asset references
html_content=$(curl -s "$PROD_URL/")
if ! echo "$html_content" | grep -q "/assets/"; then
  echo "   ❌ No asset references found in HTML"
  exit 1
fi
echo "   ✅ Asset references found in HTML"

# Test 4: API endpoint (alerts)
echo "4️⃣  Testing API endpoint..."
api_response=$(curl -s -o /dev/null -w "%{http_code}" "$PROD_URL/api/alerts")
if [ "$api_response" != "200" ]; then
  echo "   ❌ API endpoint failed: HTTP $api_response"
  exit 1
fi
echo "   ✅ API endpoint responding"

# Test 5: Verify no CORS errors on main domain
echo "5️⃣  Testing CORS configuration..."
cors_response=$(curl -s -H "Origin: $PROD_URL" -I "$PROD_URL/api/alerts" | grep -i "access-control-allow-origin" || echo "none")
if [ "$cors_response" == "none" ]; then
  echo "   ⚠️  No CORS headers (may be OK for same-origin)"
else
  echo "   ✅ CORS headers present: $cors_response"
fi

echo ""
echo "✅ All smoke tests passed!"
echo "🚀 Production is healthy"
