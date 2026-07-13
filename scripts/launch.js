const { spawn } = require("child_process");
const path = require("path");

const root = "D:\\AI_agent game\\pacmesh";

function start(cmd, args, delay = 0) {
  setTimeout(() => {
    const p = spawn(cmd, args, {
      cwd: root,
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });
    p.unref();
    console.log(`  Started: ${cmd} ${args.slice(0,2).join(" ")}`);
  }, delay);
}

console.log("Starting PacMesh Live Demo...");

// Kill any leftover node on our ports first
try { require("child_process").execSync("netstat -ano | findstr \":9876 :3000\"", { stdio: "pipe" }); } catch(e) {}

start("node", ["src/networking/directory-server.js"], 0);
start("node", [require.resolve("./static-server.js")], 2000);

// Agent 1 — becomes coordinator. Give it 14s to fully register.
start("node", ["src/agents/dummy-agent.js", "--role", "pacman"], 6000);

// Remaining 3 agents join after coordinator is ready
start("node", ["src/agents/dummy-agent.js", "--role", "pacman"], 20000);
start("node", ["src/agents/dummy-agent.js", "--role", "ghost"], 23000);
start("node", ["src/agents/dummy-agent.js", "--role", "ghost"], 26000);

// Open browser after all agents have joined
setTimeout(() => {
  const p = spawn("cmd", ["/c", "start", "http://localhost:3000"], {
    detached: true,
    stdio: "ignore",
  });
  p.unref();
  console.log("  Browser opened to http://localhost:3000");
  console.log("All processes launched!");
}, 35000);
