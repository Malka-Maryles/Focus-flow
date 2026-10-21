@echo off
setlocal
cd /d "%~dp0"
title FocusFlow - Start

docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running. Start Docker Desktop, wait until it says "running", then try again.
    pause
    exit /b 1
)

if not exist ".env" (
    echo [ERROR] No .env file next to this script.
    echo         Copy .env.example to .env and fill in your keys - GEMINI_API_KEY at least.
    pause
    exit /b 1
)

REM --- Server and client images: use them from this PC, else Docker Hub, else build them ---
call :ensure somejon/focus-flow:local server
if errorlevel 1 exit /b 1
call :ensure somejon/focus-flow-client:local client
if errorlevel 1 exit /b 1

echo Starting FocusFlow - database, server and client...
echo.
docker compose up -d
if errorlevel 1 (
    echo.
    echo [ERROR] docker compose failed. Scroll up for the reason, or run logs.bat.
    pause
    exit /b 1
)

echo.
echo Waiting for the server to answer...
set /a tries=0
:wait
curl -s -o nul http://localhost:8081/api/health
if not errorlevel 1 goto ready
set /a tries+=1
if %tries% geq 40 goto timeout
timeout /t 2 /nobreak >nul
goto wait

:timeout
echo [WARN] Server did not answer after about 80 seconds. Run logs.bat to see what it says.
pause
exit /b 1

:ready
echo.
echo ===========================================================
echo   FocusFlow is running
echo   Client:    http://localhost:3000/focus-flow-client/
echo   Server:    http://localhost:8081/api
echo   Database:  localhost:5432  - myuser / 123 / postgres
echo ===========================================================
start "" "http://localhost:3000/focus-flow-client/"
timeout /t 5 >nul
exit /b 0

REM ---------------------------------------------------------------
REM :ensure <image> <compose service>
:ensure
docker image inspect %~1 >nul 2>&1
if not errorlevel 1 goto :eof
echo %~1 is not on this PC - trying Docker Hub...
docker pull %~1 >nul 2>&1
if not errorlevel 1 goto :eof
echo Not on Docker Hub yet - building %~2 from GitHub. This takes a few minutes.
docker compose build %~2
if errorlevel 1 (
    echo.
    echo [ERROR] Building %~2 failed. Scroll up for the reason.
    pause
    exit /b 1
)
goto :eof
