#!/bin/bash

# NFT Education Platform Startup Script
echo "🚀 Starting NFT Education Platform..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Create necessary directories
echo "📁 Creating necessary directories..."
mkdir -p ai-service/models/cache
mkdir -p backend/logs

# Start the services
echo "🐳 Starting Docker containers..."
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 10

# Check service health
echo "🔍 Checking service health..."

# Check MongoDB
if docker-compose exec -T mongodb mongo --eval "db.stats()" > /dev/null 2>&1; then
    echo "✅ MongoDB is running"
else
    echo "❌ MongoDB failed to start"
fi

# Check Redis
if docker-compose exec -T redis redis-cli ping | grep -q PONG; then
    echo "✅ Redis is running"
else
    echo "❌ Redis failed to start"
fi

# Check Backend
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Backend API is running"
else
    echo "❌ Backend API failed to start"
fi

# Check Frontend
if curl -f http://localhost:3001 > /dev/null 2>&1; then
    echo "✅ Frontend is running"
else
    echo "❌ Frontend failed to start"
fi

# Check AI Service
if curl -f http://localhost:8000/health > /dev/null 2>&1; then
    echo "✅ AI Service is running"
else
    echo "❌ AI Service failed to start"
fi

echo ""
echo "🎉 NFT Education Platform started successfully!"
echo ""
echo "📋 Service URLs:"
echo "  • Frontend:     http://localhost:3001"
echo "  • Backend API:  http://localhost:3000"
echo "  • AI Service:   http://localhost:8000"
echo "  • API Docs:     http://localhost:3000/api-docs"
echo ""
echo "🛠️  Useful commands:"
echo "  • View logs:    docker-compose logs -f"
echo "  • Stop all:     docker-compose down"
echo "  • Restart:      docker-compose restart"
echo ""
echo "📖 First time setup:"
echo "  1. Visit http://localhost:3001"
echo "  2. Click 'Register' to create an account"
echo "  3. Check your email for verification"
echo "  4. Start exploring courses!"
