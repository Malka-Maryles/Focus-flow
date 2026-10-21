@echo off
cd /d "%~dp0"
title FocusFlow - Stop
echo Stopping FocusFlow ^(your database data is kept^)...
docker compose down
echo Done.
pause
