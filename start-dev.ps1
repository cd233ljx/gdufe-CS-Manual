$ErrorActionPreference = 'Stop'

$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$foodAppDir = Join-Path $rootDir 'food_app'
$venvPythonExe = Join-Path $rootDir 'venv\Scripts\python.exe'
$pythonExe = $venvPythonExe

function Test-PythonEnvironment {
    param([string]$PythonPath)

    try {
        & $PythonPath -c "import flask, mkdocs" 2>$null
        return $LASTEXITCODE -eq 0
    }
    catch {
        return $false
    }
}

if (-not (Test-Path $venvPythonExe)) {
    Write-Error "Virtual environment Python not found: $venvPythonExe"
}

if (-not (Test-PythonEnvironment $venvPythonExe)) {
    $fallbackPython = (Get-Command python -ErrorAction SilentlyContinue)

    if ($fallbackPython -and (Test-PythonEnvironment $fallbackPython.Source)) {
        $pythonExe = $fallbackPython.Source
        Write-Warning "venv Python is not usable, falling back to system Python: $pythonExe"
    }
    else {
        Write-Error "venv Python exists but cannot import Flask/MkDocs. Rebuild the venv or fix venv\pyvenv.cfg: $venvPythonExe"
    }
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
