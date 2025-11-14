#!/bin/bash

# Test API container connectivity to database
set -e

echo "🧪 Testing API Container Database Connectivity"
echo "=============================================="

# Check if containers are running
echo "📦 Checking container status..."
docker-compose ps

echo ""
echo "🔌 Testing API health endpoint..."
curl -f http://localhost:4000/api/health | jq . || echo "❌ API health check failed"

echo ""
echo "🗄️  Testing database operations through API..."

# Test creating a user
echo "👤 Testing user creation..."
USER_RESPONSE=$(curl -s -X POST http://localhost:4000/api/users \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"testpass"}' || echo "failed")

if [[ $USER_RESPONSE == *"testuser"* ]]; then
  echo "✅ User creation successful"
  USER_ID=$(echo $USER_RESPONSE | jq -r '.id')
  echo "   Created user ID: $USER_ID"
  
  # Test fetching the user
  echo "🔍 Testing user retrieval..."
  curl -s http://localhost:4000/api/users/$USER_ID | jq . || echo "❌ User retrieval failed"
else
  echo "❌ User creation failed: $USER_RESPONSE"
fi

echo ""
echo "📧 Testing waitlist operations..."

# Test adding to waitlist
WAITLIST_RESPONSE=$(curl -s -X POST http://localhost:4000/api/waitlist \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","interests":"testing"}' || echo "failed")

if [[ $WAITLIST_RESPONSE == *"test@example.com"* ]]; then
  echo "✅ Waitlist entry successful"
  
  # Test fetching waitlist entry
  echo "🔍 Testing waitlist retrieval..."
  curl -s http://localhost:4000/api/waitlist/test@example.com | jq . || echo "❌ Waitlist retrieval failed"
else
  echo "❌ Waitlist creation failed: $WAITLIST_RESPONSE"
fi

echo ""
echo "🧪 Testing database connectivity endpoint..."
curl -s -X POST http://localhost:4000/api/db/test | jq . || echo "❌ DB test failed"

echo ""
echo "🎉 API container connectivity test complete!"