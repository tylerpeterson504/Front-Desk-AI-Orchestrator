@echo off
echo Starting Front Desk AI Orchestrator...
docker-compose up -d
if errorlevel 1 exit /b %errorlevel%
echo.
echo Services started!
echo   Dashboard: http://localhost:3000
echo   Backend:   http://localhost:3001
echo.
echo Demo credentials: demo@example.com / password123 (LOCAL DEVELOPMENT ONLY)
