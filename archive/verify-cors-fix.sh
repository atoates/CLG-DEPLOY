#!/bin/bash

# verify-cors-fix.sh
# Script to verify CORS configuration is deployed and working

set -e

echo "🔍 Verifying CORS Fix Deployment..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BACKEND_URL="https://app.crypto-lifeguard.com"
ADMIN_ORIGIN="https://clg-admin-production.up.railway.app"

echo "1️⃣  Testing CORS preflight request..."
echo "   Backend: $BACKEND_URL"
echo "   Origin:  $ADMIN_ORIGIN"
echo ""

# Test CORS preflight (OPTIONS request)
PREFLIGHT_RESPONSE=$(curl -s -X OPTIONS \
  -H "Origin: $ADMIN_ORIGIN" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -i "$BACKEND_URL/api/alerts" 2>&1)

echo "📋 Preflight Response Headers:"
echo "$PREFLIGHT_RESPONSE" | grep -i "access-control" || echo "   ⚠️  No CORS headers found"
echo ""

# Check if Access-Control-Allow-Origin header is present
if echo "$PREFLIGHT_RESPONSE" | grep -qi "access-control-allow-origin: $ADMIN_ORIGIN"; then
  echo -e "${GREEN}✅ CORS Fix Deployed!${NC}"
  echo "   The backend is allowing requests from the admin dashboard"
elif echo "$PREFLIGHT_RESPONSE" | grep -qi "access-control-allow-origin"; then
  ORIGIN=$(echo "$PREFLIGHT_RESPONSE" | grep -i "access-control-allow-origin" | cut -d' ' -f2 | tr -d '\r')
  echo -e "${YELLOW}⚠️  CORS configured but for different origin${NC}"
  echo "   Expected: $ADMIN_ORIGIN"
  echo "   Got:      $ORIGIN"
else
  echo -e "${RED}❌ CORS Fix NOT Deployed${NC}"
  echo "   The backend is not sending CORS headers for this origin"
  echo ""
  echo "🔄 Possible reasons:"
  echo "   • Railway deployment hasn't completed yet"
  echo "   • Railway didn't detect the git push"
  echo "   • Wrong service is running at $BACKEND_URL"
  echo ""
  echo "💡 Next steps:"
  echo "   1. Check Railway dashboard for CLG-ADMIN service"
  echo "   2. Look for active deployment with commit 3d6b48b"
  echo "   3. Manually trigger deployment if needed"
  echo "   4. Wait 1-2 minutes and run this script again"
fi

echo ""
echo "2️⃣  Testing actual API request..."

# Test actual GET request
API_RESPONSE=$(curl -s -X GET \
  -H "Origin: $ADMIN_ORIGIN" \
  -H "Accept: application/json" \
  -i "$BACKEND_URL/api/alerts" 2>&1)

if echo "$API_RESPONSE" | grep -qi "HTTP/2 200\|HTTP/1.1 200"; then
  echo -e "${GREEN}✅ API endpoint is responding${NC}"
  
  # Check if response includes CORS header
  if echo "$API_RESPONSE" | grep -qi "access-control-allow-origin"; then
    echo -e "${GREEN}✅ CORS headers present in response${NC}"
  else
    echo -e "${YELLOW}⚠️  API works but CORS headers missing${NC}"
  fi
else
  STATUS=$(echo "$API_RESPONSE" | grep "HTTP" | head -1)
  echo -e "${RED}❌ API request failed${NC}"
  echo "   Status: $STATUS"
fi

echo ""
echo "3️⃣  Checking backend deployment info..."

# Try to get server info endpoint
INFO_RESPONSE=$(curl -s "$BACKEND_URL/admin/info" 2>&1)

if echo "$INFO_RESPONSE" | grep -q "uptime\|version"; then
  echo -e "${GREEN}✅ Backend is online${NC}"
  echo "$INFO_RESPONSE" | jq '.' 2>/dev/null || echo "$INFO_RESPONSE"
else
  echo -e "${YELLOW}⚠️  Could not retrieve backend info${NC}"
fi

echo ""
echo "4️⃣  Testing from admin dashboard perspective..."
echo "   Simulating browser CORS check..."

# Simulate what browser does
BROWSER_TEST=$(curl -s -X OPTIONS \
  -H "Origin: $ADMIN_ORIGIN" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: content-type" \
  -w "\nHTTP_CODE:%{http_code}" \
  "$BACKEND_URL/api/alerts" 2>&1)

HTTP_CODE=$(echo "$BROWSER_TEST" | grep "HTTP_CODE" | cut -d: -f2)

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "204" ]; then
  echo -e "${GREEN}✅ Preflight request successful (HTTP $HTTP_CODE)${NC}"
else
  echo -e "${RED}❌ Preflight request failed (HTTP $HTTP_CODE)${NC}"
  echo "   This means browsers will block the request"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if echo "$PREFLIGHT_RESPONSE" | grep -qi "access-control-allow-origin: $ADMIN_ORIGIN"; then
  echo -e "${GREEN}✅ CORS is working correctly!${NC}"
  echo ""
  echo "🎉 Your admin dashboard should now work."
  echo "   Refresh https://clg-admin-production.up.railway.app"
  echo "   and check the browser console for errors."
else
  echo -e "${RED}❌ CORS fix is not active yet${NC}"
  echo ""
  echo "🔄 The backend hasn't redeployed with the new configuration."
  echo ""
  echo "To fix this:"
  echo "1. Go to Railway dashboard: https://railway.app"
  echo "2. Find the CLG-ADMIN service"
  echo "3. Check if a deployment is in progress"
  echo "4. If not, click 'Deploy' to trigger manually"
  echo "5. Wait for deployment to complete (~1-2 minutes)"
  echo "6. Run this script again: ./verify-cors-fix.sh"
fi

echo ""
