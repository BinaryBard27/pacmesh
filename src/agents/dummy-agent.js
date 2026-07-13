#!/usr/bin/env node

const { httpRequest, AgentClient } = require("../networking/agent-client");
const { MatchCoordinator } = require("../networking/match-coordinator");
const { DIRECTIONS, MSG } = require("../networking/protocol");

function randomMove() {
  return DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
}

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

class DummyAgent {
  constructor(role) {
    this.role = role;
    this.matchId = null;
    this.assignedRole = null;
    this.client = null;
    this.coordinator = null;
    this.moveTimer = null;
    this.isCoordinator = false;
  }

  async start() {
    const client = new AgentClient({
      preferredRole: this.role,
      onGameState: (state) => {
        if (state.state === "playing" && !this.isCoordinator) {
          this.client.sendMove(randomMove());
        }
      },
      onMatchStart: (state) => {
        console.log(`[Agent] Match started!`);
      },
      onMatchEnd: (state) => {
        console.log(`[Agent] Match ended. Winner: ${state.winner}`);
        setTimeout(() => process.exit(0), 1000);
      },
      onError: (err) => {
        console.error(`[Agent] Error: ${err.message}`);
      },
      onCoordinatorFailover: () => this._handleFailover(),
    });
    this.client = client;

    let joined = await client.joinAnyOpenMatch();
    if (!joined) {
      console.log(`[Agent] No open matches, becoming coordinator...`);
      await this._becomeCoordinator();
    } else {
      console.log(`[Agent] Joined match ${joined.matchId} as ${joined.role}`);
      this.matchId = joined.matchId;
      this.assignedRole = joined.role;
    }
  }

  async _becomeCoordinator() {
    this.isCoordinator = true;
    const res = await httpRequest("POST", "/api/matches");
    this.matchId = res.matchId;
    console.log(`[Agent] Created match ${this.matchId}`);

    this.coordinator = new MatchCoordinator({
      matchId: this.matchId,
      hostRole: this.role,
      onComplete: (winner) => {
        console.log(`[Agent] Match ended. Winner: ${winner}`);
        clearInterval(this.moveTimer);
        setTimeout(() => process.exit(0), 1000);
      },
    });

    await this.coordinator.start();
    console.log(`[Agent] Coordinator ready. Waiting for agents...`);

    this.moveTimer = setInterval(() => {
      if (this.coordinator && this.coordinator.state === "playing") {
        this.coordinator.submitMove(this.coordinator.localPeerId, randomMove());
      }
    }, 600);
  }

  async _handleFailover() {
    console.log(`[Agent] Coordinator disconnected! Initiating failover...`);

    const lastState = this.client.lastState;
    this.client.disconnect();

    this.isCoordinator = true;
    this.coordinator = new MatchCoordinator({
      matchId: this.matchId,
      hostRole: this.assignedRole,
      onComplete: (winner) => {
        console.log(`[Agent] Match ended after failover. Winner: ${winner}`);
        clearInterval(this.moveTimer);
        setTimeout(() => process.exit(0), 1000);
      },
      resumeFrom: lastState,
    });

    try {
      await this.coordinator.start();
      console.log(`[Agent] Became new coordinator! Waiting for reconnecting agents...`);

      this.moveTimer = setInterval(() => {
        if (this.coordinator && this.coordinator.state === "playing") {
          this.coordinator.submitMove(this.coordinator.localPeerId, randomMove());
        }
      }, 600);
    } catch (err) {
      this.isCoordinator = false;
      if (err.message.startsWith("COORDINATOR_CLAIM_FAILED:")) {
        const newCoordId = err.message.split(":")[1];
        console.log(`[Agent] Another agent claimed coordinator (${newCoordId}). Reconnecting...`);

        try {
          await this.client.reconnectToCoordinator(newCoordId);
          console.log(`[Agent] Reconnected to new coordinator`);
          this.client.failoverInProgress = false;
        } catch (reconnErr) {
          console.error(`[Agent] Failed to reconnect: ${reconnErr.message}`);
          setTimeout(() => this._handleFailover(), 2000);
        }
      } else {
        console.error(`[Agent] Failover error: ${err.message}`);
        setTimeout(() => this._handleFailover(), 2000);
      }
    }
  }
}

async function main() {
  const args = parseArgs();
  const role = args.role || (Math.random() < 0.5 ? "pacman" : "ghost");
  console.log(`[DummyAgent] Starting, role: ${role}`);

  const agent = new DummyAgent(role);
  await agent.start();

  process.on("SIGINT", () => {
    if (agent.client) agent.client.disconnect();
    clearInterval(agent.moveTimer);
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(`[DummyAgent] Fatal: ${err.message}`);
  process.exit(1);
});
