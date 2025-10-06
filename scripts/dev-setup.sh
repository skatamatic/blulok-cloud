#!/bin/bash

# BluLok Cloud Development Setup Script
set -e

echo "🚀 Setting up BluLok Cloud development environment..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18 or higher is required. Current version: $(node --version)"
    exit 1
fi

echo "✅ Prerequisites check passed"

# Install root dependencies
echo "📦 Installing root dependencies..."
npm install

# Install backend dependencies
echo "📦 Installing backend dependencies..."
cd backend && npm install && cd ..

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd frontend && npm install && cd ..

# Create environment files if they don't exist
if [ ! -f backend/.env ]; then
    echo "📝 Creating backend .env file..."
    cp backend/env.example backend/.env
    echo "⚠️  Please update backend/.env with your configuration"
fi

# Create logs directory
mkdir -p backend/logs

echo "✅ Development environment setup complete!"
echo ""
echo "🔧 Available commands:"
echo "  npm run dev           - Start both frontend and backend with hot reloading"
echo "  npm run dev:backend   - Start only backend"
echo "  npm run dev:frontend  - Start only frontend"
echo "  npm run docker:dev    - Start with Docker Compose"
echo "  npm test              - Run all tests"
echo ""
echo "📚 Next steps:"
echo "1. Update backend/.env with your database credentials"
echo "2. Run 'npm run dev' to start development servers"
echo "3. Visit http://localhost:3001 for the frontend"
echo "4. Backend API will be available at http://localhost:3000"
