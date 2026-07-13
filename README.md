# PacMesh

```text
   .-"-.      .-"""-.
  / .-. \    / .-.   \
  | | | |   | |  _|  |
  | |_| |   | | (_)  |
  \     /    \ `---' /
   `-.-'      `-.___.'
   PACMESH   GHOSTS  >
```

PacMesh is a browser-first, Pac-Man-style arena where 4 agents compete in real time over WebRTC: 2 Pac-Men versus 2 Ghosts.

The repo includes:

- A browser spectator page in `public/`
- A small HTTP directory server for match discovery and coordinator election
- A match coordinator that owns game state and relays updates over PeerJS/WebRTC
- A dummy agent and an LLM-driven agent for testing the protocol

## What PacMesh does

- Random maze generation per match
- Pellet and power-pellet gameplay
- Elimination-based win condition
- Per-agent asynchronous moves
- Open match discovery so agents can self-serve into a match
- Coordinator failover when the host disconnects

## Project layout

- `public/js/game.js`, `maze.js`, `renderer.js`: browser game logic and rendering
- `public/js/network.js`: spectator-side network client
- `src/networking/protocol.js`: runtime constants and message names
- `src/protocol/schema.js`: protocol documentation
- `src/networking/directory-server.js`: open-match directory API
- `src/networking/match-coordinator.js`: authoritative match host and failover logic
- `src/networking/state-validator.js`: state validation helpers
- `src/agents/dummy-agent.js`: random-agent reference implementation
- `src/agents/llm-agent.js`: LLM-backed agent example

## Agent protocol

The authoritative runtime protocol is defined in `src/networking/protocol.js`, with the developer-facing schema documented in `src/protocol/schema.js`.

### Message types used by the runtime

`protocol.js` defines these message constants:

- `agent_join`
- `agent_reconnect`
- `agent_leave`
- `game_state`
- `agent_move`
- `match_start`
- `match_resume`
- `match_end`
- `agent_disconnect`
- `coordinator_failover`

### Join flow

Agents connect through `AgentClient` and join with a preferred role of `pacman` or `ghost`.

The join payload used by the codebase is:

```json
{
  "type": "join",
  "peerId": "agent-peer-id",
  "preferredRole": "pacman"
}
```

The directory server assigns a role and returns the match coordinator ID when a match is ready.

### Game state payload

`schema.js` documents the game state shape that agents consume:

- `matchId`
- `agentId`
- `role`
- `maze.rows`
- `maze.cols`
- `maze.grid`
- `entities[]`
- `pellets[]`
- `powerPellets[]`
- `ghostsVulnerable`
- `state`
- `winner`

The actual coordinator builds state in `match-coordinator.js` with:

- `matchId`
- `version`
- `timestamp`
- `maze`
- `entities`
- `pellets`
- `powerPellets`
- `ghostsVulnerable`
- `state`
- `winner`

Each entity includes:

- `id`
- `role`
- `team`
- `r`
- `c`
- `alive`
- `color`

### Move response

Agents send one move at a time:

```json
{
  "type": "agent_move",
  "direction": "up"
}
```

Valid directions are:

- `up`
- `down`
- `left`
- `right`

## Open-arena matchmaking

The directory server in `src/networking/directory-server.js` exposes a simple in-memory match API:

- `GET /api/matches` lists open matches
- `POST /api/matches` creates a new match
- `POST /api/matches/:matchId/register` registers the coordinator peer ID
- `POST /api/matches/:matchId/join` joins an agent to a match
- `POST /api/matches/:matchId/claim-coordinator` is used during failover
- `POST /api/matches/:matchId/recover` marks the match as resumed
- `POST /api/matches/:matchId/finish` marks the match complete
- `DELETE /api/matches/:matchId/leave` removes an agent

How it works in practice:

1. An agent asks the directory for open matches.
2. If a match exists with a registered coordinator, the agent joins it.
3. If no open match is available, the agent creates one and becomes the coordinator.
4. When 4 agents are present, the match starts.

Implementation note: `REQUIREMENTS.md` describes a free public broker / broker-native room listing model, but the current implementation uses this local HTTP directory server for match discovery and coordinator bookkeeping.

## Coordinator and failover

`src/networking/match-coordinator.js` is the authoritative host for a match.

It is responsible for:

- Creating the local `Maze` and `Game`
- Accepting peer connections
- Tracking agent roles and entities
- Broadcasting state snapshots
- Enforcing per-agent timeouts
- Ending the match when a winner is determined
- Rebuilding state after host failover

### Start and play

When the coordinator starts, it:

- Connects to PeerJS
- Registers itself with the directory server
- Generates a maze, unless it is resuming from failover
- Waits for agents to connect

When four agents are present in a fresh match, it broadcasts `match_start`.

### Timeout handling

The runtime uses `MATCH_TIMEOUT_MS` from `protocol.js` and defaults to 30000 ms.

If an agent does not move in time, the coordinator removes that agent from the match rather than freezing the game.

### Failover

If the coordinator disconnects:

- An agent can read the last state it received
- It attempts to claim coordinator ownership via the directory server
- If claim succeeds, the new coordinator rebuilds the maze/game from the saved state
- Reconnecting agents are accepted back into the match
- The match resumes via `match_resume`

This failover flow is implemented in `match-coordinator.js` and exercised by both `dummy-agent.js` and `llm-agent.js`.

## Running locally

Install dependencies:

```bash
npm install
```

Run the static browser app:

```bash
npm start
```

Run the directory server directly:

```bash
npm run directory
```

Run the dummy agent:

```bash
npm run agent
```

Run tests:

```bash
npm test
```

Run the integration match test:

```bash
npm run test:integration
```

## Writing an agent

`src/agents/dummy-agent.js` is the simplest reference implementation.

Agent behavior in the repo is:

- Create an `AgentClient`
- Join an open match if one exists
- Create a match and become coordinator if none exist
- Listen for `game_state`
- Send one move at a time
- Handle `match_start`, `match_end`, and coordinator failover

### Minimal agent shape

Your agent should:

1. Connect to the directory server and join a match
2. Wait for `game_state`
3. Decide on `up`, `down`, `left`, or `right`
4. Send the move back to the coordinator
5. Reconnect or fail over if the coordinator disappears

### Reference files

- `src/agents/dummy-agent.js`
- `src/agents/llm-agent.js`
- `src/networking/agent-client.js`
- `src/networking/match-coordinator.js`

## Spectator page

The browser spectator client lives in `public/js/network.js`.

It can:

- Fetch available matches from the directory server
- Join a match as a spectator
- Connect to the coordinator over PeerJS
- Receive live state updates for rendering

## Notes on REQUIREMENTS.md

Most of `REQUIREMENTS.md` matches the implemented direction, but a few items are currently aspirational or simplified in code:

- The spec says matchmaking should rely on a free public broker's built-in room listing; the code currently uses `src/networking/directory-server.js` as a local HTTP directory.
- The spec describes a zero-server deployment model; this repo currently includes a directory server process for discovery and coordinator bookkeeping.
- The spec frames Phase 1 as a future scope; the current repository already includes core implementation pieces for the directory, coordinator, agent protocol, dummy agent, and spectator networking.

## License

PacMesh is released under the MIT License. See `LICENSE` for the full text.
