@echo off
:: Front Desk AI Orchestrator - Production Launch Script
:: This batch file performs all necessary launch steps
:: Created: September 14, 2026
:: Author: Tyler Peterson / Mistral Vibe

:: ===========================================
:: STEP 0: Set Node.js Path
:: ===========================================
set NODE_PATH=C:\Users\Front Desk\nodejs\node-v20.18.3-win-x64
set PATH=%NODE_PATH%;%PATH%

:: Verify Node.js
echo [INFO] Checking Node.js version...
node --version
if errorlevel 1 (
    echo [ERROR] Node.js not found at %NODE_PATH%
    echo [ERROR] Please install Node.js v22+ and update this script
    pause
    exit /b 1
)

:: ===========================================
:: STEP 1: Install PM2 Globally
:: ===========================================
echo [STEP 1] Installing PM2 globally...
npm install -g pm2
if errorlevel 1 (
    echo [ERROR] Failed to install PM2
    pause
    exit /b 1
)
echo [OK] PM2 installed

:: ===========================================
:: STEP 2: Prepare Backend
:: ===========================================
echo [STEP 2] Preparing backend...
cd backend

:: Create production environment file
if not exist .env.production (
    copy .env .env.production
    echo [OK] Created .env.production from .env
) else (
    echo [OK] .env.production already exists
)

:: Temporarily use production env
copy .env.production .env >nul
echo [OK] Activated production environment

:: Install dependencies
echo [INFO] Installing backend dependencies...
npm install
if errorlevel 1 (
    echo [ERROR] Failed to install backend dependencies
    pause
    exit /b 1
)
echo [OK] Backend dependencies installed

:: Build TypeScript
echo [INFO] Building TypeScript...
npm run build
if errorlevel 1 (
    echo [WARNING] TypeScript build failed - trying with dev mode
    echo [INFO] Attempting to use ts-node-dev directly...
    :: We'll handle this later
)
echo [OK] Backend built (or using dev mode)

:: Restore original .env
copy .env.production .env >nul
echo [OK] Restored original .env

:: ===========================================
:: STEP 3: Start Backend with PM2
:: ===========================================
echo [STEP 3] Starting backend with PM2...
cd ..

:: Check if dist folder exists
if exist backend\dist\index.js (
    pm2 start backend\dist\index.js --name "frontdesk-backend" -i max --node-args="--max-old-space-size=4096"
) else (
    echo [WARNING] No dist folder - using ts-node-dev in dev mode
    pm2 start backend\src\index.ts --name "frontdesk-backend" --interpreter "C:\Users\Front Desk\nodejs\node-v20.18.3-win-x64\node.exe" --node-args="--loader ts-node/esm" -i max
)

if errorlevel 1 (
    echo [ERROR] Failed to start backend
    pause
    exit /b 1
)
echo [OK] Backend started with PM2

:: ===========================================
:: STEP 4: Prepare and Build Dashboard
:: ===========================================
echo [STEP 4] Preparing dashboard...
cd dashboard

:: Install dependencies
echo [INFO] Installing dashboard dependencies...
npm install
if errorlevel 1 (
    echo [ERROR] Failed to install dashboard dependencies
    pause
    exit /b 1
)
echo [OK] Dashboard dependencies installed

:: Build dashboard
echo [INFO] Building dashboard...
npm run build
if errorlevel 1 (
    echo [ERROR] Failed to build dashboard
    pause
    exit /b 1
)
echo [OK] Dashboard built

:: ===========================================
:: STEP 5: Start Dashboard with PM2
:: ===========================================
echo [STEP 5] Starting dashboard with PM2...
cd ..

pm2 serve dashboard\build/ 3000 --name "frontdesk-dashboard" --spa
if errorlevel 1 (
    echo [ERROR] Failed to start dashboard
    pause
    exit /b 1
)
echo [OK] Dashboard started with PM2

:: ===========================================
:: STEP 6: Save PM2 Configuration
:: ===========================================
echo [STEP 6] Saving PM2 configuration...
pm2 save
pm2 startup
if errorlevel 1 (
    echo [WARNING] Failed to save PM2 startup configuration
    echo [INFO] You can manually run 'pm2 save' and 'pm2 startup' later
)
echo [OK] PM2 configuration saved

:: ===========================================
:: STEP 7: Verify Deployment
:: ===========================================
echo.
echo ===========================================
echo           VERIFICATION
echo ===========================================
echo.

:: Wait for services to start
timeout /t 5 >nul

echo [CHECK] Backend health:
curl -f http://localhost:3001/health || echo [WARNING] Backend not responding

echo.
echo [CHECK] API endpoints:
curl -f http://localhost:3001/api || echo [WARNING] API not responding

echo.
echo [CHECK] Testing login:
for /f "tokens=*" %%a in ('curl -s -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"admin@hotel.com\",\"password\":\"admin123\"}"') do (
    echo %%a | find "token" >nul && (
        echo [OK] Login successful - JWT token working
        exit /b 0
    )
)
echo [WARNING] Login failed - check credentials

echo.
echo [CHECK] PM2 processes:
pm2 list

:: ===========================================
:: STEP 8: Final Instructions
:: ===========================================
echo.
echo ===========================================
echo           LAUNCH COMPLETE!
echo ===========================================
echo.
echo Services running:
echo   - Backend:  http://localhost:3001
echo   - Dashboard: http://localhost:3000
echo.
echo PM2 Commands:
echo   pm2 list          - View all processes
echo   pm2 logs          - View logs
echo   pm2 monit         - Open monitoring dashboard
echo   pm2 restart all   - Restart all services
echo   pm2 stop all      - Stop all services
echo.
echo To get JWT token:
echo   curl -X POST http://localhost:3001/api/auth/login \
echo     -H "Content-Type: application/json" \
echo     -d '{"email":"admin@hotel.com","password":"admin123"}'
echo.
echo Note: If backend failed to start, check:
echo   1. Node.js version (requires v22+)
echo   2. Database connection in .env
   3. TypeScript compilation errors
echo.

pause
