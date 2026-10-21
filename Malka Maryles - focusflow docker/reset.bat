@echo off
cd /d "%~dp0"
title FocusFlow - Reset
echo This stops FocusFlow and DELETES the database volume ^(all users, playlists, videos^).
set /p confirm=Type YES to continue: 
if /i not "%confirm%"=="YES" (
    echo Cancelled.
    pause
    exit /b 0
)
docker compose down -v
echo Database wiped. Run start.bat for a fresh start.
pause
