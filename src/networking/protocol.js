const MATCH_TIMEOUT_MS = parseInt(process.env.AGENT_TIMEOUT || "30000", 10);
const MATCH_MAX_DURATION_MS = parseInt(process.env.MATCH_MAX_DURATION || "45000", 10);
const DIRECTORY_PORT = parseInt(process.env.DIRECTORY_PORT || "9876", 10);
const DIRECTORY_HOST = process.env.DIRECTORY_HOST || "localhost";
const PEERJS_HOST = process.env.PEERJS_HOST || "0.peerjs.com";
const PEERJS_PORT = parseInt(process.env.PEERJS_PORT || "443", 10);
const PEERJS_PATH = process.env.PEERJS_PATH || "/";
const PEERJS_SECURE = process.env.PEERJS_SECURE !== "false";
const MAX_AGENTS_PER_MATCH = 4;

const DIRECTIONS = ["up", "down", "left", "right"];

const MSG = {
  AGENT_JOIN: "agent_join",
  AGENT_RECONNECT: "agent_reconnect",
  AGENT_LEAVE: "agent_leave",
  GAME_STATE: "game_state",
  AGENT_MOVE: "agent_move",
  MATCH_START: "match_start",
  MATCH_RESUME: "match_resume",
  MATCH_END: "match_end",
  AGENT_DISCONNECT: "agent_disconnect",
  COORDINATOR_FAILOVER: "coordinator_failover",
};

module.exports = {
  MATCH_TIMEOUT_MS,
  MATCH_MAX_DURATION_MS,
  DIRECTORY_PORT,
  DIRECTORY_HOST,
  PEERJS_HOST,
  PEERJS_PORT,
  PEERJS_PATH,
  PEERJS_SECURE,
  MAX_AGENTS_PER_MATCH,
  DIRECTIONS,
  MSG,
};
