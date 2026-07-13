const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const { startDirectory } = require("../src/networking/directory-server");

const AGENT_SCRIPT = path.join(__dirname, "..", "src", "agents", "dummy-agent.js");
const LLM_SCRIPT = path.join(__dirname, "..", "src", "agents", "llm-agent.js");
const TIMEOUT = 180000;
const MAX_AGENTS = 4;

function spawnAgent(script, port, role, index, extraEnv) {
  const args = [script, "--role", role];
  const env = { ...process.env, DIRECTORY_PORT: String(port), ...extraEnv };
  const proc = spawn("node", args, { env, stdio: ["ignore", "pipe", "pipe"] });
  const stdout = [];
  const stderr = [];
  proc.stdout.on("data", (d) => {
    const str = d.toString();
    stdout.push(str);
    process.stdout.write(`  [A${index}] ${str}`);
  });
  proc.stderr.on("data", (d) => {
    const str = d.toString();
    stderr.push(str);
    process.stderr.write(`  [A${index} ERR] ${str}`);
  });
  proc._stdout = stdout;
  proc._stderr = stderr;
  return proc;
}

function waitForExit(proc, index) {
  return new Promise((resolve) => {
    proc.on("exit", (code) => resolve({ code, index, stdout: proc._stdout.join(""), stderr: proc._stderr.join("") }));
    proc.on("error", (err) => resolve({ code: -1, index, error: err.message, stdout: proc._stdout.join(""), stderr: proc._stderr.join("") }));
  });
}

function ensureApiKey() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key === "sk-ant-...") {
    console.error(`
!!! ANTHROPIC_API_KEY not set or is placeholder.
!!! Set it before running:
!!!   $env:ANTHROPIC_API_KEY = "sk-ant-..."
!!! or pass it inline:
!!!   $env:ANTHROPIC_API_KEY = "sk-ant-..."; node tests/test-llm-agent.js
`);
    process.exit(1);
  }
}

function parseMetrics(stdout) {
  const metrics = {
    role: "unknown",
    totalStates: 0,
    llmCalls: 0,
    validMoves: 0,
    parseFailures: 0,
    llmErrors: 0,
    fallbackMoves: 0,
    avgLatency: "N/A",
    eliminated: "unknown",
  };

  const lines = stdout.split("\n");
  let inMetrics = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "=== LLM Agent Performance ===") { inMetrics = true; continue; }
    if (trimmed === "=============================") { inMetrics = false; continue; }
    if (!inMetrics) continue;

    const matchVal = (key) => {
      const re = new RegExp(`^${key}:\\s+(.+)$`);
      const m = trimmed.match(re);
      return m ? m[1] : null;
    };

    let v;
    if ((v = matchVal("Role"))) metrics.role = v;
    else if ((v = matchVal("Game states seen"))) metrics.totalStates = parseInt(v, 10);
    else if ((v = matchVal("LLM calls"))) metrics.llmCalls = parseInt(v, 10);
    else if ((v = matchVal("Valid moves"))) metrics.validMoves = parseInt(v, 10);
    else if ((v = matchVal("Parse failures"))) metrics.parseFailures = parseInt(v, 10);
    else if ((v = matchVal("LLM errors"))) metrics.llmErrors = parseInt(v, 10);
    else if ((v = matchVal("Fallback moves"))) metrics.fallbackMoves = parseInt(v, 10);
    else if ((v = matchVal("Avg latency"))) metrics.avgLatency = v;
    else if ((v = matchVal("Eliminated"))) metrics.eliminated = v;
  }
  return metrics;
}

async function main() {
  ensureApiKey();

  const server = await startDirectory();
  const port = server.address().port;
  console.log(`Directory on port ${port}\n`);

  console.log("=== LLM Agent Test: 1 LLM Pac-Man + 3 Dummy Agents ===\n");

  const procs = [];
  const startTime = Date.now();

  // Spawn LLM agent first so it gets Pac-Man slot
  console.log("  Spawning LLM agent (A0, Pac-Man)...");
  procs.push(spawnAgent(LLM_SCRIPT, port, "pacman", 0));
  await new Promise((r) => setTimeout(r, 2000));

  // Spawn 3 dummy agents
  const dummyRoles = ["pacman", "ghost", "ghost"];
  for (let i = 0; i < 3; i++) {
    console.log(`  Spawning dummy agent A${i + 1} (${dummyRoles[i]})...`);
    procs.push(spawnAgent(AGENT_SCRIPT, port, dummyRoles[i], i + 1));
    await new Promise((r) => setTimeout(r, 800));
  }

  const timeout = setTimeout(() => {
    console.error(`\nTIMEOUT after ${TIMEOUT}ms`);
    for (const p of procs) { try { p.kill(); } catch {} }
    process.exit(1);
  }, TIMEOUT);

  const promises = procs.map((p, i) => waitForExit(p, i));
  const results = await Promise.all(promises);
  clearTimeout(timeout);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n--- Match Results (${elapsed}s) ---`);

  // Parse LLM metrics from the LLM agent's output
  const llmResult = results.find((r) => r.index === 0);
  const metrics = llmResult ? parseMetrics(llmResult.stdout) : {};

  console.log(`\n  LLM Agent (index 0):`);
  if (metrics.avgLatency !== "N/A" && metrics.llmCalls > 0) {
    const successRate = metrics.llmCalls > 0
      ? ((metrics.validMoves / metrics.llmCalls) * 100).toFixed(1)
      : "N/A";
    console.log(`    Valid moves:     ${metrics.validMoves}/${metrics.llmCalls} (${successRate}%)`);
    console.log(`    Parse failures:  ${metrics.parseFailures}`);
    console.log(`    LLM errors:      ${metrics.llmErrors}`);
    console.log(`    Fallback moves:  ${metrics.fallbackMoves}`);
    console.log(`    Avg latency:     ${metrics.avgLatency} ms`);
    console.log(`    Eliminated:      ${metrics.eliminated}`);
    console.log(`    Exit code:       ${llmResult.code}`);
  } else {
    console.log(`    (No LLM metrics captured — agent may have been coordinator or exited early)`);
    console.log(`    Exit code:       ${llmResult.code}`);
  }

  for (const r of results) {
    if (r.index === 0) continue;
    const role = dummyRoles[r.index - 1];
    const ok = r.code === 0;
    console.log(`  Dummy Agent ${r.index} (${role}): ${ok ? "PASS" : "FAIL"} (exit ${r.code})`);
  }

  let allOk = results.every((r) => r.code === 0);
  if (allOk) {
    console.log("\n=== TEST PASSED ===");
  } else {
    console.log("\n=== TEST FAILED (some agents exited with non-zero) ===");
  }

  server.close();
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
