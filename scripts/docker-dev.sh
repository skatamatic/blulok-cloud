#!/bin/bash

# BluLok Cloud Docker Development Script
set -e

echo "🐳 Starting BluLok Cloud with Docker..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Clean up any existing containers
echo "🧹 Cleaning up existing containers..."
docker-compose -f docker-compose.dev.yml down --remove-orphans

# Build and start services
echo "🚀 Building and starting services..."
docker-compose -f docker-compose.dev.yml up --build --remove-orphans

echo "✅ Docker development environment started!"
echo ""
echo "🌐 Services available at:"
echo "  Frontend: http://localhost:3001"
echo "  Backend:  http://localhost:3000"
echo "  MySQL:    localhost:3306"
echo "  Redis:    localhost:6379"
echo ""
echo "🛑 To stop: Ctrl+C or 'docker-compose -f docker-compose.dev.yml down'"
