@echo off
echo Running tests in Docker containers...
echo.
echo --- Backend Tests ---
docker-compose exec backend npm test
if errorlevel 1 exit /b %errorlevel%
echo.
echo --- Tests complete ---
