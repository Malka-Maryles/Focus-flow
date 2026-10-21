@echo off
cd /d "%~dp0"
title FocusFlow - Logs
echo Live logs for db, server and client. Press Ctrl+C to stop watching ^(containers keep running^).
echo.
docker compose logs -f --tail=100
pause
