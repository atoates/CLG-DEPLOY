#!/bin/bash

# build-with-main-app.sh
# Builds both the main app frontend AND admin dashboard, 
# then combines them so the backend can serve both

set -e

echo "🏗️  Building CLG Backend + Main App + Admin Dashboard"
echo "======================================================"
echo ""

# Get absolute paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="$SCRIPT_DIR"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "📁 Directories:"
echo "   Root:  $ROOT_DIR"
echo "   Admin: $ADMIN_DIR"
echo ""

# Step 1: Build the main app (apps/frontend)
echo "1️⃣  Building main app (apps/frontend)..."
cd "$ROOT_DIR"

if [ ! -d "node_modules" ]; then
  echo "   Installing dependencies..."
  npm install
fi

npm run build --workspace=apps/frontend

if [ ! -d "apps/frontend/dist" ]; then
  echo "❌ Error: Main app build failed - apps/frontend/dist/ not found"
  exit 1
fi

echo "✅ Main app built successfully"
echo ""

# Step 2: Build admin dashboard
echo "2️⃣  Building admin dashboard..."
cd "$ADMIN_DIR"

if [ ! -d "node_modules" ]; then
  echo "   Installing dependencies..."
  npm install
fi

npm run build

if [ ! -d "dist" ]; then
  echo "❌ Error: Admin dashboard build failed - dist/ not found"
  exit 1
fi

echo "✅ Admin dashboard built successfully"
echo ""

# Step 3: Copy main app dist to backend's main-app directory
echo "3️⃣  Setting up backend to serve main app..."

# Create directory structure
mkdir -p "$ADMIN_DIR/main-app-dist"

# Copy main app build to main-app-dist
echo "   Copying main app files..."
cp -R "$ROOT_DIR/apps/frontend/dist/"* "$ADMIN_DIR/main-app-dist/"

echo "✅ Main app files copied to backend"
echo ""

# Step 4: Keep admin dashboard in its own dist directory
echo "4️⃣  Admin dashboard ready at:"
echo "   $ADMIN_DIR/dist/"
echo ""

echo "✅ Build complete!"
echo ""
echo "📦 Directory structure:"
echo "   apps/admin/main-app-dist/  → Main app (served at app.crypto-lifeguard.com)"
echo "   apps/admin/dist/           → Admin dashboard (Railway default URL)"
echo ""
echo "💡 Next: Update server.js to serve main-app-dist/ for root paths"
echo "   and dist/ only for admin dashboard subdomain"
