#!/bin/bash

# Front Desk AI Orchestrator - Development Setup Script
# This script configures the development environment

set -e

echo "🚀 Setting up Front Desk AI Orchestrator development environment..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if we're in the project root
if [ ! -f "package.json" ]; then
    echo "❌ Please run this script from the project root directory"
    exit 1
fi

# Set up Node.js path
NODE_DIR="./.nodejs/node-v22.13.0-win-x64"
if [ -d "$NODE_DIR" ]; then
    export PATH="$NODE_DIR:$PATH"
    echo "✅ Node.js v22.13.0 found and configured"
else
    echo "❌ Node.js not found in $NODE_DIR. Please install Node.js first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version)
if [[ "$NODE_VERSION" != "v22.*" ]]; then
    echo "⚠️  Warning: Node.js version $NODE_VERSION - backend requires >=22"
fi

echo ""
echo "📦 Installing root dependencies..."
npm install

echo ""
echo "🔧 Setting up individual components..."

# Backend setup
echo ""
echo "${BLUE}🏗️  Setting up Backend...${NC}"
cd backend
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "✅ Created backend/.env from .env.example"
else
    echo "✅ Backend .env already exists"
fi
npm install
echo "✅ Backend dependencies installed"
cd ..

# Dashboard setup
echo ""
echo "${BLUE}🎨 Setting up Dashboard...${NC}"
cd dashboard
if [ ! -f ".env" ]; then
    cp .env.example .env 2>/dev/null || echo "No .env.example found for dashboard"
fi
npm install
echo "✅ Dashboard dependencies installed"
cd ..

# Extension setup
echo ""
echo "${BLUE}🧩 Setting up Extension...${NC}"
cd extension
npm install
echo "✅ Extension dependencies installed"
cd ..

echo ""
echo "${GREEN}✅ All dependencies installed successfully!${NC}"
echo ""
echo "📋 Available scripts:"
echo ""
echo "  Root level:"
echo "    npm run dev              - Start backend (dev) + dashboard"
echo "    npm run start:backend    - Start backend only"
echo "    npm run start:dashboard  - Start dashboard only"
echo "    npm run test:all         - Run all tests"
echo "    npm run build:dashboard  - Build dashboard"
echo ""
echo "  Backend (cd backend):"
echo "    npm start               - Start backend server"
echo "    npm run dev             - Start with nodemon"
echo "    npm run migrate         - Run database migrations"
echo "    npm run seed            - Seed database"
echo "    npm test                - Run backend tests"
echo ""
echo "  Dashboard (cd dashboard):"
echo "    npm start               - Start development server"
echo "    npm run build           - Build for production"
echo ""
echo "  Extension (cd extension):"
echo "    npm test                - Run extension tests"
echo ""
echo "🎯 To get started:"
echo "  1. Configure backend/.env with your database and API keys"
echo "  2. Run database migrations: npm run db:migrate"
echo "  3. Start development server: npm run dev"
echo "  4. Load extension in Chrome from extension/ folder"
echo ""
echo "💡 See README.md for detailed setup instructions"