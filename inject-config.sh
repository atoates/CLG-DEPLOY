#!/bin/bash
# Inject backend URL into config.js after build

BACKEND_URL="${BACKEND_URL:-}"

if [ -z "$BACKEND_URL" ]; then
  echo "⚠️  BACKEND_URL not set, using empty string (same origin)"
  BACKEND_URL=""
fi

echo "🔧 Injecting BACKEND_URL into dist/config.js: '$BACKEND_URL'"

# Replace the placeholder in the built config.js
if [ -f "dist/config.js" ]; then
  # Use sed with compatibility for both macOS and Linux
  if sed --version >/dev/null 2>&1; then
    # GNU sed (Linux)
    sed -i "s|__BACKEND_URL__|${BACKEND_URL}|g" dist/config.js
  else
    # BSD sed (macOS)
    sed -i '' "s|__BACKEND_URL__|${BACKEND_URL}|g" dist/config.js
  fi
  echo "✅ Config injected successfully"
else
  echo "❌ dist/config.js not found!"
  exit 1
fi
