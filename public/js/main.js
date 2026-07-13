(function () {
  const canvas = document.getElementById("gameCanvas");
  const statusEl = document.getElementById("status");
  const matchListEl = document.getElementById("matchList");

  const ROWS = 31;
  const COLS = 31;

  let currentMaze = null;
  let currentRenderer = null;
  let net = null;
  let isSpectating = false;
  let demoInterval = null;
  let demoFrameId = null;

  function resizeCanvas() {
    const maxW = window.innerWidth - 40;
    const maxH = window.innerHeight - 120;
    const size = Math.min(maxW, maxH, 800);
    canvas.width = size;
    canvas.height = size;
    if (currentRenderer) currentRenderer.resize();
  }

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  function drawDemo() {
    if (isSpectating) return;
    if (demoInterval) clearInterval(demoInterval);
    if (demoFrameId) cancelAnimationFrame(demoFrameId);
    const maze = new Maze(ROWS, COLS);
    currentMaze = maze;
    currentRenderer = new Renderer(canvas, maze);
    const game = new Game(maze);

    const spawns = maze.getSpawnPoints();
    for (let i = 0; i < spawns.pacmen.length; i++) {
      const s = spawns.pacmen[i];
      game.addEntity("pacman-" + i, "pacman", s.r, s.c);
    }
    for (let i = 0; i < spawns.ghosts.length; i++) {
      const s = spawns.ghosts[i];
      game.addEntity("ghost-" + i, "ghost", s.r, s.c);
    }
    game.state = "playing";

    function moveEntities() {
      if (game.state !== "playing" || game.getWinner()) return;
      for (const entity of game.entities) {
        if (!entity.alive) continue;
        const dirs = ["up", "down", "left", "right"];
        const preferred = entity.lastMove;
        if (preferred && dirs.includes(preferred)) {
          const rest = dirs.filter((d) => d !== preferred);
          const attempts = [preferred, ...rest];
          for (const d of attempts) {
            if (game.moveEntity(entity.id, d)) break;
          }
        } else {
          const shuffled = dirs.sort(() => Math.random() - 0.5);
          for (const d of shuffled) {
            if (game.moveEntity(entity.id, d)) break;
          }
        }
      }
      const w = game.getWinner();
      if (w) {
        statusEl.textContent = "Demo winner: " + w.toUpperCase() + "!";
      }
    }

    demoInterval = setInterval(moveEntities, 350);
    const frameId = { current: null };

    function animate() {
      if (isSpectating) {
        clearInterval(demoInterval);
        demoInterval = null;
        demoFrameId = null;
        return;
      }
      const state = game.getState();
      currentRenderer.draw(state);
      const winner = game.getWinner();
      if (winner) {
        statusEl.textContent = "Demo winner: " + winner.toUpperCase() + "!";
      }
      frameId.current = requestAnimationFrame(animate);
      demoFrameId = frameId.current;
    }
    animate();
  }

  async function refreshMatchList() {
    try {
      net = new NetworkManager();
      const matches = await net.fetchMatches();
      matchListEl.innerHTML = "";
      if (matches.length === 0) {
        matchListEl.innerHTML = '<div class="match-item dim">No open matches</div>';
        return;
      }
      for (const m of matches) {
        const div = document.createElement("div");
        div.className = "match-item";
        const count = m.agents ? m.agents.length : 0;
        div.innerHTML = `<span>${m.matchId.slice(0, 20)}…</span><span>${count}/4 agents</span>`;
        div.addEventListener("click", () => spectateMatch(m.matchId));
        matchListEl.appendChild(div);
      }
    } catch (e) {
      matchListEl.innerHTML = '<div class="match-item dim">Directory unavailable</div>';
    }
  }

  async function spectateMatch(matchId) {
    if (!net) net = new NetworkManager();
    isSpectating = true;
    statusEl.textContent = "Connecting to match " + matchId.slice(0, 16) + "...";

    try {
      await net.spectateMatch(matchId);
      statusEl.textContent = "Spectating match";

      net.onStateUpdate = (data) => {
        if (data.type === "game_state" || data.type === "match_start") {
          const state = data;
          if (!currentMaze || currentMaze.rows !== (state.maze && state.maze.rows)) {
            currentMaze = new Maze(
              state.maze ? state.maze.rows : ROWS,
              state.maze ? state.maze.cols : COLS
            );
            if (state.maze && state.maze.grid) {
              currentMaze.grid = state.maze.grid;
            }
            currentRenderer = new Renderer(canvas, currentMaze);
          }
          if (state.maze && state.maze.grid) {
            currentMaze.grid = state.maze.grid;
          }
          currentRenderer.draw(state);

          if (state.winner) {
            statusEl.textContent = "Winner: " + state.winner.toUpperCase() + "!";
          }
        }
        if (data.type === "match_end") {
          statusEl.textContent = "Match ended. Winner: " + (data.winner || "unknown");
        }
      };

      net.onDisconnected = () => {
        isSpectating = false;
        statusEl.textContent = "Disconnected from match";
      };
    } catch (err) {
      statusEl.textContent = "Failed to spectate: " + err.message;
      isSpectating = false;
      drawDemo();
    }
  }

  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      tabButtons.forEach((b) => b.classList.remove("active"));
      tabContents.forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      const content = document.getElementById("tab-" + tab);
      if (content) content.classList.add("active");
      if (tab === "spectate") refreshMatchList();
      if (tab === "demo") {
        isSpectating = false;
        drawDemo();
      }
    });
  });

  document.getElementById("newMatchBtn").addEventListener("click", () => {
    if (isSpectating) {
      net.disconnect();
      isSpectating = false;
    }
    drawDemo();
  });

  document.getElementById("refreshBtn").addEventListener("click", refreshMatchList);

  drawDemo();
})();
