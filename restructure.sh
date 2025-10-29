#!/bin/bash

# restructure.sh
# Script to reorganize CLG-DEPLOY repository into a clean monorepo structure

set -e

echo "🏗️  CLG-DEPLOY Repository Restructure"
echo "====================================="
echo ""
echo "⚠️  This will reorganize your repository structure."
echo "   Make sure you've committed all changes first!"
echo ""

# Check if git is clean
if [ -n "$(git status --porcelain)" ]; then
  echo "❌ Error: You have uncommitted changes."
  echo "   Please commit or stash them first."
  exit 1
fi

echo "✅ Git working tree is clean. Proceeding..."
echo ""

# Create new directory structure
echo "📁 Creating new directory structure..."

mkdir -p apps/frontend/src
mkdir -p apps/frontend/public
mkdir -p apps/backend/src
mkdir -p apps/backend/scripts
mkdir -p apps/backend/data
mkdir -p apps/admin-dashboard
mkdir -p scripts
mkdir -p docs

echo "✅ Directories created"
echo ""

# Move frontend files
echo "📦 Moving frontend files to apps/frontend/..."

# Move JS files to src
git mv app.js apps/frontend/src/
git mv create.js apps/frontend/src/
git mv profile.js apps/frontend/src/
git mv config.js apps/frontend/src/

# Move HTML files
git mv index.html apps/frontend/
git mv create.html apps/frontend/
git mv profile.html apps/frontend/
git mv signup.html apps/frontend/

# Move styles
git mv styles.css apps/frontend/

# Move public directory
if [ -d "public" ]; then
  git mv public/* apps/frontend/public/ 2>/dev/null || true
  rmdir public 2>/dev/null || true
fi

# Copy build configuration
git mv vite.config.ts apps/frontend/
git mv inject-config.sh apps/frontend/
cp nixpacks.toml apps/frontend/

# Copy package.json and update it
cp package.json apps/frontend/
# Note: Will need manual updates to package.json

echo "✅ Frontend files moved"
echo ""

# Move backend files
echo "📦 Moving backend files to apps/backend/..."

# Move server from apps/admin
git mv apps/admin/server.js apps/backend/src/

# Move migrations
git mv apps/admin/migrations apps/backend/

# Move scripts
git mv apps/admin/migrate.js apps/backend/scripts/

# Move backend utility scripts from root
git mv backup.js apps/backend/scripts/
git mv restore-alerts.js apps/backend/scripts/
git mv add_alerts.js apps/backend/scripts/
git mv add-production-alerts.js apps/backend/scripts/
git mv update-tags.js apps/backend/scripts/
git mv update-specific-tags.js apps/backend/scripts/

# Move alerts data
if [ -f "alerts.json" ]; then
  git mv alerts.json apps/backend/data/
fi
if [ -f "alerts.js" ]; then
  git mv alerts.js apps/backend/scripts/
fi
if [ -f "alerts-tags.js" ]; then
  git mv alerts-tags.js apps/backend/scripts/
fi

# Copy backend configuration
git mv apps/admin/nixpacks.toml apps/backend/
git mv apps/admin/railway.json apps/backend/
cp apps/admin/package.json apps/backend/

echo "✅ Backend files moved"
echo ""

# Move admin dashboard
echo "📦 Moving admin dashboard to apps/admin-dashboard/..."

# Move remaining files from apps/admin to admin-dashboard
git mv apps/admin/src apps/admin-dashboard/
git mv apps/admin/public apps/admin-dashboard/
git mv apps/admin/index.html apps/admin-dashboard/
git mv apps/admin/vite.config.ts apps/admin-dashboard/
git mv apps/admin/tailwind.config.js apps/admin-dashboard/
git mv apps/admin/postcss.config.js apps/admin-dashboard/
git mv apps/admin/tsconfig*.json apps/admin-dashboard/
git mv apps/admin/eslint.config.js apps/admin-dashboard/
cp apps/admin/package.json apps/admin-dashboard/

echo "✅ Admin dashboard moved"
echo ""

# Move test scripts
echo "📦 Moving test scripts to scripts/..."

git mv test-*.js scripts/ 2>/dev/null || true
git mv test-*.sh scripts/ 2>/dev/null || true
git mv verify-cors-fix.sh scripts/
git mv research-coindesk.js scripts/ 2>/dev/null || true

echo "✅ Test scripts moved"
echo ""

# Move documentation
echo "📦 Moving documentation to docs/..."

git mv ADMIN-PANEL-TASK.md docs/ 2>/dev/null || true
git mv DEPLOYMENT.md docs/ 2>/dev/null || true
git mv NEWS-CACHE-IMPLEMENTATION.md docs/ 2>/dev/null || true
git mv NEWS-DEBUG-GUIDE.md docs/ 2>/dev/null || true
git mv POSTGRESQL_MIGRATION.md docs/ 2>/dev/null || true
git mv RAILWAY_MONOREPO_SETUP.md docs/ 2>/dev/null || true
git mv RAILWAY_SETUP_INSTRUCTIONS.md docs/ 2>/dev/null || true

# Move admin docs
git mv apps/admin/*.md docs/admin/ 2>/dev/null || mkdir -p docs/admin && git mv apps/admin/*.md docs/admin/

echo "✅ Documentation moved"
echo ""

# Clean up empty apps/admin directory
echo "🧹 Cleaning up..."
if [ -d "apps/admin" ]; then
  # Move any remaining files
  if [ "$(ls -A apps/admin 2>/dev/null)" ]; then
    echo "⚠️  Warning: apps/admin still contains files:"
    ls -la apps/admin
  else
    rmdir apps/admin
    echo "✅ Removed empty apps/admin directory"
  fi
fi

echo ""
echo "✅ Restructure complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Review the changes: git status"
echo "   2. Update package.json files in each app"
echo "   3. Update import paths in code files"
echo "   4. Test locally: cd apps/frontend && npm run dev"
echo "   5. Test backend: cd apps/backend && npm start"
echo "   6. Update Railway service configurations"
echo "   7. Commit changes: git commit -m 'Restructure monorepo'"
echo "   8. Deploy to staging first!"
echo ""
