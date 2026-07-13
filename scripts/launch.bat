@echo off
title PacMesh Launcher
cd /d "D:\AI_agent game\pacmesh"

echo [1/5] Starting static server (no cache, port 3000)...
start "PacMesh HTTP" node scripts\static-server.js
timeout /t 3 /nobreak >nul

echo [2/5] Starting directory server (port 9876)...
start "PacMesh Directory" node src\networking\directory-server.js
timeout /t 3 /nobreak >nul

echo [3/5] Launching Agent 1 (Pac-Man, coordinator)...
start "Agent 1 Pac-Man" node src\agents\dummy-agent.js --role pacman
echo        Waiting 12s for coordinator to register...
timeout /t 12 /nobreak >nul

echo [4/5] Launching remaining 3 agents...
start "Agent 2 Pac-Man" node src\agents\dummy-agent.js --role pacman
timeout /t 3 /nobreak >nul
start "Agent 3 Ghost" node src\agents\dummy-agent.js --role ghost
timeout /t 3 /nobreak >nul
start "Agent 4 Ghost" node src\agents\dummy-agent.js --role ghost
timeout /t 5 /nobreak >nul

echo [5/5] Opening browser...
start "" http://localhost:3000

echo.
echo ========================================
echo  All processes launched!
echo  Watch at: http://localhost:3000
echo  Close windows or Ctrl+C to stop.
echo ========================================
pause
