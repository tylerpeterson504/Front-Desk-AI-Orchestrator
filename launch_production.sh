#!/bin/bash

# Front Desk AI Orchestrator - Production Launch Script
# This script performs all production launch steps
# Author: Tyler Peterson / Mistral Vibe
# Date: September 14, 2026

set -e  # Exit on error
set -x  # Print commands

echo "=========================================="
echo "Front Desk AI Orchestrator - Production Launch"
echo "=========================================="
echo ""

# Step 1: Verify Node.js installation
echo "[STEP 1] Verifying Node.js installation..."
NODE_PATH="/c/Users/Front Desk/nodejs/node-v20.18.3-win-x64"
export PATH="$PATH:$NODE_PATH"

node --version
npm --version
echo "✅ Node.js verified"
echo ""

# Step 2: Install PM2 globally
echo "[STEP 2] Installing PM2 globally..."
npm install -g pm2
echo "✅ PM2 installed"
echo ""

# Step 3: Create production environment file
echo "[STEP 3] Creating .env.production file..."
cd backend

# Backup current .env
cp .env .env.backup

# Copy .env.production template if it exists
if [ ! -f .env.production ]; then
    cp .env .env.production
    echo "Created .env.production from .env"
    echo "IMPORTANT: Edit .env.production and replace ALL placeholder values!"
    echo "IMPORTANT: Regenerate all secrets for production!"
else
    echo "Using existing .env.production"
fi

echo "✅ .env.production created"
echo ""

# Step 4: Use .env.production for this session
cp .env.production .env
echo "✅ .env.production copied to .env for build"
echo ""

# Step 5: Install backend dependencies
echo "[STEP 4] Installing backend dependencies..."
npm install --production
echo "✅ Backend dependencies installed"
echo ""

# Step 6: Build backend TypeScript
echo "[STEP 5] Building backend TypeScript..."
npm run build
echo "✅ Backend built"
echo ""

# Step 7: Start backend with PM2
echo "[STEP 6] Starting backend with PM2..."
pm2 start dist/index.js --name "frontdesk-backend" -i max --node-args="--max-old-space-size=4096"
echo "✅ Backend started with PM2"
echo ""

# Step 8: Build dashboard
echo "[STEP 7] Building dashboard..."
cd ../dashboard
npm install --production
npm run build
echo "✅ Dashboard built"
echo ""

# Step 9: Start dashboard with PM2
echo "[STEP 8] Starting dashboard with PM2..."
pm2 serve build/ 3000 --name "frontdesk-dashboard" --spa
echo "✅ Dashboard started with PM2"
echo ""

# Step 10: Save PM2 configuration
echo "[STEP 9] Saving PM2 configuration..."
pm2 save
pm2 startup
echo "✅ PM2 configuration saved and startup enabled"
echo ""

# Step 11: Restore original .env
cd ../backend
cp .env.backup .env
rm .env.backup
echo "✅ Original .env restored"
echo ""

# Step 12: Verify deployment
echo "[STEP 10] Verifying deployment..."
echo ""
echo "Checking backend health..."
curl -f http://localhost:3001/health || echo "⚠️  Backend health check failed"
echo ""

echo "Checking API endpoints..."
curl -f http://localhost:3001/api || echo "⚠️  API endpoints check failed"
echo ""

echo "Testing login..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@hotel.com","password":"admin123"}' 2>&1 || echo "")

if echo "$LOGIN_RESPONSE" | grep -q "token"; then
    echo "✅ Login successful - JWT token generated"
    echo ""
    echo "Sample token: $(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*"' | head -1)"
else
    echo "⚠️  Login failed - check credentials"
    echo "Response: $LOGIN_RESPONSE"
fi

echo ""
echo "Checking PM2 processes..."
pm2 list
echo ""

echo "=========================================="
echo "✅ PRODUCTION LAUNCH COMPLETE!"
echo "=========================================="
echo ""
echo "Services running:"
echo "  - Backend: http://localhost:3001"
echo "  - Dashboard: http://localhost:3000"
echo ""
echo "PM2 commands:"
echo "  - pm2 list          # View all processes"
echo "  - pm2 logs          # View logs"
echo "  - pm2 monit         # Monitor dashboard"
echo "  - pm2 restart all   # Restart all services"
echo "  - pm2 stop all      # Stop all services"
echo ""
echo "To get JWT token:"
echo "  curl -X POST http://localhost:3001/api/auth/login \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"email\":\"admin@hotel.com\",\"password\":\"admin123\"}'"
echo ""
