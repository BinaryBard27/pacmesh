const { httpRequest, AgentClient } = require("../networking/agent-client");
const { MatchCoordinator } = require("../networking/match-coordinator");
const { DIRECTIONS, MSG } = require("../networking/protocol");
const { getLLMMove } = require("./llm-runner");

function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i].startsWith("--")) {
      const key = process.argv[i].slice(2);
      const val = process.argv[i + 1];
      if (val && !val.startsWith("--")) { args[key] = val; i++; }
      else { args[key] = true; }
    }
  }
  return args;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getAvailableMoves(mazeGrid, r, c) {
  const moves = [];
  const checks = [
    ["up", -1, 0],
    ["down", 1, 0],
    ["left", 0, -1],
    ["right", 0, 1],
  ];
  for (const [dir, dr, dc] of checks) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < mazeGrid.length && nc >= 0 && nc < mazeGrid[0].length && mazeGrid[nr][nc] === 0) {
      moves.push(dir);
    }
  }
  return moves;
}

function buildPrompt(state, agentId) {
  const me = (state.entities || []).find((e) => e.id === agentId);
  if (!me) return null;

  const mazeGrid = state.maze && state.maze.grid;
  if (!mazeGrid || mazeGrid.length === 0) return null;

  const rows = mazeGrid.length;
  const cols = mazeGrid[0].length;
  const viewRadius = 3;
  const r0 = Math.max(0, me.r - viewRadius);
  const r1 = Math.min(rows - 1, me.r + viewRadius);
  const c0 = Math.max(0, me.c - viewRadius);
  const c1 = Math.min(cols - 1, me.c + viewRadius);

  const entityMap = {};
  for (const e of state.entities || []) {
    if (e.alive && (e.r !== me.r || e.c !== me.c)) {
      entityMap[`${e.r},${e.c}`] = e;
    }
  }

  const pelletSet = new Set((state.pellets || []).map((p) => `${p.r},${p.c}`));
  const powerSet = new Set((state.powerPellets || []).map((p) => `${p.r},${p.c}`));

  const viewLines = [];
  for (let r = r0; r <= r1; r++) {
    let line = "";
    for (let c = c0; c <= c1; c++) {
      if (r === me.r && c === me.c) { line += "@"; continue; }
      const key = `${r},${c}`;
      if (entityMap[key]) {
        const e = entityMap[key];
        if (e.team === me.team) line += "M";
        else line += "X";
        continue;
      }
      if (mazeGrid[r][c] === 1) { line += "#"; continue; }
      if (powerSet.has(key)) { line += "O"; continue; }
      if (pelletSet.has(key)) { line += "."; continue; }
      line += " ";
    }
    viewLines.push(line);
  }

  const enemies = (state.entities || []).filter((e) => e.alive && e.team !== me.team && e.id !== me.id);
  const allies = (state.entities || []).filter((e) => e.alive && e.team === me.team && e.id !== me.id);
  const available = getAvailableMoves(mazeGrid, me.r, me.c);

  const lines = [];
  lines.push(`You are a ${me.role.toUpperCase()} in a Pac-Man arena. Your goal is to survive and help your team win.`);
  lines.push("");
  lines.push(`Your team: ${me.team}`);
  lines.push(`Your position: row ${me.r}, col ${me.c}`);
  lines.push(`Ghosts vulnerable: ${state.ghostsVulnerable ? "YES (eat them!)" : "no"}`);
  lines.push(`Pellets remaining: ${(state.pellets || []).length}`);
  lines.push(`Power pellets remaining: ${(state.powerPellets || []).length}`);
  lines.push("");

  if (allies.length > 0) {
    lines.push(`Teammates (${allies.length}):`);
    for (const a of allies) {
      lines.push(`  ${a.role} at (${a.r},${a.c})`);
    }
    lines.push("");
  }

  if (enemies.length > 0) {
    lines.push(`Opponents (${enemies.length}):`);
    for (const e of enemies) {
      const safe = state.ghostsVulnerable && e.role === "ghost" ? " (VULNERABLE)" : "";
      lines.push(`  ${e.role} at (${e.r},${e.c})${safe}`);
    }
    lines.push("");
  }

  lines.push(`Local view (${r1 - r0 + 1}x${c1 - c0 + 1}):`);
  lines.push("Legend: @=you #=wall .=pellet O=power M=teammate X=opponent");
  for (const l of viewLines) {
    lines.push(l);
  }
  lines.push("");

  lines.push(`Available moves: ${available.length > 0 ? available.join(", ") : "none (STUCK!)"}`);
  lines.push("");
  lines.push("Rules:");
  if (me.role === "pacman") {
    lines.push("- Eat pellets and power pellets to score.");
    lines.push("- Avoid ghosts unless they are vulnerable (after you eat a power pellet).");
    lines.push("- If you touch a ghost while NOT vulnerable, you are ELIMINATED.");
    lines.push("- If you eat a vulnerable ghost, it is eliminated.");
  } else {
    lines.push("- Chase Pac-Men to eliminate them by touching them.");
    lines.push("- If Pac-Man eats a power pellet, RUN AWAY (you become vulnerable).");
    lines.push("- If you touch a Pac-Man while vulnerable, you are ELIMINATED.");
  }
  lines.push("");
  lines.push('Respond with exactly one word: up, down, left, or right.');

  return lines.join("\n");
}

class LLMAgent {
  constructor(role) {
    this.role = role;
    this.matchId = null;
    this.assignedRole = null;
    this.client = null;
    this.coordinator = null;
    this.moveTimer = null;
    this.isCoordinator = false;
    this.llmPending = false;
    this._pendingResolve = null;
    this.metrics = {
      totalStates: 0,
      llmCalls: 0,
      validMoves: 0,
      fallbackMoves: 0,
      parseFailures: 0,
      llmErrors: 0,
      totalLatencyMs: 0,
      eliminated: false,
    };
  }

  get avgLatency() {
    return this.metrics.llmCalls > 0 ? (this.metrics.totalLatencyMs / this.metrics.llmCalls).toFixed(1) : "N/A";
  }

  async start() {
    const client = new AgentClient({
      preferredRole: this.role,
      onGameState: (state) => this._onGameState(state),
      onMatchStart: (state) => {
        console.log(`[LLMAgent] Match started!`);
      },
      onMatchEnd: (state) => {
        console.log(`[LLMAgent] Match ended. Winner: ${state.winner}`);
        setTimeout(() => process.exit(0), 1000);
      },
      onError: (err) => {
        console.error(`[LLMAgent] Error: ${err.message}`);
      },
      onCoordinatorFailover: () => this._handleFailover(),
    });
    this.client = client;

    let joined = await client.joinAnyOpenMatch();
    if (!joined) {
      console.log(`[LLMAgent] No open matches, becoming coordinator...`);
      await this._becomeCoordinator();
    } else {
      console.log(`[LLMAgent] Joined match ${joined.matchId} as ${joined.role}`);
      this.matchId = joined.matchId;
      this.assignedRole = joined.role;
    }
  }

  async _onGameState(state) {
    this.metrics.totalStates++;
    if (state.entities) {
      const me = state.entities.find((e) => e.id === (this.client ? this.client.peer.id : null));
      if (me && !me.alive) this.metrics.eliminated = true;
    }

    if (state.state !== "playing" || this.isCoordinator) return;

    const prompt = buildPrompt(state, this.client.peer.id);
    if (!prompt) {
      this._sendFallback();
      return;
    }

    this.metrics.llmCalls++;
    try {
      const result = await getLLMMove(prompt);
      this.metrics.totalLatencyMs += result.latency;

      if (result.direction) {
        this.metrics.validMoves++;
        this.client.sendMove(result.direction);
      } else {
        this.metrics.parseFailures++;
        this.metrics.fallbackMoves++;
        console.warn(`[LLMAgent] Parse failure: "${result.raw}" -> fallback`);
        this._sendFallback();
      }
    } catch (err) {
      this.metrics.llmErrors++;
      this.metrics.fallbackMoves++;
      console.warn(`[LLMAgent] LLM error: ${err.message} -> fallback`);
      this._sendFallback();
    }
  }

  _sendFallback() {
    const dirs = shuffle([...DIRECTIONS]);
    this.client.sendMove(dirs[0]);
    this.metrics.fallbackMoves++;
  }

  async _becomeCoordinator() {
    this.isCoordinator = true;
    const res = await httpRequest("POST", "/api/matches");
    this.matchId = res.matchId;
    console.log(`[LLMAgent] Created match ${this.matchId}`);

    this.coordinator = new MatchCoordinator({
      matchId: this.matchId,
      hostRole: this.role,
      onComplete: (winner) => {
        console.log(`[LLMAgent] Match ended. Winner: ${winner}`);
        clearInterval(this.moveTimer);
        setTimeout(() => process.exit(0), 1000);
      },
    });

    await this.coordinator.start();
    console.log(`[LLMAgent] Coordinator ready. Waiting for agents...`);

    this.moveTimer = setInterval(() => {
      if (this.coordinator && this.coordinator.state === "playing") {
        const prompt = buildPrompt(this.coordinator._buildGameState(), this.coordinator.localPeerId);
        if (!prompt) { this.coordinator.submitMove(this.coordinator.localPeerId, shuffle([...DIRECTIONS])[0]); return; }
        this.metrics.llmCalls++;
        getLLMMove(prompt).then((result) => {
          this.metrics.totalLatencyMs += result.latency;
          if (result.direction) {
            this.metrics.validMoves++;
            this.coordinator.submitMove(this.coordinator.localPeerId, result.direction);
          } else {
            this.metrics.parseFailures++;
            this.metrics.fallbackMoves++;
            this.coordinator.submitMove(this.coordinator.localPeerId, shuffle([...DIRECTIONS])[0]);
          }
        }).catch((err) => {
          this.metrics.llmErrors++;
          this.metrics.fallbackMoves++;
          this.coordinator.submitMove(this.coordinator.localPeerId, shuffle([...DIRECTIONS])[0]);
        });
      }
    }, 800);
  }

  async _handleFailover() {
    console.log(`[LLMAgent] Coordinator disconnected! Initiating failover...`);

    const lastState = this.client.lastState;
    this.client.disconnect();

    this.isCoordinator = true;
    const oldMetrics = this.metrics;
    this.coordinator = new MatchCoordinator({
      matchId: this.matchId,
      hostRole: this.assignedRole,
      onComplete: (winner) => {
        console.log(`[LLMAgent] Match ended after failover. Winner: ${winner}`);
        clearInterval(this.moveTimer);
        setTimeout(() => process.exit(0), 1000);
      },
      resumeFrom: lastState,
    });

    try {
      await this.coordinator.start();
      console.log(`[LLMAgent] Became new coordinator! Waiting for reconnecting agents...`);

      this.moveTimer = setInterval(() => {
        if (this.coordinator && this.coordinator.state === "playing") {
          const prompt = buildPrompt(this.coordinator._buildGameState(), this.coordinator.localPeerId);
          if (!prompt) { this.coordinator.submitMove(this.coordinator.localPeerId, shuffle([...DIRECTIONS])[0]); return; }
          this.metrics.llmCalls++;
          getLLMMove(prompt).then((result) => {
            this.metrics.totalLatencyMs += result.latency;
            if (result.direction) {
              this.metrics.validMoves++;
              this.coordinator.submitMove(this.coordinator.localPeerId, result.direction);
            } else {
              this.metrics.parseFailures++;
              this.metrics.fallbackMoves++;
              this.coordinator.submitMove(this.coordinator.localPeerId, shuffle([...DIRECTIONS])[0]);
            }
          }).catch((err) => {
            this.metrics.llmErrors++;
            this.metrics.fallbackMoves++;
            this.coordinator.submitMove(this.coordinator.localPeerId, shuffle([...DIRECTIONS])[0]);
          });
        }
      }, 800);
    } catch (err) {
      this.isCoordinator = false;
      if (err.message.startsWith("COORDINATOR_CLAIM_FAILED:")) {
        const newCoordId = err.message.split(":")[1];
        console.log(`[LLMAgent] Another agent claimed coordinator (${newCoordId}). Reconnecting...`);

        try {
          await this.client.reconnectToCoordinator(newCoordId);
          console.log(`[LLMAgent] Reconnected to new coordinator`);
          this.client.failoverInProgress = false;
        } catch (reconnErr) {
          console.error(`[LLMAgent] Failed to reconnect: ${reconnErr.message}`);
          setTimeout(() => this._handleFailover(), 2000);
        }
      } else {
        console.error(`[LLMAgent] Failover error: ${err.message}`);
        setTimeout(() => this._handleFailover(), 2000);
      }
    }
  }

  printMetrics() {
    console.log(`\n=== LLM Agent Performance ===`);
    console.log(`  Role:               ${this.assignedRole || this.role}`);
    console.log(`  Game states seen:   ${this.metrics.totalStates}`);
    console.log(`  LLM calls:          ${this.metrics.llmCalls}`);
    console.log(`  Valid moves:        ${this.metrics.validMoves}`);
    console.log(`  Parse failures:     ${this.metrics.parseFailures}`);
    console.log(`  LLM errors:         ${this.metrics.llmErrors}`);
    console.log(`  Fallback moves:     ${this.metrics.fallbackMoves}`);
    console.log(`  Avg latency (ms):   ${this.avgLatency}`);
    console.log(`  Eliminated:         ${this.metrics.eliminated ? "YES" : "survived"}`);
    console.log(`=============================\n`);
  }
}

async function main() {
  const args = parseArgs();
  const role = args.role || (Math.random() < 0.5 ? "pacman" : "ghost");
  console.log(`[LLMAgent] Starting, role: ${role}`);

  const agent = new LLMAgent(role);
  await agent.start();

  process.on("SIGINT", () => {
    agent.printMetrics();
    if (agent.client) agent.client.disconnect();
    clearInterval(agent.moveTimer);
    process.exit(0);
  });

  process.on("exit", () => {
    agent.printMetrics();
  });
}

main().catch((err) => {
  console.error(`[LLMAgent] Fatal: ${err.message}`);
  process.exit(1);
});
