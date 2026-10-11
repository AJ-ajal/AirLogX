@echo off
title AIRLOG X - Secure IoT Dashboard
echo Starting AIRLOG X Dashboard Local Server...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_dashboard.ps1"
pause
