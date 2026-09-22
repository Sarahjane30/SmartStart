# Run from the repo root (folder that contains pyproject.toml and ira\)
# Usage:  .\scripts\run_ira.ps1
# Start SmartStart first in another terminal (.\scripts\run_smartstart.ps1)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not (Test-Path ".\ira\__main__.py")) {
    Write-Host "ERROR: ira\ folder not found." -ForegroundColor Red
    Write-Host "You are not on the IRA branch. Run:" -ForegroundColor Yellow
    Write-Host '  git fetch origin'
    Write-Host '  git checkout cursor/ira-desktop-companion-76dd'
    Write-Host '  git pull origin cursor/ira-desktop-companion-76dd'
    Write-Host '  python -m pip install -e ".[ira]"'
    exit 1
}

Write-Host "Ensuring IRA dependencies (PySide6) ..." -ForegroundColor Cyan
python -m pip install -e ".[ira]"
if ($LASTEXITCODE -ne 0) {
    Write-Host "pip install failed. On Python 3.14 you need PySide6 >= 6.10." -ForegroundColor Red
    exit 1
}

Write-Host "Launching IRA desktop companion ..." -ForegroundColor Cyan
python -m ira
