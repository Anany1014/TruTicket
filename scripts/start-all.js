#!/usr/bin/env node
/**
 * TruTicket Project Runner
 * Starts the ML Risk Service (FastAPI) and Next.js Web App concurrently,
 * monitoring health and printing unified logs.
 */

const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const ML_DIR = path.join(ROOT_DIR, "services", "ml");
const WEB_DIR = path.join(ROOT_DIR, "apps", "web");

console.log("\x1b[36m%s\x1b[0m", "==================================================");
console.log("\x1b[36m%s\x1b[0m", "  TruTicket — Unified Project Runner");
console.log("\x1b[36m%s\x1b[0m", "==================================================");

let mlProcess = null;
let webProcess = null;

function log(tag, color, msg) {
  const lines = msg.toString().trim().split("\n");
  for (const line of lines) {
    if (line.trim()) {
      console.log(`\x1b[${color}m[${tag}]\x1b[0m ${line}`);
    }
  }
}

// 1. Start ML Service (Python FastAPI)
console.log("\x1b[33m%s\x1b[0m", "-> Starting ML Risk Service on http://127.0.0.1:8000...");

mlProcess = spawn("python", ["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"], {
  cwd: ML_DIR,
  shell: true,
  env: { ...process.env, PYTHONUNBUFFERED: "1" },
});

mlProcess.stdout.on("data", (d) => log("ML", "35", d));
mlProcess.stderr.on("data", (d) => log("ML", "35", d));

mlProcess.on("close", (code) => {
  log("ML", "31", `ML process exited with code ${code}`);
});

// 2. Wait for ML Service to be ready, then start Web
function waitForMl(retries = 30) {
  if (retries <= 0) {
    console.log("\x1b[31m%s\x1b[0m", "ML Service took too long to start. Starting web anyway...");
    startWeb();
    return;
  }

  const req = http.get("http://127.0.0.1:8000/health", (res) => {
    if (res.statusCode === 200) {
      console.log("\x1b[32m%s\x1b[0m", "✓ TruTicket ML Risk Service is HEALTHY (Random Forest + Kinematics loaded)!");
      startWeb();
    } else {
      setTimeout(() => waitForMl(retries - 1), 1000);
    }
  });

  req.on("error", () => {
    setTimeout(() => waitForMl(retries - 1), 1000);
  });
}

function startWeb() {
  console.log("\x1b[33m%s\x1b[0m", "-> Starting Next.js Web App on http://localhost:3000...");
  
  webProcess = spawn("npm.cmd", ["run", "dev"], {
    cwd: WEB_DIR,
    shell: true,
  });

  webProcess.stdout.on("data", (d) => log("WEB", "36", d));
  webProcess.stderr.on("data", (d) => log("WEB", "36", d));

  webProcess.on("close", (code) => {
    log("WEB", "31", `Web process exited with code ${code}`);
  });
}

waitForMl();

// Cleanup on exit
function shutdown() {
  console.log("\n\x1b[33m%s\x1b[0m", "Shutting down TruTicket processes...");
  if (mlProcess) mlProcess.kill();
  if (webProcess) webProcess.kill();
  process.exit();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
