# PacMesh — Requirements Specification

**Project name:** PacMesh
*(Pac-Man + peer-to-peer mesh networking — the name reflects both the game and how it connects agents)*

**One-liner:** A real-time, browser-based, Pac-Man-style arena where teams of LLM-powered AI agents battle each other over WebRTC, with zero servers to host or maintain.

---

## 1. Game Concept & Rules

| Aspect | Decision |
|---|---|
| **Format** | Team battle — team of Pac-Men vs. team of Ghosts |
| **Agents per match** | 4 total (2 Pac-Men vs. 2 Ghosts) |
| **Pacing** | Real-time, fully asynchronous — each agent moves the instant its own LLM responds, independent of the others (no shared tick waiting on the slowest agent) |
| **Maze** | Randomly generated each match |
| **Win condition** | Elimination — last team with a living agent wins |
| **Power pellets** | Yes — classic mechanic. When a Pac-Man agent eats one, Ghosts become vulnerable and can be eaten (temporary role reversal) |
| **Spectator mode** | Yes — anyone can open the web page and watch a live match render in the browser |
| **Match structure (Phase 1)** | Single match at a time — no tournament/leaderboard layer yet (deferred as a possible future phase, since it's the most feasible scope for an initial version) |

### Agent timeout behavior
If an agent's LLM call fails, errors, or takes too long to respond, that agent is **removed from the match** (forfeits) rather than freezing in place indefinitely. A reasonable timeout threshold (e.g. ~30 seconds) should be configurable, not hardcoded.

---

## 2. Agent Architecture

- Agents are **real LLM-driven agents** — each tick/decision, an agent's controller calls an LLM (Claude, GPT, or any model the operator chooses) with the current game state, and the LLM's response determines the next move.
- Movement is **asynchronous per-agent**: there's no global "wait for everyone" tick. Each agent's character moves as soon as that agent's own decision-making loop produces a move.
- Agents run as **independent clients** (e.g. local scripts each competitor runs on their own machine with their own LLM API key) — this keeps API keys off the browser/spectator page and means nothing related to agent logic runs on your (the project owner's) machine.
- **You do not create, run, or operate any agents yourself.** PacMesh is published as an open arena — third parties bring their own agents (built against the documented protocol) and join matches on their own. Your role is limited to building and publishing the game itself, plus (for testing purposes only) the dummy/random-move agent described in Section 8 (Testing Without API Keys).
- A clear, documented **agent protocol** is needed so any developer can write a new agent: what the game-state payload looks like (maze layout, positions, pellet locations, power-pellet status, remaining agents, etc.) and what a valid move response looks like.

---

## 3. Networking

- **No persistent server, no hosting cost, nothing running on your system.**
- Agents connect to each other and to the spectator page via **WebRTC**, forming a peer-to-peer mesh.
- **Signaling** (the one-time handshake WebRTC needs to let peers discover each other) uses a **free public broker service** (PeerJS-style) — fully automatic, zero setup, no third-party cost ever.
- The spectator page itself can be hosted for free as a static site (e.g. GitHub Pages) since there's no backend logic to run.

### Open-arena matchmaking (agents self-serve — you don't create or run agents)

PacMesh is meant to be an **open arena**: you build and publish it once, and any third-party agent can show up and play on its own, with no manual involvement from you. This drives how matches get formed:

| Aspect | Decision |
|---|---|
| **Match discovery** | Agents can query for a list of currently open matches and pick one (or create a new one) — not a single fixed lobby |
| **Match creation & start** | A match auto-starts the moment 4 agents have joined it (2 Pac-Men, 2 Ghosts) |
| **Parallelism** | Multiple matches can run simultaneously — if the current match(es) are full, a new agent simply starts a fresh one |
| **Lobby/directory implementation** | Kept minimal — relies on whatever basic room-listing capability the free signaling broker itself provides, rather than adding a separate hosted database. This keeps the system as close to "true P2P, nothing extra to run" as possible, with the accepted tradeoff that match discovery may be more limited/basic than a dedicated matchmaking service would offer (e.g. simpler room listings, less rich metadata, possibly coarser control over which agents pair up) |

**Design implication:** because match discovery depends on the broker's built-in listing feature, opencode should treat this as a real constraint to design around from the start (naming/tagging conventions for rooms, how "open" vs "full" is signaled, etc.), not an afterthought bolted on later.

---

## 4. Tech Stack (proposed, browser-first)

- **Frontend / game engine:** JavaScript or TypeScript, rendered via HTML5 Canvas (fits the browser-based, no-server constraint, and is the natural choice for WebRTC + Pac-Man-style 2D rendering)
- **Networking library:** PeerJS (or equivalent) for WebRTC + free signaling broker
- **Agent runner:** a small standalone script (Node.js, or Python with a JS bridge) that competitors run locally — takes game state in, calls an LLM API, returns a move
- **Hosting:** static site hosting (GitHub Pages) for the spectator/game page — no server processes

---

## 5. Visual Style

- Pac-Man-style 2D maze aesthetic, matching the classic look/feel from your reference screenshot (bright maze walls, dot pellets, power pellets, simple sprite-style characters).
- Clean, simple, retro-arcade visual language rather than a modern re-skin.

---

## 6. Repository & License

- **License:** MIT
- **Repo name:** `pacmesh` (or `PacMesh`, matching casing conventions)
- **README:** Original ASCII art with a Pac-Man/ghost theme (not a direct copy of the reference screenshot's style, but similarly eye-catching/unique — a distinctive terminal-flavored README with original artwork, stats/badges as appropriate).

---

## 7. Development Phases

### Phase 1 — opencode (~90% of development)
Builds the actual working game end-to-end:
- Game engine & rules (maze generation, pellets, power pellets, elimination logic)
- Rendering (Canvas-based Pac-Man-style visuals)
- WebRTC networking + free signaling integration
- Agent protocol (game-state schema, move-response schema, timeout/removal handling)
- Reference/example agent implementations (so people have something to test against)
- Spectator page
- Any bugs or improvements identified along the way

### Phase 2 — codex (final stage, polish only)
- Code cleanup and refinement
- Tests
- Final documentation
- The eye-catching, ASCII-art README

---

## 8. Testing Without API Keys

Phase 1 includes a **dummy agent** — a simple random/rule-based bot that speaks the exact same protocol a real LLM agent would (same game-state input, same move-output format) but makes moves without ever calling an LLM. This lets full matches be run and verified (engine, rendering, maze generation, elimination logic, networking) with zero API cost and zero real agents involved. Swapping a dummy agent for a real LLM-powered one is just plugging a different script into the same protocol slot.

---

## 9. Open / Deferred (not in Phase 1 scope, noted for later)
- Tournament mode / leaderboard across multiple matches
- Support for scripted/non-LLM bots alongside LLM agents (currently LLM-only)
- Additional team sizes beyond 2v2
- Distribution & community/marketing plan (getting third parties to discover PacMesh and write agents for it) — a post-launch concern, not part of the build itself
