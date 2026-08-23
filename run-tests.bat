@echo off
REM Front Desk AI - Test Execution Script (Windows)
REM Runs all tests and generates a comprehensive report

echo.
echo ==========================================
echo Front Desk AI - Test Suite Execution
echo ==========================================
echo.

setlocal enabledelayedexpansion

REM Track overall status
set OVERALL_STATUS=0

REM Backend Tests
echo ========== BACKEND TESTS ==========
echo.

cd backend

REM Install dependencies if needed
if not exist "node_modules" (
    echo Installing backend dependencies...
    call npm install
)

REM Run auth tests
echo Running: Authentication Tests
call npm run test:auth
if errorlevel 1 (
    echo X Authentication Tests FAILED
    set OVERALL_STATUS=1
) else (
    echo - Authentication Tests PASSED
)
echo.

REM Run properties tests
echo Running: Properties Tests
call npm run test:properties
if errorlevel 1 (
    echo X Properties Tests FAILED
    set OVERALL_STATUS=1
) else (
    echo - Properties Tests PASSED
)
echo.

REM Run templates tests
echo Running: Templates Tests
call npm run test:templates
if errorlevel 1 (
    echo X Templates Tests FAILED
    set OVERALL_STATUS=1
) else (
    echo - Templates Tests PASSED
)
echo.

REM Run all backend tests with coverage
echo Running Full Backend Test Suite with Coverage
call npm test -- --coverage
if errorlevel 1 (
    echo X Full Backend Tests FAILED
    set OVERALL_STATUS=1
) else (
    echo - Full Backend Tests PASSED
)
echo.

echo ========== EXTENSION TESTS ==========
echo.

cd ..\extension

REM Install dependencies if needed
if not exist "node_modules" (
    echo Installing extension dependencies...
    call npm install
)

REM Run content scripts tests
echo Running: Content Scripts Tests
call npm test -- content-scripts.test.js
if errorlevel 1 (
    echo X Content Scripts Tests FAILED
    set OVERALL_STATUS=1
) else (
    echo - Content Scripts Tests PASSED
)
echo.

REM Run sidepanel tests
echo Running: Sidepanel Tests
call npm test -- sidepanel.test.js
if errorlevel 1 (
    echo X Sidepanel Tests FAILED
    set OVERALL_STATUS=1
) else (
    echo - Sidepanel Tests PASSED
)
echo.

REM Run all extension tests with coverage
echo Running Full Extension Test Suite with Coverage
call npm test -- --coverage
if errorlevel 1 (
    echo X Full Extension Tests FAILED
    set OVERALL_STATUS=1
) else (
    echo - Full Extension Tests PASSED
)
echo.

echo ==========================================
echo Test Execution Summary
echo ==========================================
echo.

if !OVERALL_STATUS! equ 0 (
    echo - ALL TESTS PASSED
    echo.
    echo Summary:
    echo   - Backend Tests: PASSED
    echo   - Extension Tests: PASSED
    echo   - Coverage reports generated
    echo.
    echo Next Steps:
    echo   1. Review coverage reports in backend/coverage/
    echo   2. Review coverage reports in extension/coverage/
    echo   3. Commit passing tests to git
) else (
    echo - SOME TESTS FAILED
    echo.
    echo Actions:
    echo   1. Review failed test output above
    echo   2. Check test files in backend/tests/ or extension/tests/
    echo   3. Verify dependencies are installed
    echo   4. Ensure database migrations are run
)

echo.
echo ==========================================
echo Report Generated: %date% %time%
echo ==========================================
echo.

exit /b !OVERALL_STATUS!
