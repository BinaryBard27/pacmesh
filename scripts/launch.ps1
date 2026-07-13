$root = "D:\AI_agent game\pacmesh"
$logDir = "$root\tmp"
if (!(Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

Write-Host "Starting PacMesh Live Demo..." -ForegroundColor Cyan

# Kill any leftover node processes
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep 2

# 1) Directory server
Write-Host "[1/6] Directory server" -NoNewline
$p1 = Start-Process -PassThru -WindowStyle Normal -FilePath node -ArgumentList "src/networking/directory-server.js" -WorkingDirectory $root
Write-Host " (PID $($p1.Id))"

Start-Sleep 2

# 2) Static server
Write-Host "[2/6] Static server" -NoNewline
$p2 = Start-Process -PassThru -WindowStyle Normal -FilePath node -ArgumentList "scripts/static-server.js" -WorkingDirectory $root
Write-Host " (PID $($p2.Id))"

Start-Sleep 3

# Verify servers
try {
  $dirCheck = Invoke-WebRequest -Uri "http://localhost:9876/api/matches" -UseBasicParsing -TimeoutSec 3
  $httpCheck = Invoke-WebRequest -Uri "http://localhost:3000/test.html" -UseBasicParsing -TimeoutSec 3
  Write-Host "   Servers OK: Dir=$($dirCheck.StatusCode) HTTP=$($httpCheck.StatusCode)" -ForegroundColor Green
} catch { Write-Host "   Server check failed: $_" -ForegroundColor Red }

# 3) Agent 1 - Pac-Man (becomes coordinator)
Write-Host "[3/6] Agent 1 (Pac-Man)" -NoNewline
$p3 = Start-Process -PassThru -WindowStyle Normal -FilePath node -ArgumentList "src/agents/dummy-agent.js", "--role", "pacman" -WorkingDirectory $root
Write-Host " (PID $($p3.Id))"

Write-Host "   Waiting 14s for coordinator to register..." -ForegroundColor Yellow
Start-Sleep 14

# Check match
try {
  $m = Invoke-WebRequest -Uri "http://localhost:9876/api/matches" -UseBasicParsing -TimeoutSec 3 | ConvertFrom-Json
  Write-Host "   Match: $($m.matches[0].matchId) agents=$($m.matches[0].agents.Count)" -ForegroundColor Green
} catch { Write-Host "   No match created yet" -ForegroundColor Red }

# 4) Agent 2 - Pac-Man
Write-Host "[4/6] Agent 2 (Pac-Man)" -NoNewline
$p4 = Start-Process -PassThru -WindowStyle Normal -FilePath node -ArgumentList "src/agents/dummy-agent.js", "--role", "pacman" -WorkingDirectory $root
Write-Host " (PID $($p4.Id))"
Start-Sleep 3

# 5) Agent 3 - Ghost
Write-Host "[5/6] Agent 3 (Ghost)" -NoNewline
$p5 = Start-Process -PassThru -WindowStyle Normal -FilePath node -ArgumentList "src/agents/dummy-agent.js", "--role", "ghost" -WorkingDirectory $root
Write-Host " (PID $($p5.Id))"
Start-Sleep 3

# 6) Agent 4 - Ghost
Write-Host "[6/6] Agent 4 (Ghost)" -NoNewline
$p6 = Start-Process -PassThru -WindowStyle Normal -FilePath node -ArgumentList "src/agents/dummy-agent.js", "--role", "ghost" -WorkingDirectory $root
Write-Host " (PID $($p6.Id))"
Start-Sleep 5

# Check match status
try {
  $m = Invoke-WebRequest -Uri "http://localhost:9876/api/matches" -UseBasicParsing -TimeoutSec 3 | ConvertFrom-Json
  if ($m.matches.Count -gt 0) {
    $s = $m.matches[0]
    Write-Host "Match $($s.matchId) status=$($s.status) agents=$($s.agents.Count)" -ForegroundColor Green
  } else {
    Write-Host "No matches found (agents may have completed already)" -ForegroundColor Yellow
  }
} catch { Write-Host "Directory check failed" -ForegroundColor Red }

# Open browser
Write-Host "Opening browser..." -ForegroundColor Cyan
Start-Process "http://localhost:3000"

Write-Host "`nAll done! Check your browser at http://localhost:3000" -ForegroundColor Cyan
Write-Host "Close this window when done. Kill all: taskkill /F /IM node.exe" -ForegroundColor Magenta
