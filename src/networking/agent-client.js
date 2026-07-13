require("./webrtc-bootstrap");
const http = require("http");
const { Peer } = require("peerjs");
const {
  DIRECTORY_HOST, DIRECTORY_PORT, PEERJS_HOST, PEERJS_PORT,
  PEERJS_PATH, PEERJS_SECURE, MATCH_TIMEOUT_MS, MSG,
} = require("./protocol");
const { StateValidator } = require("./state-validator");

function httpRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: DIRECTORY_HOST,
      port: DIRECTORY_PORT,
      path,
      method,
      headers: { "Content-Type": "application/json" },
    };
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { reject(new Error("Invalid JSON: " + data)); }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

class AgentClient {
  constructor({ agentId, preferredRole, onGameState, onMatchStart, onMatchEnd, onError, onCoordinatorFailover }) {
    this.agentId = agentId;
    this.preferredRole = preferredRole;
    this.assignedRole = null;
    this.matchId = null;
    this.coordinatorId = null;
    this.peer = null;
    this.conn = null;
    this.onGameState = onGameState;
    this.onMatchStart = onMatchStart;
    this.onMatchEnd = onMatchEnd;
    this.onError = onError;
    this.onCoordinatorFailover = onCoordinatorFailover;
    this.connected = false;
    this.moveCount = 0;
    this.lastState = null;
    this.timeoutHandle = null;
    this.validator = null;
    this.failoverInProgress = false;
    this._lastViolationKey = null;
  }

  async createMatch() {
    const res = await httpRequest("POST", "/api/matches");
    this.matchId = res.matchId;
    console.log(`[Agent] Created match ${this.matchId}`);
    await this._initPeer();
    await httpRequest("POST", `/api/matches/${this.matchId}/register`, { peerId: this.peer.id });
    const joinRes = await httpRequest("POST", `/api/matches/${this.matchId}/join`, {
      peerId: this.peer.id, preferredRole: this.preferredRole,
    });
    this.assignedRole = joinRes.assignedRole;
    this.coordinatorId = this.peer.id;
    console.log(`[Agent] Registered as coordinator (${this.assignedRole})`);
    this._startTimeout();
    return { matchId: this.matchId, role: this.assignedRole, isCoordinator: true };
  }

  async joinMatch(matchId) {
    await this._initPeer();
    let res;
    for (let i = 0; i < 20; i++) {
      res = await httpRequest("POST", `/api/matches/${matchId}/join`, {
        peerId: this.peer.id, preferredRole: this.preferredRole,
      });
      if (res.coordinatorId) break;
      console.log(`[Agent] Waiting for coordinator to register... (attempt ${i + 1})`);
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (!res || !res.coordinatorId) {
      throw new Error("Coordinator never registered for match " + matchId);
    }
    this.matchId = matchId;
    this.assignedRole = res.assignedRole;
    this.coordinatorId = res.coordinatorId;
    console.log(`[Agent] Joined match ${matchId} as ${this.assignedRole}, coordinator: ${this.coordinatorId}`);
    await this._connectToCoordinator();
    this._startTimeout();
    return { matchId, role: this.assignedRole, isCoordinator: false };
  }

  async joinAnyOpenMatch(retries = 15, delay = 1000) {
    for (let i = 0; i < retries; i++) {
      const res = await httpRequest("GET", "/api/matches");
      const waiting = res.matches.filter((m) => m.status === "waiting" && m.agents.length < 4);
      for (const match of waiting) {
        try { return await this.joinMatch(match.matchId); } catch (e) {
          console.log(`[Agent] Failed to join ${match.matchId}: ${e.message}`);
        }
      }
      if (i < retries - 1) await new Promise((r) => setTimeout(r, delay));
    }
    return null;
  }

  async reconnectToCoordinator(newCoordinatorId) {
    this.coordinatorId = newCoordinatorId;
    if (this.peer && !this.peer.destroyed) {
      this.peer.destroy();
    }
    this.peer = null;
    this.conn = null;
    this.connected = false;
    await this._initPeer();
    await this._connectToCoordinator();
  }

  async _initPeer(retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await new Promise((resolve, reject) => {
          if (this.peer && !this.peer.destroyed) { resolve(); return; }
          const id = this.agentId || "agent-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
          this.peer = new Peer(id, {
            host: PEERJS_HOST, port: PEERJS_PORT, path: PEERJS_PATH, secure: PEERJS_SECURE,
            config: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] },
          });
          this.peer.on("open", () => {
            this.agentId = this.peer.id;
            console.log(`[Agent] Peer ID: ${this.peer.id}`);
            resolve();
          });
          this.peer.on("error", (err) => {
            console.error(`[Agent] Peer error: ${err.message}`);
            if (this.onError) this.onError(err);
            reject(err);
          });
          this.peer.on("connection", (conn) => {
            console.log(`[Agent] Incoming connection from ${conn.peer} (ignoring - agent connects outbound)`);
          });
          setTimeout(() => reject(new Error("Peer init timeout")), 15000);
        });
      } catch (err) {
        if (attempt < retries) {
          console.log(`[Agent] Peer init failed (attempt ${attempt}), retrying...`);
          if (this.peer && !this.peer.destroyed) { try { this.peer.destroy(); } catch {} }
          this.peer = null;
          await new Promise((r) => setTimeout(r, 2000));
        } else {
          throw err;
        }
      }
    }
  }

  _handleConnection(conn) {
    this.conn = conn;
    conn.on("data", (data) => this._handleMessage(data));
    conn.on("close", () => {
      console.log(`[Agent] Connection to coordinator ${conn.peer} closed`);
      this.connected = false;
      this._clearTimeout();
      if (!this.failoverInProgress && this.matchId && this.onCoordinatorFailover) {
        this.failoverInProgress = true;
        this.onCoordinatorFailover();
      }
    });
    conn.on("error", (err) => console.error(`[Agent] Connection error: ${err.message}`));
    this.connected = true;
  }

  async _connectToCoordinator() {
    if (this.coordinatorId === (this.peer ? this.peer.id : null)) return;
    return new Promise((resolve, reject) => {
      const conn = this.peer.connect(this.coordinatorId, { reliable: true, serialization: "json" });
      conn.on("open", () => {
        console.log(`[Agent] Connected to coordinator ${this.coordinatorId}`);
        this._handleConnection(conn);
        conn.send({ type: MSG.AGENT_JOIN, agentId: this.peer.id, role: this.assignedRole });
        resolve();
      });
      conn.on("error", (err) => {
        console.error(`[Agent] Connection to coordinator failed: ${err.message}`);
        reject(err);
      });
      setTimeout(() => reject(new Error("Connect to coordinator timeout")), 15000);
    });
  }

  _handleMessage(data) {
    if (!data || !data.type) return;

    switch (data.type) {
      case MSG.GAME_STATE:
      case MSG.MATCH_START:
      case MSG.MATCH_RESUME:
        this._validateAndProcess(data);
        break;
      case MSG.MATCH_END:
        console.log(`[Agent] Match ended. Winner: ${data.winner}`);
        this._clearTimeout();
        if (this.onMatchEnd) this.onMatchEnd(data);
        break;
      case MSG.AGENT_DISCONNECT:
        console.log(`[Agent] Agent ${data.agentId} disconnected from match`);
        break;
      case MSG.COORDINATOR_FAILOVER:
        console.log(`[Agent] Coordinator failover: new coordinator is ${data.newCoordinatorId}`);
        break;
      default:
        if (this.onGameState) this.onGameState(data);
    }
  }

  _validateAndProcess(data) {
    if (data.maze && data.maze.grid && !this.validator) {
      this.validator = new StateValidator(data.maze.grid);
    }

    if (data.type === MSG.MATCH_RESUME && this.validator) {
      this.validator.reset();
    }

    if (this.validator) {
      const result = this.validator.validate(data);
      if (!result.valid) {
        const key = result.violations.map((v) => `${v.type}:${v.entityId || ''}`).join('|');
        if (key !== this._lastViolationKey) {
          this._lastViolationKey = key;
          console.warn(`[Agent] State validation failed:`);
          for (const v of result.violations) {
            console.warn(`  [VALIDATION] ${v.type}: ${v.detail}`);
          }
        }
      } else {
        this._lastViolationKey = null;
      }
    }

    this.lastState = data;
    this._resetTimeout();
    this.failoverInProgress = false;

    if (data.type === MSG.MATCH_START || data.type === MSG.MATCH_RESUME) {
      console.log(`[Agent] ${data.type === MSG.MATCH_RESUME ? 'Match resumed' : 'Match started'}!`);
      if (this.onMatchStart) this.onMatchStart(data);
    } else if (this.onGameState) {
      this.onGameState(data);
    }
  }

  sendMove(direction) {
    if (this.conn && this.connected) {
      this.conn.send({ type: MSG.AGENT_MOVE, agentId: this.peer.id, direction });
      this.moveCount++;
    }
  }

  broadcast(data) {
    if (this.conn && this.connected) this.conn.send(data);
  }

  _startTimeout() {
    this._clearTimeout();
    this.timeoutHandle = setTimeout(() => {
      console.log(`[Agent] Timeout - no game state received for ${MATCH_TIMEOUT_MS}ms`);
      if (this.onError) this.onError(new Error("Agent timeout"));
      this.disconnect();
    }, MATCH_TIMEOUT_MS + 5000);
  }

  _resetTimeout() {
    if (this.timeoutHandle) { clearTimeout(this.timeoutHandle); this.timeoutHandle = null; }
    this._startTimeout();
  }

  _clearTimeout() {
    if (this.timeoutHandle) { clearTimeout(this.timeoutHandle); this.timeoutHandle = null; }
  }

  disconnect() {
    this._clearTimeout();
    if (this.conn) { try { this.conn.close(); } catch {} }
    if (this.peer && !this.peer.destroyed) { try { this.peer.destroy(); } catch {} }
    this.connected = false;
  }
}

module.exports = { AgentClient, httpRequest };
