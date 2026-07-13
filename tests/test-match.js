const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const { startDirectory } = require("../src/networking/directory-server");

const AGENT_SCRIPT = path.join(__dirname, "..", "src", "agents", "dummy-agent.js");
const BASE_TIMEOUT = 120000;
const FAILOVER_TIMEOUT = 180000;
const MAX_AGENTS = 4;

function waitForDirectory(server) {
  const port = server.address().port;
  return new Promise((resolve, reject) => {
    const check = (attempt) => {
      const req = http.get(`http://localhost:${port}/api/matches`, (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve(port));
      });
      req.on("error", () => {
        if (attempt > 30) reject(new Error("Directory didn't start"));
        else setTimeout(() => check(attempt + 1), 200);
      });
      req.setTimeout(1000, () => { req.destroy(); check(attempt + 1); });
    };
    check(0);
  });
}

function spawnAgent(port, role, index, extraArgs) {
  const args = [AGENT_SCRIPT, "--role", role];
  if (extraArgs) args.push(...extraArgs);
  const env = { ...process.env, DIRECTORY_PORT: String(port) };
  const proc = spawn("node", args, { env, stdio: ["ignore", "pipe", "pipe"] });
  proc.stdout.on("data", (d) => process.stdout.write(`  [A${index}] ${d}`));
  proc.stderr.on("data", (d) => process.stderr.write(`  [A${index} ERR] ${d}`));
  return proc;
}

function waitForExit(proc, index) {
  return new Promise((resolve) => {
    proc.on("exit", (code) => resolve({ code, index }));
    proc.on("error", (err) => resolve({ code: -1, index, error: err.message }));
  });
}

async function waitForMatchPlaying(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${port}/api/matches`, (res) => {
          let d = "";
          res.on("data", (c) => (d += c));
          res.on("end", () => resolve(JSON.parse(d)));
        });
        req.on("error", reject);
        req.setTimeout(2000, () => { req.destroy(); reject(new Error("timeout")); });
      });
      for (const m of res.matches || []) {
        if (m.agents && m.agents.length >= 4) {
          // Wait a few seconds for WebRTC connections to establish
          await new Promise((r) => setTimeout(r, 3000));
          return m.matchId;
        }
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Match did not reach 4 agents in time");
}

async function runBasicMatch(server, port) {
  console.log("\n=== Test 1: Basic Match ===");
  console.log(`Spawning ${MAX_AGENTS} agents over real P2P WebRTC\n`);

  const roles = ["pacman", "pacman", "ghost", "ghost"];
  const procs = [];
  const startTime = Date.now();

  for (let i = 0; i < MAX_AGENTS; i++) {
    const p = spawnAgent(port, roles[i], i);
    procs.push(p);
    await new Promise((r) => setTimeout(r, 500));
  }

  const timeout = setTimeout(() => {
    console.error(`\nTIMEOUT after ${BASE_TIMEOUT}ms`);
    process.exit(1);
  }, BASE_TIMEOUT);

  const promises = procs.map((p, i) => waitForExit(p, i));
  const results = await Promise.all(promises);
  clearTimeout(timeout);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n--- Basic Match Results (${elapsed}s) ---`);

  let allOk = true;
  for (let i = 0; i < results.length; i++) {
    const ok = results[i].code === 0;
    if (!ok) allOk = false;
    console.log(`  Agent ${i} (${roles[i]}): ${ok ? "PASS" : "FAIL"} (exit ${results[i].code})`);
  }

  if (!allOk) throw new Error("Basic match test failed");
  console.log("\n✓ Basic match passed\n");
}

async function runFailoverMatch(server, port) {
  console.log("=== Test 2: Coordinator Failover ===");
  console.log("Starting coordinator first, then agents. Killing coordinator mid-match.\n");

  const roles = ["pacman", "pacman", "ghost", "ghost"];
  const procs = [];
  const startTime = Date.now();

  console.log("  Starting coordinator (A0) with --create...");
  procs.push(spawnAgent(port, roles[0], 0, ["--create"]));
  await new Promise((r) => setTimeout(r, 3000));

  for (let i = 1; i < MAX_AGENTS; i++) {
    console.log(`  Starting agent A${i}...`);
    procs.push(spawnAgent(port, roles[i], i));
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log("  Waiting for match to reach 4 agents...");
  let matchId;
  try {
    matchId = await waitForMatchPlaying(port, 40000);
    console.log(`  Match ${matchId} has 4 agents. Killing coordinator...`);
  } catch (err) {
    console.error(`  ${err.message}`);
    for (const p of procs) { try { p.kill(); } catch {} }
    throw err;
  }

  procs[0].kill("SIGINT");
  await new Promise((r) => setTimeout(r, 1500));
  try { procs[0].kill("SIGKILL"); } catch {}
  console.log("  Coordinator killed. Waiting for failover...\n");

  const remainingPromises = procs.slice(1).map((p, i) => waitForExit(p, i + 1));

  const timeout = setTimeout(() => {
    console.error(`\nTIMEOUT after ${FAILOVER_TIMEOUT}ms during failover test`);
    for (const p of procs) { try { p.kill(); } catch {} }
    process.exit(1);
  }, FAILOVER_TIMEOUT);

  const results = await Promise.all(remainingPromises);
  clearTimeout(timeout);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n--- Failover Results (${elapsed}s) ---`);

  let allOk = true;
  for (const r of results) {
    const ok = r.code === 0;
    if (!ok) allOk = false;
    console.log(`  Agent ${r.index} (${roles[r.index]}): ${ok ? "PASS" : "FAIL"} (exit ${r.code})`);
  }

  if (!allOk) throw new Error("Failover test failed");
  console.log("\n✓ Failover passed — remaining 3 agents completed the match");
}

async function main() {
  const server = await startDirectory();
  const port = server.address().port;
  console.log(`Directory on port ${port}\n`);

  async function finishMatch(matchId) {
    return new Promise((resolve, reject) => {
      const req = http.request({ hostname: "localhost", port, method: "POST", path: `/api/matches/${matchId}/finish`, headers: { "Content-Type": "application/json" } }, (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve());
      });
      req.on("error", reject);
      req.end();
    });
  }

  try {
    await runBasicMatch(server, port);
    // Finish any leftover matches from basic test so failover test doesn't find them
    {
      const res = await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${port}/api/matches`, (res) => {
          let d = "";
          res.on("data", (c) => (d += c));
          res.on("end", () => resolve(JSON.parse(d)));
        });
        req.on("error", reject);
      });
      for (const m of res.matches || []) {
        if (m.agents && m.agents.length >= 4) {
          try { await finishMatch(m.matchId); } catch {}
        }
      }
    }
    await new Promise((r) => setTimeout(r, 3000));
    await runFailoverMatch(server, port);
    console.log("\n=== ALL TESTS PASSED ===");
    server.close();
    process.exit(0);
  } catch (err) {
    console.error("\n✗ Test failed:", err.message);
    server.close();
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
