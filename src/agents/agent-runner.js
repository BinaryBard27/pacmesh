#!/usr/bin/env node

/**
 * Agent Runner — template for running a real LLM-powered agent.
 *
 * To create your own agent:
 *   1. Copy this file to my-agent.js.
 *   2. Replace the `decideMove()` function with your LLM call.
 *   3. Run: node my-agent.js --match <matchId> --role pacman
 *
 * The game state is passed to your LLM as JSON. Your LLM should return
 * a direction: "up", "down", "left", or "right".
 */

const PEERJS_HOST = process.env.PEERJS_HOST || "0.peerjs.com";
const PEERJS_PORT = parseInt(process.env.PEERJS_PORT || "443", 10);
const PEERJS_PATH = process.env.PEERJS_PATH || "/";
const PEERJS_SECURE = process.env.PEERJS_SECURE !== "false";
const MATCH_TIMEOUT_MS = parseInt(process.env.AGENT_TIMEOUT || "30000", 10);

const VALID_DIRECTIONS = ["up", "down", "left", "right"];

function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i].startsWith("--")) {
      const key = process.argv[i].slice(2);
      const val = process.argv[i + 1];
      if (val && !val.startsWith("--")) {
        args[key] = val;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

/**
 * Decide a move based on the current game state.
 *
 * REPLACE THIS FUNCTION with your LLM call.
 *
 * @param {Object} gameState - The full game state from the match host
 * @returns {string} - "up", "down", "left", or "right"
 */
async function decideMove(gameState) {
  const direction = VALID_DIRECTIONS[Math.floor(Math.random() * VALID_DIRECTIONS.length)];
  return direction;
}

async function main() {
  const args = parseArgs();
  const matchId = args.match;
  const role = args.role || "pacman";

  if (!matchId) {
    console.error("Usage: agent-runner.js --match <matchId> [--role pacman|ghost]");
    process.exit(1);
  }

  console.log(`[AgentRunner] Starting as ${role} for match ${matchId}`);

  const Peer = (await import("peerjs")).default;
  const agentId = `agent-${role}-${Math.random().toString(36).slice(2, 6)}`;
  const peer = new Peer(agentId, {
    host: PEERJS_HOST,
    port: PEERJS_PORT,
    path: PEERJS_PATH,
    secure: PEERJS_SECURE,
  });

  peer.on("open", () => {
    console.log(`[AgentRunner] Peer ID: ${peer.id}`);
    const hostId = matchId;
    const conn = peer.connect(hostId);
    conn.on("open", () => {
      console.log("[AgentRunner] Connected to match host");
      conn.send({
        type: "join",
        agentId: peer.id,
        preferredRole: role,
      });
    });
    conn.on("data", async (data) => {
      if (data && data.type === "game_state" && data.state === "playing") {
        try {
          const direction = await decideMove(data);
          conn.send({
            type: "move",
            agentId: peer.id,
            direction,
          });
        } catch (err) {
          console.error("[AgentRunner] Error deciding move:", err);
        }
      }
    });
  });

  peer.on("error", (err) => {
    console.error("[AgentRunner] Peer error:", err);
  });
}

main().catch((err) => {
  console.error("[AgentRunner] Fatal:", err);
  process.exit(1);
});
