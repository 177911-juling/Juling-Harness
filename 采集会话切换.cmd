@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Juling Harness Session Performance Capture
powershell.exe -NoProfile -File scripts\capture-session-switch.ps1
echo.
pause
