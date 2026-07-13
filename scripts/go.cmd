@start "PacMesh Dir" node "D:\AI_agent game\pacmesh\src\networking\directory-server.js"
@start "PacMesh HTTP" node "D:\AI_agent game\pacmesh\scripts\static-server.js"
@timeout /t 5 /nobreak >nul
@start "Agent 1" node "D:\AI_agent game\pacmesh\src\agents\dummy-agent.js" --role pacman
@timeout /t 14 /nobreak >nul
@start "Agent 2" node "D:\AI_agent game\pacmesh\src\agents\dummy-agent.js" --role pacman
@timeout /t 3 /nobreak >nul
@start "Agent 3" node "D:\AI_agent game\pacmesh\src\agents\dummy-agent.js" --role ghost
@timeout /t 3 /nobreak >nul
@start "Agent 4" node "D:\AI_agent game\pacmesh\src\agents\dummy-agent.js" --role ghost
@timeout /t 5 /nobreak >nul
@start "" http://localhost:3000
