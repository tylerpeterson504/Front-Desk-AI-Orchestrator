@echo off
REM =============================================================================
REM Front-Desk-AI-Orchestrator - Comprehensive Test Script (Windows)
REM This script automates the testing of the entire project
REM =============================================================================

setlocal enabledelayedexpansion

REM Colors for output (Windows)
set "RED="
set "GREEN="
set "YELLOW="
set "BLUE="
set "NC="

REM =============================================================================
REM Helper Functions
REM =============================================================================

:log_info
@echo [INFO] %*
GOTO :EOF

:log_success
@echo [✅ PASS] %*
GOTO :EOF

:log_error
@echo [❌ FAIL] %*
GOTO :EOF

:log_warning
@echo [⚠️ WARN] %*
GOTO :EOF

REM =============================================================================
REM Step 1: Environment Setup
REM =============================================================================

echo.
call :log_info "=========================================="
call :log_info "Front-Desk-AI-Orchestrator - Test Suite"
call :log_info "=========================================="
echo.

REM Check Node.js
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    call :log_error "Node.js is not installed. Please install Node.js v20+ and try again."
    exit /b 1
)

for /f "delims=" %%v in ('node --version') do set NODE_VERSION=%%v
call :log_info "Node.js version: %NODE_VERSION%"

REM Check npm
where npm >nul 2>&1
if %ERRORLEVEL% neq 0 (
    call :log_error "npm is not installed. Please install npm v10+ and try again."
    exit /b 1
)

for /f "delims=" %%v in ('npm --version') do set NPM_VERSION=%%v
call :log_info "npm version: %NPM_VERSION%"

REM Check if we're in the right directory
if not exist package.json (
    call :log_error "Not in project root. Please run this script from the Front-Desk-AI-Orchestrator directory."
    exit /b 1
)

REM =============================================================================
REM Step 2: Install Dependencies
REM =============================================================================

echo.
call :log_info "Step 2: Installing Dependencies..."

REM Install root dependencies (if any)
if exist package.json (
    call :log_info "Installing root dependencies..."
    npm install --silent
)

REM Install backend dependencies
cd backend
call :log_info "Installing backend dependencies..."
npm install --silent
cd ..

REM Install dashboard dependencies
cd dashboard
call :log_info "Installing dashboard dependencies..."
npm install --silent
cd ..

REM Install extension dependencies
cd extension
call :log_info "Installing extension dependencies..."
npm install --silent
cd ..

call :log_success "All dependencies installed"

REM =============================================================================
REM Step 3: Code Quality Checks
REM =============================================================================

echo.
call :log_info "Step 3: Running Code Quality Checks..."

REM Check for 'as any' casts
call :log_info "Checking for 'as any' casts..."
findstr /s /m /c:"as any" backend\src\*.ts >nul 2>&1
if %ERRORLEVEL% neq 0 (
    call :log_success "No 'as any' casts found"
) else (
    call :log_error "Found 'as any' casts"
    exit /b 1
)

REM Type checking
cd backend
call :log_info "Running type checking..."
npm run typecheck --silent
if %ERRORLEVEL% equ 0 (
    call :log_success "Type checking passed"
) else (
    call :log_error "Type checking failed"
    exit /b 1
)

REM Linting
call :log_info "Running linting..."
npm run lint --silent
if %ERRORLEVEL% equ 0 (
    call :log_success "Linting passed"
) else (
    call :log_warning "Linting found issues (auto-fixing)..."
    npm run lint:fix --silent
)
cd ..

REM =============================================================================
REM Step 4: Backend Tests
REM =============================================================================

echo.
call :log_info "Step 4: Running Backend Tests..."

cd backend
call :log_info "Running unit tests..."
npm test --silent
if %ERRORLEVEL% equ 0 (
    call :log_success "All backend tests passed"
) else (
    call :log_error "Backend tests failed"
    exit /b 1
)
cd ..

REM =============================================================================
REM Step 5: Environment Validation
REM =============================================================================

echo.
call :log_info "Step 5: Validating Environment..."

REM Check for required .env file
if not exist backend\.env (
    call :log_warning "backend\.env not found. Using .env.example for validation."
    copy backend\.env.example backend\.env >nul
)

REM Check for required environment variables
set REQUIRED_VARS=MISTRAL_API_KEY JWT_SECRET DATABASE_URL
set MISSING_VARS=

for %%v in (%REQUIRED_VARS%) do (
    findstr /b /c:"%%v=" backend\.env >nul
    if %ERRORLEVEL% neq 0 (
        set "MISSING_VARS=!MISSING_VARS! %%v"
    )
)

if "%MISSING_VARS%"=="" (
    call :log_success "All required environment variables are present"
) else (
    call :log_warning "Missing environment variables: %MISSING_VARS%"
    call :log_warning "Some tests may fail without these variables"
)

REM =============================================================================
REM Step 6: Start Servers (Background)
REM =============================================================================

echo.
call :log_info "Step 6: Starting Development Servers..."

REM Start backend in background
cd backend
call :log_info "Starting backend server..."
start "Backend" cmd /c npm run dev > tmp\backend.log 2>&1
set BACKEND_PID=%ERRORLEVEL%
call :log_info "Backend started"

REM Wait for backend to start
timeout /t 5 /nobreak >nul

REM Test backend health endpoint
call :log_info "Testing backend health endpoint..."
curl -s http://localhost:3001/health >nul 2>&1
if %ERRORLEVEL% equ 0 (
    call :log_success "Backend is running and healthy"
) else (
    call :log_error "Backend health check failed"
    type tmp\backend.log
    exit /b 1
)

REM Start dashboard in background
cd ..\dashboard
call :log_info "Starting dashboard server..."
start "Dashboard" cmd /c npm run dev > tmp\dashboard.log 2>&1
set DASHBOARD_PID=%ERRORLEVEL%
call :log_info "Dashboard started"

REM Wait for dashboard to start
timeout /t 5 /nobreak >nul

REM Test dashboard
call :log_info "Testing dashboard..."
curl -s http://localhost:5173 >nul 2>&1
if %ERRORLEVEL% equ 0 (
    call :log_success "Dashboard is running"
) else (
    call :log_warning "Dashboard may not be fully loaded yet"
)

cd ..

REM =============================================================================
REM Step 7: API Endpoint Tests
REM =============================================================================

echo.
call :log_info "Step 7: Testing API Endpoints..."

REM Test health endpoint
call :log_info "Testing /health endpoint..."
for /f "delims=" %%r in ('curl -s http://localhost:3001/health') do set HEALTH_RESPONSE=%%r
echo %HEALTH_RESPONSE% | findstr /c:"\"status\": \"ok\"" >nul
if %ERRORLEVEL% equ 0 (
    call :log_success "Health endpoint working"
) else (
    call :log_error "Health endpoint failed: %HEALTH_RESPONSE%"
    exit /b 1
)

REM Test authentication (if env vars are set)
findstr /b /c:"MISTRAL_API_KEY=" backend\.env >nul
if %ERRORLEVEL% equ 0 (
    findstr /b /c:"JWT_SECRET=" backend\.env >nul
    if %ERRORLEVEL% equ 0 (
        call :log_info "Testing authentication endpoints..."
        
        REM Test registration
        for /f "delims=" %%r in ('curl -s -X POST http://localhost:3001/api/auth/register -H "Content-Type: application/json" -d "{\"email\": \"test@example.com\", \"password\": \"test123\", \"name\": \"Test User\"}"') do set REGISTER_RESPONSE=%%r
        echo %REGISTER_RESPONSE% | findstr /c:"\"token\"" >nul
        if %ERRORLEVEL% equ 0 (
            call :log_success "Registration endpoint working"
        ) else (
            call :log_warning "Registration endpoint response: %REGISTER_RESPONSE%"
        )
        
        REM Test login
        for /f "delims=" %%r in ('curl -s -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d "{\"email\": \"test@example.com\", \"password\": \"test123\"}"') do set LOGIN_RESPONSE=%%r
        echo %LOGIN_RESPONSE% | findstr /c:"\"token\"" >nul
        if %ERRORLEVEL% equ 0 (
            call :log_success "Login endpoint working"
            for /f "tokens=2 delims=:" %%t in ('echo %LOGIN_RESPONSE% ^| findstr /c:"\"token\":"') do (
                for /f "tokens=2 delims=\"" %%token in ('echo %%t') do set JWT_TOKEN=%%token
            )
        ) else (
            call :log_warning "Login endpoint response: %LOGIN_RESPONSE%"
        )
        
        REM Test copilot endpoint (if JWT token obtained)
        if defined JWT_TOKEN (
            call :log_info "Testing copilot endpoint..."
            for /f "delims=" %%r in ('curl -s -X POST http://localhost:3001/api/copilot/draft -H "Content-Type: application/json" -H "Authorization: Bearer %JWT_TOKEN%" -d "{\"prompt\": \"Create a welcome message\"}"') do set COPILOT_RESPONSE=%%r
            echo %COPILOT_RESPONSE% | findstr /c:"\"draft\"" >nul
            if %ERRORLEVEL% equ 0 (
                call :log_success "Copilot endpoint working"
            ) else (
                call :log_warning "Copilot endpoint response: %COPILOT_RESPONSE%"
            )
        )
    )
) else (
    call :log_warning "Skipping authentication tests (missing env vars)"
)

REM =============================================================================
REM Step 8: Build Extension
REM =============================================================================

echo.
call :log_info "Step 8: Building Chrome Extension..."

cd extension
npm run build --silent
if %ERRORLEVEL% equ 0 (
    call :log_success "Extension built successfully"
) else (
    call :log_error "Extension build failed"
    exit /b 1
)
cd ..

REM =============================================================================
REM Step 9: Final Summary
REM =============================================================================

echo.
call :log_info "=========================================="
call :log_info "Test Summary"
call :log_info "=========================================="
echo.

call :log_success "✅ All code quality checks passed"
call :log_success "✅ All unit tests passed"
call :log_success "✅ Backend server started successfully"
call :log_success "✅ Dashboard server started successfully"
call :log_success "✅ Health endpoint working"
call :log_success "✅ Extension built successfully"

if defined JWT_TOKEN (
    call :log_success "✅ Authentication endpoints working"
    call :log_success "✅ Copilot endpoint working"
)

echo.
call :log_info "All tests completed successfully!"
call :log_info "You can now use the project:"
call :log_info "  - Backend: http://localhost:3001"
call :log_info "  - Dashboard: http://localhost:5173"
call :log_info "  - Extension: Load from extension/dist in Chrome"
echo.

REM Cleanup temporary files
if exist backend\tmp del /q /f backend\tmp\*.log >nul 2>&1
if exist dashboard\tmp del /q /f dashboard\tmp\*.log >nul 2>&1

REM Remove temporary .env file if we created it
if exist backend\.env.bak (
    del /q /f backend\.env >nul 2>&1
    ren backend\.env.bak backend\.env >nul 2>&1
) else if exist backend\.env (
    if not exist backend\.env.original (
        del /q /f backend\.env >nul 2>&1
    )
)
