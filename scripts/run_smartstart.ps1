# Run from the repo root (folder that contains pyproject.toml and ira\)
# Usage:  .\scripts\run_smartstart.ps1

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host "Starting SmartStart API on http://127.0.0.1:8000 ..." -ForegroundColor Cyan
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
