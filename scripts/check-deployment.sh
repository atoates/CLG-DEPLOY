#!/bin/bash

# check-deployment.sh
# Diagnostic script to understand what's deployed where

echo "🔍 Deployment Diagnostic"
echo "======================="
echo ""

echo "1️⃣  Checking app.crypto-lifeguard.com..."
echo ""

# Check if it's serving API or frontend
RESPONSE=$(curl -s https://app.crypto-lifeguard.com/api/alerts)

if echo "$RESPONSE" | grep -q "<!DOCTYPE html"; then
  echo "❌ app.crypto-lifeguard.com is serving FRONTEND (HTML)"
  echo "   This should be the BACKEND API server!"
  echo ""
  echo "🔧 Fix needed:"
  echo "   In Railway, the domain app.crypto-lifeguard.com should point to"
  echo "   the CLG-ADMIN service (backend), NOT CLG-DEPLOY (frontend)"
elif echo "$RESPONSE" | grep -q "alerts\|severity\|token"; then
  echo "✅ app.crypto-lifeguard.com is serving BACKEND API"
  echo "   Response looks like alert data"
else
  echo "⚠️  Unexpected response from app.crypto-lifeguard.com"
  echo "   Response: $RESPONSE"
fi

echo ""
echo "2️⃣  Checking for backend endpoints..."
echo ""

# Try various backend-specific endpoints
for endpoint in "/admin/info" "/api/alerts" "/healthz" "/health"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://app.crypto-lifeguard.com$endpoint)
  if [ "$STATUS" = "200" ]; then
    echo "✅ $endpoint → HTTP $STATUS"
    CONTENT=$(curl -s https://app.crypto-lifeguard.com$endpoint | head -c 100)
    if echo "$CONTENT" | grep -q "<!DOCTYPE"; then
      echo "   ⚠️  Returns HTML (frontend)"
    else
      echo "   ✅ Returns API data"
    fi
  else
    echo "❌ $endpoint → HTTP $STATUS"
  fi
done

echo ""
echo "3️⃣  Checking Railway deployment URLs..."
echo ""

echo "Expected configuration:"
echo "  • CLG-DEPLOY (frontend): Should serve static HTML at custom domain OR Railway subdomain"
echo "  • CLG-ADMIN (backend): Should serve API at app.crypto-lifeguard.com"
echo ""
echo "Actual behavior:"
curl -s https://app.crypto-lifeguard.com | head -10 | grep -q "<!DOCTYPE" && \
  echo "  ❌ app.crypto-lifeguard.com is returning HTML (wrong!)" || \
  echo "  ✅ app.crypto-lifeguard.com is returning API data"

echo ""
echo "4️⃣  Testing admin dashboard URL..."
echo ""

ADMIN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://clg-admin-production.up.railway.app)
echo "  clg-admin-production.up.railway.app → HTTP $ADMIN_STATUS"

if [ "$ADMIN_STATUS" = "200" ]; then
  curl -s https://clg-admin-production.up.railway.app | head -10 | grep -q "<!DOCTYPE" && \
    echo "  ✅ Serving HTML (admin dashboard frontend)" || \
    echo "  ⚠️  Not serving HTML"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Diagnosis"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if curl -s https://app.crypto-lifeguard.com/api/alerts | head -1 | grep -q "<!DOCTYPE"; then
  echo "❌ PROBLEM FOUND:"
  echo ""
  echo "   app.crypto-lifeguard.com is pointing to the WRONG service!"
  echo ""
  echo "   Current: CLG-DEPLOY (frontend static files)"
  echo "   Should be: CLG-ADMIN (backend API server)"
  echo ""
  echo "🔧 FIX:"
  echo "   1. Go to Railway dashboard"
  echo "   2. Open CLG-ADMIN service settings"
  echo "   3. Add custom domain: app.crypto-lifeguard.com"
  echo "   4. Remove this domain from CLG-DEPLOY if present"
  echo "   5. Update DNS if needed"
  echo ""
else
  echo "✅ Domains configured correctly"
  echo "   Running CORS verification..."
  echo ""
  cd /Users/ato/Downloads/CLG/CLG-DEPLOY && ./verify-cors-fix.sh
fi
