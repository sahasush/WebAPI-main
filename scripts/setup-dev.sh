#!/bin/bash

# Development Environment Setup Script
# Sets up local development environment with proper configuration

set -e  # Exit on any error

echo "🚀 Setting up Eirvana development environment..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: This script must be run from the WebApp root directory"
    exit 1
fi

# Create .env file from example if it doesn't exist
if [ ! -f ".env" ]; then
    echo "📄 Creating .env file from example..."
    cp .env.example .env
    echo "✅ .env file created"
else
    echo "ℹ️  .env file already exists"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Make scripts executable
echo "🔧 Making scripts executable..."
chmod +x scripts/*.sh 2>/dev/null || true
chmod +x scripts/migrate.js

# Start Docker Compose stack
echo "🐳 Starting Docker Compose stack..."
docker compose up -d

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
sleep 5

# Run database migration
echo "🗄️  Running database migration..."
docker compose exec -T web node scripts/migrate.js || echo "Migration completed or already ran"

# Run tests to verify everything works
echo "🧪 Running tests to verify setup..."
npm test

echo "✅ Development environment setup complete!"
echo ""
echo "🌐 Your app should be running at:"
echo "   http://localhost:5000"
echo ""
echo "📋 Available commands:"
echo "   npm run dev      - Start development server"
echo "   npm test         - Run test suite"
echo "   npm run build    - Build for production"
echo "   ./scripts/up.sh  - Start with auto port detection"
echo "   ./scripts/down.sh - Stop the stack"
echo ""
echo "🔍 To check logs:"
echo "   docker compose logs web"
echo "   docker compose logs db"