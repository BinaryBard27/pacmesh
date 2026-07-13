@echo off
title PacMesh Launcher
cd /d "D:\AI_agent game\pacmesh"
echo [1/6] Starting directory server on port 9876...
start "PacMesh Directory" node src\networking\directory-server.js
timeout /t 3 /nobreak >nul

echo [2/6] Starting HTTP server (port 3000)...
start "PacMesh HTTP" npx serve public -p 3000
timeout /t 5 /nobreak >nul

echo [3/6] Launching Agent 1 (Pac-Man) — this one becomes coordinator...
start "Agent 1 (Pac-Man)" node src\agents\dummy-agent.js --role pacman
echo        Waiting 12s for coordinator to register with directory...
timeout /t 12 /nobreak >nul

echo [4/6] Launching Agent 2 (Pac-Man)...
start "Agent 2 (Pac-Man)" node src\agents\dummy-agent.js --role pacman
timeout /t 2 /nobreak >nul

echo [5/6] Launching Agent 3 (Ghost)...
start "Agent 3 (Ghost)" node src\agents\dummy-agent.js --role ghost
timeout /t 2 /nobreak >nul

echo [6/6] Launching Agent 4 (Ghost)...
start "Agent 4 (Ghost)" node src\agents\dummy-agent.js --role ghost
timeout /t 5 /nobreak >nul

echo Opening browser...
start "" http://localhost:3000
echo.
echo All processes launched! Close this window or press Ctrl+C to stop.
pause
