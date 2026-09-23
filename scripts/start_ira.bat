@echo off
REM Double-click this file to launch IRA (SmartStart must already be running on :8000)
cd /d "%~dp0.."
echo.
echo IRA is a DESKTOP widget - not a browser page.
echo Keep SmartStart running in another window on port 8000.
echo.
python -m pip install -e ".[ira]" >nul 2>&1
python -m ira
if errorlevel 1 pause
