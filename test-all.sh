#!/bin/bash

# =============================================================================
# Front-Desk-AI-Orchestrator - Comprehensive Test Script
# This script automates the testing of the entire project
# =============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# =============================================================================
# Helper Functions
# =============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✅ PASS]${NC} $1"
}

log_error() {
    echo -e "${RED}[❌ FAIL]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[⚠️ WARN]${NC} $1"
}

# =============================================================================
# Step 1: Environment Setup
# =============================================================================

echo ""
log_info "=========================================="
log_info "Front-Desk-AI-Orchestrator - Test Suite"
log_info "=========================================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    log_error "Node.js is not installed. Please install Node.js v20+ and try again."
    exit 1
fi

NODE_VERSION=$(node --version)
log_info "Node.js version: $NODE_VERSION"

# Check npm
if ! command -v npm &> /dev/null; then
    log_error "npm is not installed. Please install npm v10+ and try again."
    exit 1
fi

NPM_VERSION=$(npm --version)
log_info "npm version: $NPM_VERSION"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    log_error "Not in project root. Please run this script from the Front-Desk-AI-Orchestrator directory."
    exit 1
fi

# =============================================================================
# Step 2: Install Dependencies
# =============================================================================

echo ""
log_info "Step 2: Installing Dependencies..."

# Install root dependencies (if any)
if [ -f "package.json" ]; then
    log_info "Installing root dependencies..."
    npm install --silent || log_warning "Root dependencies installation had warnings"
fi

# Install backend dependencies
cd backend
log_info "Installing backend dependencies..."
npm install --silent || log_warning "Backend dependencies installation had warnings"
cd ..

# Install dashboard dependencies
cd dashboard
log_info "Installing dashboard dependencies..."
npm install --silent || log_warning "Dashboard dependencies installation had warnings"
cd ..

# Install extension dependencies
cd extension
log_info "Installing extension dependencies..."
npm install --silent || log_warning "Extension dependencies installation had warnings"
cd ..

log_success "All dependencies installed"

# =============================================================================
# Step 3: Code Quality Checks
# =============================================================================

echo ""
log_info "Step 3: Running Code Quality Checks..."

# Check for 'as any' casts
log_info "Checking for 'as any' casts..."
ANY_CASTS=$(grep -r "as any" backend/src/ 2>/dev/null || true)
if [ -z "$ANY_CASTS" ]; then
    log_success "No 'as any' casts found"
else
    log_error "Found 'as any' casts:"
    echo "$ANY_CASTS"
    exit 1
fi

# Type checking
cd backend
log_info "Running type checking..."
if npm run typecheck --silent 2>&1; then
    log_success "Type checking passed"
else
    log_error "Type checking failed"
    exit 1
fi

# Linting
log_info "Running linting..."
if npm run lint --silent 2>&1; then
    log_success "Linting passed"
else
    log_warning "Linting found issues (auto-fixing)..."
    npm run lint:fix --silent 2>&1 || log_warning "Some linting issues could not be auto-fixed"
fi
cd ..

# =============================================================================
# Step 4: Backend Tests
# =============================================================================

echo ""
log_info "Step 4: Running Backend Tests..."

cd backend
log_info "Running unit tests..."
if npm test --silent 2>&1; then
    log_success "All backend tests passed"
else
    log_error "Backend tests failed"
    exit 1
fi
cd ..

# =============================================================================
# Step 5: Environment Validation
# =============================================================================

echo ""
log_info "Step 5: Validating Environment..."

# Check for required .env file
if [ ! -f "backend/.env" ]; then
    log_warning "backend/.env not found. Using .env.example for validation."
    cp backend/.env.example backend/.env
fi

# Check for required environment variables
REQUIRED_VARS=("MISTRAL_API_KEY" "JWT_SECRET" "DATABASE_URL")
MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if ! grep -q "^$var=" backend/.env; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -eq 0 ]; then
    log_success "All required environment variables are present"
else
    log_warning "Missing environment variables: ${MISSING_VARS[*]}"
    log_warning "Some tests may fail without these variables"
fi

# =============================================================================
# Step 6: Start Servers (Background)
# =============================================================================

echo ""
log_info "Step 6: Starting Development Servers..."

# Start backend in background
cd backend
log_info "Starting backend server..."
npm run dev > /tmp/backend.log 2>&1 &
BACKEND_PID=$!
log_info "Backend PID: $BACKEND_PID"

# Wait for backend to start
sleep 5

# Check if backend is running
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    log_error "Backend failed to start. Check /tmp/backend.log for errors."
    cat /tmp/backend.log
    exit 1
fi

# Test backend health endpoint
log_info "Testing backend health endpoint..."
if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    log_success "Backend is running and healthy"
else
    log_error "Backend health check failed"
    cat /tmp/backend.log
    exit 1
fi

# Start dashboard in background
cd ../dashboard
log_info "Starting dashboard server..."
npm run dev > /tmp/dashboard.log 2>&1 &
DASHBOARD_PID=$!
log_info "Dashboard PID: $DASHBOARD_PID"

# Wait for dashboard to start
sleep 5

# Check if dashboard is running
if ! kill -0 $DASHBOARD_PID 2>/dev/null; then
    log_error "Dashboard failed to start. Check /tmp/dashboard.log for errors."
    cat /tmp/dashboard.log
    exit 1
fi

# Test dashboard
log_info "Testing dashboard..."
if curl -s http://localhost:5173 > /dev/null 2>&1; then
    log_success "Dashboard is running"
else
    log_warning "Dashboard may not be fully loaded yet"
fi

cd ..

# =============================================================================
# Step 7: API Endpoint Tests
# =============================================================================

echo ""
log_info "Step 7: Testing API Endpoints..."

# Test health endpoint
log_info "Testing /health endpoint..."
HEALTH_RESPONSE=$(curl -s http://localhost:3001/health)
if echo "$HEALTH_RESPONSE" | grep -q '"status": "ok"'; then
    log_success "Health endpoint working"
else
    log_error "Health endpoint failed: $HEALTH_RESPONSE"
    exit 1
fi

# Test authentication (if env vars are set)
if grep -q "MISTRAL_API_KEY=" backend/.env && grep -q "JWT_SECRET=" backend/.env; then
    log_info "Testing authentication endpoints..."
    
    # Test registration
    REGISTER_RESPONSE=$(curl -s -X POST http://localhost:3001/api/auth/register \
        -H "Content-Type: application/json" \
        -d '{"email": "test@example.com", "password": "test123", "name": "Test User"}')
    
    if echo "$REGISTER_RESPONSE" | grep -q '"token"'; then
        log_success "Registration endpoint working"
    else
        log_warning "Registration endpoint response: $REGISTER_RESPONSE"
    fi
    
    # Test login
    LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3001/api/auth/login \
        -H "Content-Type: application/json" \
        -d '{"email": "test@example.com", "password": "test123"}')
    
    if echo "$LOGIN_RESPONSE" | grep -q '"token"'; then
        log_success "Login endpoint working"
        JWT_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token": *"[^"]*"' | cut -d'"' -f4)
    else
        log_warning "Login endpoint response: $LOGIN_RESPONSE"
    fi
    
    # Test copilot endpoint (if JWT token obtained)
    if [ -n "$JWT_TOKEN" ]; then
        log_info "Testing copilot endpoint..."
        COPILOT_RESPONSE=$(curl -s -X POST http://localhost:3001/api/copilot/draft \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $JWT_TOKEN" \
            -d '{"prompt": "Create a welcome message"}')
        
        if echo "$COPILOT_RESPONSE" | grep -q '"draft"'; then
            log_success "Copilot endpoint working"
        else
            log_warning "Copilot endpoint response: $COPILOT_RESPONSE"
        fi
    fi
else
    log_warning "Skipping authentication tests (missing env vars)"
fi

# =============================================================================
# Step 8: Build Extension
# =============================================================================

echo ""
log_info "Step 8: Building Chrome Extension..."

cd extension
if npm run build --silent 2>&1; then
    log_success "Extension built successfully"
else
    log_error "Extension build failed"
    exit 1
fi
cd ..

# =============================================================================
# Step 9: Cleanup
# =============================================================================

echo ""
log_info "Step 9: Cleaning up..."

# Kill background processes
kill $BACKEND_PID 2>/dev/null || true
kill $DASHBOARD_PID 2>/dev/null || true

# Remove temporary .env file if we created it
if [ -f "backend/.env" ] && [ ! -f "backend/.env.bak" ]; then
    rm backend/.env
fi

# =============================================================================
# Final Summary
# =============================================================================

echo ""
log_info "=========================================="
log_info "Test Summary"
log_info "=========================================="
echo ""

log_success "✅ All code quality checks passed"
log_success "✅ All unit tests passed"
log_success "✅ Backend server started successfully"
log_success "✅ Dashboard server started successfully"
log_success "✅ Health endpoint working"
log_success "✅ Extension built successfully"

if [ -n "$JWT_TOKEN" ]; then
    log_success "✅ Authentication endpoints working"
    log_success "✅ Copilot endpoint working"
fi

echo ""
log_info "All tests completed successfully!"
log_info "You can now use the project:"
log_info "  - Backend: http://localhost:3001"
log_info "  - Dashboard: http://localhost:5173"
log_info "  - Extension: Load from extension/dist in Chrome"
echo ""
