#!/usr/bin/env node
/**
 * TruTicket Full-Stack Project Runner
 * Starts all TruTicket services concurrently:
 *  1. ML Risk Service (FastAPI + Random Forest + Kinematics) on :8000
 *  2. Next.js Web App (Organizer, Admin, Attendee) on :3000
 *  3. Mobile App (Expo Metro Bundler) on :8081
 */

const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const ML_DIR = path.join(ROOT_DIR, "services", "ml");
const WEB_DIR = path.join(ROOT_DIR, "apps", "web");
const MOBILE_DIR = path.join(ROOT_DIR, "apps", "mobile");

console.log("\x1b[36m%s\x1b[0m", "==================================================");
console.log("\x1b[36m%s\x1b[0m", "  TruTicket — Unified Full-Stack Project Runner");
console.log("\x1b[36m%s\x1b[0m", "==================================================");

let mlProcess = null;
let webProcess = null;
let mobileProcess = null;

function log(tag, color, msg) {
  const lines = msg.toString().trim().split("\n");
  for (const line of lines) {
    if (line.trim()) {
      console.log(`\x1b[${color}m[${tag}]\x1b[0m ${line}`);
    }
  }
}

// 1. Start ML Service (Python FastAPI)
console.log("\x1b[35m%s\x1b[0m", "-> [1/3] Starting ML Risk Service on http://127.0.0.1:8000...");

mlProcess = spawn("python", ["-m", "uvicorn", "services.ml.main:app", "--host", "127.0.0.1", "--port", "8000"], {
  cwd: ROOT_DIR,
  shell: true,
  env: { ...process.env, PYTHONUNBUFFERED: "1" },
});

mlProcess.stdout.on("data", (d) => log("ML", "35", d));
mlProcess.stderr.on("data", (d) => log("ML", "35", d));

mlProcess.on("close", (code) => {
  log("ML", "31", `ML service exited with code ${code}`);
});

// 2. Wait for ML Service, then start Web and Mobile
function waitForMl(retries = 30) {
  if (retries <= 0) {
    console.log("\x1b[31m%s\x1b[0m", "ML Service took too long to respond. Starting Web & Mobile anyway...");
    startWebAndMobile();
    return;
  }

  const req = http.get("http://127.0.0.1:8000/health", (res) => {
    if (res.statusCode === 200) {
      console.log("\x1b[32m%s\x1b[0m", "✓ TruTicket ML Risk Service is HEALTHY (3-Class RF Model + Kinematic Rules loaded)!");
      startWebAndMobile();
    } else {
      setTimeout(() => waitForMl(retries - 1), 1000);
    }
  });

  req.on("error", () => {
    setTimeout(() => waitForMl(retries - 1), 1000);
  });
}

function startWebAndMobile() {
  // Start Web
  console.log("\x1b[36m%s\x1b[0m", "-> [2/3] Starting Next.js Web App on http://localhost:3000...");
  webProcess = spawn("npm.cmd", ["run", "dev"], {
    cwd: WEB_DIR,
    shell: true,
  });

  webProcess.stdout.on("data", (d) => log("WEB", "36", d));
  webProcess.stderr.on("data", (d) => log("WEB", "36", d));

  webProcess.on("close", (code) => {
    log("WEB", "31", `Web process exited with code ${code}`);
  });

  // Start Mobile
  console.log("\x1b[33m%s\x1b[0m", "-> [3/3] Starting Expo Mobile Bundler on http://localhost:8081...");
  mobileProcess = spawn("npx.cmd", ["expo", "start", "--port", "8081"], {
    cwd: MOBILE_DIR,
    shell: true,
  });

  mobileProcess.stdout.on("data", (d) => log("MOBILE", "33", d));
  mobileProcess.stderr.on("data", (d) => log("MOBILE", "33", d));

  mobileProcess.on("close", (code) => {
    log("MOBILE", "31", `Mobile bundler exited with code ${code}`);
  });
}

waitForMl();

// Clean up child processes on exit
function shutdown() {
  console.log("\n\x1b[33m%s\x1b[0m", "Shutting down all TruTicket processes...");
  if (mlProcess) mlProcess.kill();
  if (webProcess) webProcess.kill();
  if (mobileProcess) mobileProcess.kill();
  process.exit();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
