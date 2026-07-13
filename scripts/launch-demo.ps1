Write-Host "=== Starting PacMesh Live Demo ===" -ForegroundColor Cyan
$DIR = "D:\AI_agent game\pacmesh"

Write-Host "[1/6] Starting directory server..." -ForegroundColor Green
$dir = Start-Process -PassThru powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$DIR'; node src/networking/directory-server.js"
Start-Sleep 2

Write-Host "[2/6] Starting HTTP server (port 3000)..." -ForegroundColor Green
$http = Start-Process -PassThru powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$DIR'; npx serve public -p 3000"
Start-Sleep 3

Write-Host "[3/6] Launching Agent 1 (Pac-Man)..." -ForegroundColor Yellow
$agent1 = Start-Process -PassThru powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$DIR'; node src/agents/dummy-agent.js --role pacman"
Start-Sleep 2

Write-Host "[4/6] Launching Agent 2 (Pac-Man)..." -ForegroundColor Yellow
$agent2 = Start-Process -PassThru powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$DIR'; node src/agents/dummy-agent.js --role pacman"
Start-Sleep 2

Write-Host "[5/6] Launching Agent 3 (Ghost)..." -ForegroundColor Red
$agent3 = Start-Process -PassThru powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$DIR'; node src/agents/dummy-agent.js --role ghost"
Start-Sleep 2

Write-Host "[6/6] Launching Agent 4 (Ghost)..." -ForegroundColor Red
$agent4 = Start-Process -PassThru powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$DIR'; node src/agents/dummy-agent.js --role ghost"

Write-Host ""
Write-Host "All processes launched!" -ForegroundColor Cyan
Write-Host "Opening browser to http://localhost:3000" -ForegroundColor Cyan
Start-Process http://localhost:3000

Write-Host ""
Write-Host "To clean up later, run: Get-Process -Name node | Stop-Process" -ForegroundColor Magenta
