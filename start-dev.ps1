$ErrorActionPreference = 'Stop'

$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$foodAppDir = Join-Path $rootDir 'food_app'
$pythonExe = Join-Path $rootDir 'venv\Scripts\python.exe'

if (-not (Test-Path $pythonExe)) {
    Write-Error "Virtual environment Python not found: $pythonExe"
}

if (-not (Test-Path $foodAppDir)) {
    Write-Error "food_app directory not found: $foodAppDir"
}

$mkdocsCommand = "Set-Location '$rootDir'; & '$pythonExe' -m mkdocs serve"
$flaskCommand = "Set-Location '$foodAppDir'; & '$pythonExe' app.py"

Start-Process -FilePath 'powershell.exe' -ArgumentList @(
    '-NoExit',
    '-ExecutionPolicy', 'Bypass',
    '-Command', $mkdocsCommand
) | Out-Null

Start-Process -FilePath 'powershell.exe' -ArgumentList @(
    '-NoExit',
    '-ExecutionPolicy', 'Bypass',
    '-Command', $flaskCommand
) | Out-Null

Write-Host 'Started two windows:'
Write-Host '1) MkDocs dev server'
Write-Host '2) Flask server (food_app)'
