#!/bin/bash

# Front Desk AI Orchestrator - Setup Verification Script
# Verifies that all components are properly configured

# Don't exit on error - we want to check everything
set +e

echo "🔍 Verifying Front Desk AI Orchestrator setup..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
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
else
    echo "❌ Node.js not found in $NODE_DIR"
    exit 1
fi

SUCCESS_COUNT=0
TOTAL_CHECKS=0

check() {
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    if [ $? -eq 0 ]; then
        echo "✅ $1"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
        echo "❌ $1"
    fi
}

echo ""
echo "📋 Checking Node.js and npm..."

node --version > /dev/null 2>&1
check "Node.js is available"

npm --version > /dev/null 2>&1
check "npm is available"

NODE_VERSION=$(node --version)
NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/^v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -ge 22 ]; then
    echo "✅ Node.js version is >=22 ($NODE_VERSION)"
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
else
    echo "❌ Node.js version is $NODE_VERSION (requires >=22)"
fi
TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

echo ""
echo "📦 Checking project structure..."

[ -d "backend" ] && check "Backend directory exists"
[ -d "dashboard" ] && check "Dashboard directory exists"
[ -d "extension" ] && check "Extension directory exists"

[ -f "backend/package.json" ] && check "Backend package.json exists"
[ -f "dashboard/package.json" ] && check "Dashboard package.json exists"
[ -f "extension/package.json" ] && check "Extension package.json exists"
[ -f "package.json" ] && check "Root package.json exists"

echo ""
echo "📋 Checking configuration files..."

[ -f "backend/.env" ] && check "Backend .env exists"
[ -f "dashboard/.env" ] && check "Dashboard .env exists"
[ -f "extension/src/config.js" ] && check "Extension config.js exists"

echo ""
echo "📦 Checking dependencies..."

cd backend
npm list > /dev/null 2>&1
check "Backend dependencies installed"
cd ..

cd dashboard
npm list > /dev/null 2>&1
check "Dashboard dependencies installed"
cd ..

cd extension
npm list > /dev/null 2>&1
check "Extension dependencies installed"
cd ..

[ -f "node_modules/concurrently/package.json" ] && check "Concurrently installed (for parallel execution)"

echo ""
echo "🔍 Checking environment configuration..."

# Check backend .env has required variables
if [ -f "backend/.env" ]; then
    grep -q "PORT=" backend/.env && check "Backend PORT configured"
    grep -q "JWT_SECRET=" backend/.env && check "JWT_SECRET configured"
    grep -q "DB_HOST=" backend/.env && check "Database host configured"
fi

# Check dashboard .env
if [ -f "dashboard/.env" ]; then
    grep -q "REACT_APP_API_URL=" dashboard/.env && check "Dashboard API URL configured"
    grep -q "PORT=" dashboard/.env && check "Dashboard PORT configured"
fi

echo ""
echo "📋 Checking API connectivity configuration..."

# Check if backend API URL matches dashboard expectation
if [ -f "backend/.env" ] && [ -f "dashboard/.env" ]; then
    BACKEND_PORT=$(grep "^PORT=" backend/.env | cut -d'=' -f2)
    DASHBOARD_API=$(grep "^REACT_APP_API_URL=" dashboard/.env | cut -d'=' -f2)
    
    if [[ "$DASHBOARD_API" == *":$BACKEND_PORT"* ]]; then
        echo "✅ Dashboard API URL matches backend port ($BACKEND_PORT)"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
        echo "⚠️  Dashboard API URL ($DASHBOARD_API) may not match backend port ($BACKEND_PORT)"
    fi
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
fi

echo ""
echo "🎯 Checking extension configuration..."

if [ -f "extension/src/config.js" ]; then
    if grep -q "DEFAULT_API_BASE_URL.*localhost:3001" extension/src/config.js; then
        echo "✅ Extension configured for localhost:3001"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
        echo "⚠️  Extension may not be configured for localhost development"
    fi
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
fi

echo ""
echo "🚀 Checking available scripts..."

[ -f "setup-dev.sh" ] && check "Setup script exists"
[ -f "DEVELOPMENT.md" ] && check "Development guide exists"

# Test if scripts are available
npm run dev > /dev/null 2>&1
check "Development script available"

npm run start:backend > /dev/null 2>&1
check "Backend start script available"

npm run start:dashboard > /dev/null 2>&1
check "Dashboard start script available"

echo ""
echo "📊 Setup Summary"
echo "================"
echo "Checks passed: $SUCCESS_COUNT/$TOTAL_CHECKS"
echo ""

if [ $SUCCESS_COUNT -eq $TOTAL_CHECKS ]; then
    echo "${GREEN}✅ All checks passed! Your project is ready for development.${NC}"
    echo ""
    echo "🎯 To get started:"
    echo "  1. Configure your database in backend/.env"
    echo "  2. Run database migrations: npm run db:migrate"
    echo "  3. Start development server: npm run dev"
    echo "  4. Load extension in Chrome from extension/ folder"
    exit 0
elif [ $SUCCESS_COUNT -ge $((TOTAL_CHECKS * 80 / 100)) ]; then
    echo "${YELLOW}⚠️  Most checks passed, but there are some issues to resolve.${NC}"
    echo "Please review the failed checks above."
    exit 1
else
    echo "${RED}❌ Many checks failed. Please run setup-dev.sh to fix issues.${NC}"
    exit 1
fi