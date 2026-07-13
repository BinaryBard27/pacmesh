class NetworkManager {
  constructor() {
    this.peer = null;
    this.connections = new Map();
    this.directoryUrl = null;
    this.matchId = null;
    this.onStateUpdate = null;
    this.onMatchList = null;
    this.onConnected = null;
    this.onDisconnected = null;
  }

  get directoryHost() {
    return localStorage.getItem("pacmesh_directory_host") || "localhost";
  }

  get directoryPort() {
    return parseInt(localStorage.getItem("pacmesh_directory_port") || "9876", 10);
  }

  async fetchMatches() {
    const res = await fetch(`http://${this.directoryHost}:${this.directoryPort}/api/matches`);
    const data = await res.json();
    return data.matches || [];
  }

  async spectateMatch(matchId) {
    this.matchId = matchId;

    const res = await fetch(
      `http://${this.directoryHost}:${this.directoryPort}/api/matches/${matchId}/join`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peerId: "spectator-" + Date.now(), preferredRole: null }),
      }
    );
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const coordinatorId = data.coordinatorId;
    console.log(`[Spectator] Connecting to coordinator: ${coordinatorId}`);

    if (this.peer) this.peer.destroy();

    return new Promise((resolve, reject) => {
      this.peer = new Peer("spectate-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6), {
        config: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] },
      });

      this.peer.on("open", () => {
        console.log(`[Spectator] Peer ID: ${this.peer.id}`);
        const conn = this.peer.connect(coordinatorId, { reliable: true });
        conn.on("open", () => {
          console.log("[Spectator] Connected to match");
          conn.send({ type: "spectator_join", peerId: this.peer.id });
          this.connections.set(coordinatorId, conn);
          if (this.onConnected) this.onConnected();
          resolve();
        });
        conn.on("data", (data) => {
          if (this.onStateUpdate) this.onStateUpdate(data);
        });
        conn.on("error", (err) => reject(err));
      });

      this.peer.on("error", (err) => reject(err));
      setTimeout(() => reject(new Error("Spectator connect timeout")), 15000);
    });
  }

  disconnect() {
    for (const conn of this.connections.values()) {
      try { conn.close(); } catch {}
    }
    if (this.peer && !this.peer.destroyed) {
      this.peer.destroy();
    }
    this.connections.clear();
    if (this.onDisconnected) this.onDisconnected();
  }

  static setDirectory(host, port) {
    localStorage.setItem("pacmesh_directory_host", host);
    localStorage.setItem("pacmesh_directory_port", String(port));
  }
}
