@echo off
REM Front Desk AI - run the full test suite (Windows)
setlocal
set OVERALL=0

echo ========== BACKEND ==========
pushd backend
if not exist "node_modules" call npm ci
call npm test
if errorlevel 1 set OVERALL=1
popd

echo.
echo ========== EXTENSION ==========
pushd extension
if not exist "node_modules" call npm ci
call npm test
if errorlevel 1 set OVERALL=1
popd

echo.
if %OVERALL% equ 0 (echo ALL TESTS PASSED) else (echo SOME TESTS FAILED)
exit /b %OVERALL%
