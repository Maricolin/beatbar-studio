$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$pythonExe = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
if (-not (Test-Path $pythonExe)) {
    Write-Host 'Creating Python virtual environment...'
    $systemPython = Get-Command python -ErrorAction SilentlyContinue
    if (-not $systemPython) { throw 'Python 3.11+ is required. Install Python and enable Add Python to PATH.' }
    & $systemPython.Source -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Virtual environment creation failed.' }
}
& $pythonExe -c "import fastapi, uvicorn, numpy, scipy, PIL, imageio_ffmpeg, multipart"
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Installing media engine dependencies (first launch requires internet)...'
    & $pythonExe -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check your internet connection and retry.' }
}
Write-Host ''
Write-Host 'BeatBar Studio: http://127.0.0.1:8000' -ForegroundColor Green
Write-Host 'Keep this window open. Press Ctrl+C to stop.'
Start-Process -FilePath $pythonExe -ArgumentList 'launch_browser.py' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
& $pythonExe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
exit $LASTEXITCODE
