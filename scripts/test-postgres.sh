#!/bin/bash

# Test PostgreSQL connectivity with proper environment loading
set -e

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load environment variables
if [ -f "$PROJECT_DIR/.env" ]; then
    echo "📁 Loading environment from .env..."
    export $(grep -v '^#' "$PROJECT_DIR/.env" | xargs)
    echo "✅ Environment loaded"
else
    echo "⚠️  No .env file found at $PROJECT_DIR/.env"
fi

# Run the test
echo "🚀 Starting PostgreSQL connectivity test..."
node "$PROJECT_DIR/scripts/test-postgres.js"