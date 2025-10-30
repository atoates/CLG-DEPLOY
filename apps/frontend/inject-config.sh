#!/bin/bash
# Inject backend URL into config.js after build

BACKEND_URL="${BACKEND_URL:-}"

if [ -z "$BACKEND_URL" ]; then
  echo "⚠️  BACKEND_URL not set, using empty string (same origin)"
  BACKEND_URL=""
fi

echo "🔧 Injecting BACKEND_URL into config files: '$BACKEND_URL'"

# Find all config.js files (including hashed ones in assets/)
CONFIG_FILES=$(find dist -name "config*.js" 2>/dev/null)

if [ -z "$CONFIG_FILES" ]; then
  echo "❌ No config.js files found in dist/"
  exit 1
fi

# Replace the placeholder in all found config files
for CONFIG_FILE in $CONFIG_FILES; do
  echo "   Processing: $CONFIG_FILE"
  # Use sed with compatibility for both macOS and Linux
  if sed --version >/dev/null 2>&1; then
    # GNU sed (Linux)
    sed -i "s|__BACKEND_URL__|${BACKEND_URL}|g" "$CONFIG_FILE"
  else
    # BSD sed (macOS)
    sed -i '' "s|__BACKEND_URL__|${BACKEND_URL}|g" "$CONFIG_FILE"
  fi
done

echo "✅ Config injected successfully into $(echo $CONFIG_FILES | wc -w | tr -d ' ') file(s)"

