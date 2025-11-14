#!/usr/bin/env bash
# Production build script for Render deployment
set -e

echo "🏗️  Starting production build..."

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf dist/

# Install dependencies
echo "📦 Installing dependencies..."
npm ci

# Build the application
echo "🔨 Building application..."
npm run build

# Verify build artifacts exist
echo "✅ Verifying build artifacts..."
if [ ! -d "dist/public" ]; then
  echo "❌ Client build failed - dist/public not found"
  exit 1
fi

if [ ! -f "dist/index.js" ]; then
  echo "❌ Server build failed - dist/index.js not found"
  exit 1
fi

echo "🎉 Production build completed successfully!"
echo "📁 Build artifacts:"
ls -la dist/

echo ""
echo "🚀 Ready for deployment!"
echo "📊 Bundle sizes:"
echo "   Client: $(du -sh dist/public | cut -f1)"
echo "   Server: $(du -sh dist/index.js | cut -f1)"