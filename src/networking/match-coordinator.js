require("./webrtc-bootstrap");
const { Maze } = require("../../public/js/maze");
const { Game } = require("../../public/js/game");
const { Peer } = require("peerjs");
const {
  PEERJS_HOST, PEERJS_PORT, PEERJS_PATH, PEERJS_SECURE,
  MATCH_TIMEOUT_MS, MATCH_MAX_DURATION_MS, MSG, DIRECTIONS,
} = require("./protocol");
const { httpRequest } = require("./agent-client");

function rebuildGameFromState(lastState, hostPeerId) {
  const grid = (lastState.maze && lastState.maze.grid) || [];
  const rows = (lastState.maze && lastState.maze.rows) || 31;
  const cols = (lastState.maze && lastState.maze.cols) || 31;
  const maze = new Maze(rows, cols);
  if (grid.length > 0) maze.grid = grid;
  const game = new Game(maze);
  game.state = "playing";

  const known = new Set();
  for (const e of lastState.entities || []) {
    if (!e.alive) continue;
    game.addEntity(e.id, e.role, e.r, e.c);
    known.add(e.id);
  }
  if (hostPeerId && !known.has(hostPeerId)) {
    const role = (lastState.entities || []).find((e) => e.id === hostPeerId);
    if (role) game.addEntity(hostPeerId, role.role, role.r, role.c);
  }

  const eatenPellets = new Set();
  const eatenPower = new Set();
  const statePellets = new Set((lastState.pellets || []).map((p) => `${p.r},${p.c}`));
  const statePower = new Set((lastState.powerPellets || []).map((p) => `${p.r},${p.c}`));

  for (const p of maze.pellets) {
    if (!statePellets.has(`${p.r},${p.c}`)) eatenPellets.add(`${p.r},${p.c}`);
  }
  for (const p of maze.powerPellets) {
    if (!statePower.has(`${p.r},${p.c}`)) eatenPower.add(`${p.r},${p.c}`);
  }
  game.pellets = (lastState.pellets || []).map((p) => ({ r: p.r, c: p.c }));
  game.powerPellets = (lastState.powerPellets || []).map((p) => ({ r: p.r, c: p.c }));
  game.ghostsVulnerable = !!lastState.ghostsVulnerable;

  return { maze, game };
}

class MatchCoordinator {
  constructor({ matchId, hostRole, onComplete, resumeFrom }) {
    this.matchId = matchId;
    this.hostRole = hostRole || "pacman";
    this.onComplete = onComplete;
    this.peer = null;
    this.connections = new Map();
    this.agentRoles = new Map();
    this.game = null;
    this.maze = null;
    this.state = "waiting";
    this.agentTimeouts = new Map();
    this.stateVersion = 0;
    this.localPeerId = null;
    this.readyConnections = new Set();
    this.matchDurationTimer = null;
    this.isFailover = !!resumeFrom;
    this.resumeFrom = resumeFrom || null;
    this._resumeSent = false;
  }

  async start() {
    const shortId = this.matchId.replace("pacmesh-", "").slice(0, 8);
    const peerId = this.isFailover ? "coord2-" + shortId + "-" + Math.random().toString(36).slice(2, 6) : "coord-" + shortId;
    this.peer = new Peer(peerId, {
      host: PEERJS_HOST, port: PEERJS_PORT, path: PEERJS_PATH, secure: PEERJS_SECURE,
      config: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] },
    });

    await new Promise((resolve, reject) => {
      this.peer.on("open", () => {
        this.localPeerId = this.peer.id;
        console.log(`[Coordinator] Peer ID: ${this.peer.id}`);
        resolve();
      });
      this.peer.on("error", (err) => { console.error(`[Coordinator] Peer error: ${err.message}`); reject(err); });
      this.peer.on("connection", (conn) => this._onConnection(conn));
      setTimeout(() => reject(new Error("Coordinator init timeout")), 15000);
    });

    if (this.isFailover) {
      const claimRes = await httpRequest("POST", `/api/matches/${this.matchId}/claim-coordinator`, { peerId: this.peer.id });
      if (!claimRes.success) {
        this.peer.destroy();
        throw new Error("COORDINATOR_CLAIM_FAILED:" + (claimRes.coordinatorId || ""));
      }
      await httpRequest("POST", `/api/matches/${this.matchId}/register`, { peerId: this.peer.id });

      const rebuilt = rebuildGameFromState(this.resumeFrom, this.localPeerId);
      this.maze = rebuilt.maze;
      this.game = rebuilt.game;

      for (const e of this.resumeFrom.entities || []) {
        if (e.id !== this.localPeerId && e.alive) {
          this.agentRoles.set(e.id, e.role);
        }
      }
      this.agentRoles.set(this.localPeerId, this.hostRole);
      this.state = "playing";
      this.stateVersion = this.resumeFrom.version || 0;
      console.log(`[Coordinator] Recovered from state (v${this.stateVersion}), waiting for agents to reconnect...`);
    } else {
      await httpRequest("POST", `/api/matches/${this.matchId}/register`, { peerId: this.peer.id });
      try {
        await httpRequest("POST", `/api/matches/${this.matchId}/join`, {
          peerId: this.peer.id,
          preferredRole: this.hostRole,
        });
      } catch {}
      this._generateMaze();
      const spawns = this.maze.getSpawnPoints();
      const team = this.hostRole === "pacman" ? spawns.pacmen : spawns.ghosts;
      const spawn = team[0] || { r: 1, c: 1 };
      this.game.addEntity(this.localPeerId, this.hostRole, spawn.r, spawn.c);
      this.agentRoles.set(this.localPeerId, this.hostRole);
      console.log(`[Coordinator] Host registered as ${this.hostRole} at (${spawn.r},${spawn.c})`);
    }
  }

  _generateMaze() {
    this.maze = new Maze(31, 31);
    this.game = new Game(this.maze);
    this.game.state = "playing";
    console.log(`[Coordinator] Maze generated: ${this.maze.rows}x${this.maze.cols}`);
  }

  _onConnection(conn) {
    console.log(`[Coordinator] Incoming connection from ${conn.peer}`);
    this.connections.set(conn.peer, conn);

    conn.on("open", () => {
      console.log(`[Coordinator] Connection to ${conn.peer} open`);
      this.readyConnections.add(conn.peer);
    });

    conn.on("data", (data) => this._onMessage(conn.peer, data));

    conn.on("close", () => {
      console.log(`[Coordinator] ${conn.peer} disconnected`);
      this.readyConnections.delete(conn.peer);
      this._handleDisconnect(conn.peer);
    });

    conn.on("error", (err) => console.error(`[Coordinator] Conn error: ${err.message}`));
  }

  submitMove(agentId, direction) {
    if (this.state !== "playing") return;
    if (!DIRECTIONS.includes(direction)) return;
    this._resetTimeout(agentId);
    this.game.moveEntity(agentId, direction);
    this._broadcastState();
    const winner = this.game.getWinner();
    if (winner) this._endMatch(winner);
  }

  _onMessage(peerId, data) {
    if (!data || !data.type) return;

    if (data.type === MSG.AGENT_JOIN || data.type === MSG.AGENT_RECONNECT) {
      this._handleJoin(peerId, data);
    } else if (data.type === MSG.AGENT_MOVE) {
      this.submitMove(peerId, data.direction);
    } else if (data.type === "spectator_join") {
      console.log(`[Coordinator] Spectator: ${peerId}`);
      this._sendTo(peerId, { type: MSG.GAME_STATE, ...this._buildGameState() });
    }
  }

  _handleJoin(peerId, data) {
    const alreadyJoined = this.agentRoles.has(peerId);

    let role = data.role || "ghost";
    if (!alreadyJoined) {
      const counts = this._teamCounts();
      if (role === "pacman" && counts.pacmen >= 2) role = "ghost";
      if (role === "ghost" && counts.ghosts >= 2) role = "pacman";
      this.agentRoles.set(peerId, role);
      const spawns = this.maze.getSpawnPoints();
      const team = role === "pacman" ? spawns.pacmen : spawns.ghosts;
      const teamIdx = [...this.agentRoles.entries()].filter(([, r]) => r === role).map(([id]) => id).indexOf(peerId);
      const spawn = team[teamIdx] || { r: 1, c: 1 };
      this.game.addEntity(peerId, role, spawn.r, spawn.c);
    } else {
      this.agentRoles.set(peerId, role);
    }

    console.log(`[Coordinator] Agent ${peerId} ${alreadyJoined ? 'reconnected' : 'joined'} as ${role} (${this.agentRoles.size}/4)`);
    this._setupTimeout(peerId);
    this._broadcastState();

    if (this.isFailover && this.state === "playing") {
      if (this.agentRoles.size >= 2 && !this._resumeSent) {
        this._resumeMatch();
      } else if (this._resumeSent) {
        this._sendTo(peerId, { type: MSG.MATCH_RESUME, ...this._buildGameState() });
      }
    } else if (this._resumeSent && alreadyJoined) {
      this._sendTo(peerId, { type: MSG.MATCH_RESUME, ...this._buildGameState() });
    }

    if (!this.isFailover && !this._resumeSent && this.agentRoles.size >= 4 && this.state === "waiting") {
      this._startMatch();
    }
  }

  _handleDisconnect(peerId) {
    if (peerId === this.localPeerId) return;
    this.connections.delete(peerId);
    this.readyConnections.delete(peerId);
    const hadRole = this.agentRoles.has(peerId);
    this.agentRoles.delete(peerId);
    this._clearTimeout(peerId);
    if (this.game) this.game.removeEntity(peerId);
    for (const [id, conn] of this.connections) {
      if (!this.readyConnections.has(id)) continue;
      try { conn.send({ type: MSG.AGENT_DISCONNECT, agentId: peerId }); } catch {}
    }
    this._broadcastState();
    if (hadRole && this.state === "playing") {
      const winner = this.game.getWinner();
      if (winner) this._endMatch(winner);
    }
  }

  _teamCounts() {
    let pacmen = 0, ghosts = 0;
    for (const role of this.agentRoles.values()) {
      if (role === "pacman") pacmen++; else ghosts++;
    }
    return { pacmen, ghosts };
  }

  _startMatch() {
    this.state = "playing";
    console.log(`[Coordinator] MATCH STARTED with ${this.agentRoles.size} agents!`);
    httpRequest("POST", `/api/matches/${this.matchId}/recover`).catch(() => {});
    this.matchDurationTimer = setTimeout(() => {
      if (this.state === "playing") {
        const winner = this._teamCounts().pacmen >= this._teamCounts().ghosts ? "pacmen" : "ghosts";
        console.log(`[Coordinator] Match time limit reached, winner: ${winner}`);
        this._endMatch(winner);
      }
    }, MATCH_MAX_DURATION_MS);
    this._broadcast({ type: MSG.MATCH_START, ...this._buildGameState() });
  }

  _resumeMatch() {
    console.log(`[Coordinator] RESUMING match with ${this.agentRoles.size} agents after failover`);
    this.matchDurationTimer = setTimeout(() => {
      if (this.state === "playing") {
        const winner = this._teamCounts().pacmen >= this._teamCounts().ghosts ? "pacmen" : "ghosts";
        console.log(`[Coordinator] Match time limit reached after failover, winner: ${winner}`);
        this._endMatch(winner);
      }
    }, MATCH_MAX_DURATION_MS);
    httpRequest("POST", `/api/matches/${this.matchId}/recover`).catch(() => {});
    this._broadcast({ type: MSG.MATCH_RESUME, ...this._buildGameState() });
    this._resumeSent = true;
    this.isFailover = false;
  }

  _broadcastState() {
    this._broadcast({ type: MSG.GAME_STATE, ...this._buildGameState() });
  }

  _buildGameState() {
    this.stateVersion++;
    const gs = this.game ? this.game.getState() : {};
    return {
      matchId: this.matchId,
      version: this.stateVersion,
      timestamp: Date.now(),
      maze: gs.maze || { rows: 31, cols: 31, grid: [] },
      entities: gs.entities ? gs.entities.map((e) => ({ id: e.id, role: e.role, team: e.team, r: e.r, c: e.c, alive: e.alive, color: e.color })) : [],
      pellets: gs.pellets || [],
      powerPellets: gs.powerPellets || [],
      ghostsVulnerable: gs.ghostsVulnerable || false,
      state: gs.state || "waiting",
      winner: gs.winner || null,
    };
  }

  _broadcast(msg) {
    for (const [id, conn] of this.connections) {
      if (id === this.localPeerId) continue;
      if (!this.readyConnections.has(id)) continue;
      try { conn.send(msg); } catch {}
    }
  }

  _sendTo(peerId, msg) {
    if (!this.readyConnections.has(peerId)) return;
    const conn = this.connections.get(peerId);
    if (conn) { try { conn.send(msg); } catch {} }
  }

  async _endMatch(winner) {
    this.state = "finished";
    console.log(`[Coordinator] MATCH ENDED! Winner: ${winner}`);
    const finalMsg = { type: MSG.MATCH_END, matchId: this.matchId, winner, finalState: this._buildGameState() };
    this._broadcast(finalMsg);
    try { await httpRequest("POST", `/api/matches/${this.matchId}/finish`); } catch {}
    for (const t of this.agentTimeouts.values()) clearTimeout(t);
    this.agentTimeouts.clear();
    if (this.matchDurationTimer) { clearTimeout(this.matchDurationTimer); this.matchDurationTimer = null; }
    if (this.onComplete) this.onComplete(winner);
    setTimeout(() => { if (this.peer && !this.peer.destroyed) this.peer.destroy(); }, 3000);
  }

  _setupTimeout(peerId) {
    if (peerId === this.localPeerId) return;
    const t = setTimeout(() => {
      console.log(`[Coordinator] Agent ${peerId} timed out`);
      this._handleDisconnect(peerId);
    }, MATCH_TIMEOUT_MS);
    this.agentTimeouts.set(peerId, t);
  }

  _resetTimeout(peerId) {
    const t = this.agentTimeouts.get(peerId);
    if (t) { clearTimeout(t); this.agentTimeouts.delete(peerId); }
    if (peerId !== this.localPeerId) this._setupTimeout(peerId);
  }

  _clearTimeout(peerId) {
    const t = this.agentTimeouts.get(peerId);
    if (t) { clearTimeout(t); this.agentTimeouts.delete(peerId); }
  }
}

module.exports = { MatchCoordinator };
