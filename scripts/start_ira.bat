@echo off
REM Finds the SmartStart repo (folder with pyproject.toml + ira\) under %USERPROFILE%
REM then launches IRA. Keep SmartStart (uvicorn) running in another window.

setlocal
echo Searching for SmartStart + IRA...
for /f "delims=" %%i in ('dir /s /b "%USERPROFILE%\SmartStart\pyproject.toml" 2^>nul') do (
  if exist "%%~dpiira\__main__.py" (
    echo Found: %%~dpi
    cd /d "%%~dpi"
    goto :found
  )
)
echo ERROR: Could not find a SmartStart folder that contains ira\
echo Expected something like:
echo   C:\Users\%USERNAME%\SmartStart\SmartStart\SmartStart\SmartStart
pause
exit /b 1

:found
echo.
echo Installing / updating IRA deps...
python -m pip install -e ".[ira]"
echo.
echo Launching IRA desktop widget (not a browser page)...
python -m ira
if errorlevel 1 pause
