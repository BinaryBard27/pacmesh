const http = require("http");
const url = require("url");
const { DIRECTORY_PORT, MAX_AGENTS_PER_MATCH } = require("./protocol");

const matches = new Map();

function json(res, data, code = 200) {
  res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

function createServer() {
  const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    const parsed = url.parse(req.url, true);
    const path = parsed.pathname.replace(/\/+$/, "");
    const method = req.method;

    try {
      if (method === "GET" && path === "/api/matches") {
        const open = [];
        for (const [id, m] of matches) {
          if (m.status !== "finished") {
            open.push({
              matchId: id,
              status: m.status,
              agents: m.agents.map((a) => ({ role: a.role, peerId: a.peerId })),
              coordinatorId: m.coordinatorId,
            });
          }
        }
        return json(res, { matches: open });
      }

      if (method === "POST" && path === "/api/matches") {
        const matchId = "pacmesh-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
        matches.set(matchId, {
          id: matchId,
          status: "waiting",
          agents: [],
          coordinatorId: null,
          createdAt: Date.now(),
          claimLock: false,
        });
        console.log(`[Directory] Match created: ${matchId}`);
        return json(res, { matchId }, 201);
      }

      const matchIdMatch = path.match(/^\/api\/matches\/([^/]+)\/(.+)$/);
      if (!matchIdMatch) return json(res, { error: "Not found" }, 404);

      const matchId = matchIdMatch[1];
      const action = matchIdMatch[2];
      const m = matches.get(matchId);
      if (!m) return json(res, { error: "Match not found" }, 404);

      if (method === "POST" && action === "register") {
        const body = await parseBody(req);
        m.coordinatorId = body.peerId;
        console.log(`[Directory] Coordinator registered: ${body.peerId} for match ${matchId}`);
        return json(res, { ok: true });
      }

      if (method === "POST" && action === "join") {
        if (!m.coordinatorId) {
          return json(res, { coordinatorId: null, assignedRole: null, agentCount: m.agents.length, maxAgents: MAX_AGENTS_PER_MATCH }, 202);
        }
        if (m.status !== "waiting") {
          return json(res, { coordinatorId: m.coordinatorId, error: "Match is not accepting players" }, 400);
        }
        const body = await parseBody(req);
        const existingPacmen = m.agents.filter((a) => a.role === "pacman").length;
        const existingGhosts = m.agents.filter((a) => a.role === "ghost").length;

        let assignedRole = body.preferredRole;
        if (assignedRole === "pacman" && existingPacmen >= 2) assignedRole = "ghost";
        if (assignedRole === "ghost" && existingGhosts >= 2) assignedRole = "pacman";
        if (existingPacmen >= 2 && existingGhosts >= 2) {
          return json(res, { error: "Match is full" }, 400);
        }
        if (!assignedRole) assignedRole = existingPacmen < 2 ? "pacman" : "ghost";

        m.agents.push({ peerId: body.peerId, role: assignedRole });
        console.log(`[Directory] Agent ${body.peerId} joined match ${matchId} as ${assignedRole} (${m.agents.length}/${MAX_AGENTS_PER_MATCH})`);

        if (m.agents.length >= MAX_AGENTS_PER_MATCH) {
          m.status = "starting";
          console.log(`[Directory] Match ${matchId} is now full, starting!`);
        }

        return json(res, {
          coordinatorId: m.coordinatorId,
          assignedRole,
          agentCount: m.agents.length,
          maxAgents: MAX_AGENTS_PER_MATCH,
        });
      }

      if (method === "POST" && action === "claim-coordinator") {
        const body = await parseBody(req);
        if (m.claimLock) {
          return json(res, { success: false, coordinatorId: m.coordinatorId, reason: "already_claimed" });
        }
        m.claimLock = true;
        m.coordinatorId = body.peerId;
        m.status = "recovering";
        console.log(`[Directory] Coordinator claimed by ${body.peerId} for match ${matchId}`);
        return json(res, { success: true, coordinatorId: body.peerId });
      }

      if (method === "POST" && action === "recover") {
        m.status = "playing";
        m.claimLock = false;
        console.log(`[Directory] Match ${matchId} recovered, status set to playing`);
        return json(res, { ok: true });
      }

      if (method === "DELETE" && action === "leave") {
        const body = await parseBody(req);
        m.agents = m.agents.filter((a) => a.peerId !== body.peerId);
        if (m.agents.length === 0) {
          matches.delete(matchId);
          console.log(`[Directory] Match ${matchId} deleted (empty)`);
        }
        return json(res, { ok: true });
      }

      if (method === "POST" && action === "finish") {
        m.status = "finished";
        m.claimLock = false;
        console.log(`[Directory] Match ${matchId} finished`);
        return json(res, { ok: true });
      }

      json(res, { error: "Not found" }, 404);
    } catch (err) {
      console.error("[Directory] Error:", err);
      json(res, { error: "Internal error" }, 500);
    }
  });
  return server;
}

function startDirectory(port = DIRECTORY_PORT) {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(port, () => {
      console.log(`[Directory] Matchmaking server on http://localhost:${port}`);
      resolve(server);
    });
  });
}

if (require.main === module) startDirectory();

module.exports = { createServer, startDirectory };
