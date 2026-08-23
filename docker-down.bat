@echo off
echo Stopping Front Desk AI Orchestrator...
docker-compose down
if errorlevel 1 exit /b %errorlevel%
echo All services stopped.
