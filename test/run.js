#!/usr/bin/env node
/**
 * Test runner: starts a hardhat node, runs QNNS tests, then stops the node.
 * Usage: node test/run.js
 */
const { spawn } = require("child_process");
const http = require("http");

const HARDHAT_PORT = 8545;
const HARDHAT_URL = `http://127.0.0.1:${HARDHAT_PORT}`;

function waitForNode(maxAttempts = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      const req = http.request(HARDHAT_URL, { method: "POST", headers: { "Content-Type": "application/json" } }, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve());
      });
      req.on("error", () => {
        if (attempts >= maxAttempts) {
          reject(new Error("Hardhat node did not start"));
        } else {
          setTimeout(check, 500);
        }
      });
      req.write(JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }));
      req.end();
    };
    check();
  });
}

async function main() {
  console.log("Starting hardhat node...");
  const node = spawn("npx", ["hardhat", "node", "--port", String(HARDHAT_PORT)], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  node.stdout.on("data", () => {}); // drain
  node.stderr.on("data", () => {}); // drain

  try {
    await waitForNode();
    console.log("Hardhat node ready.\n");

    const test = spawn("node", ["--test", "test/QNNS.test.js"], {
      stdio: "inherit",
      env: { ...process.env },
    });

    const exitCode = await new Promise((resolve) => {
      test.on("close", resolve);
    });

    process.exitCode = exitCode;
  } finally {
    node.kill("SIGTERM");
    // Give it a moment to shut down
    await new Promise((r) => setTimeout(r, 500));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
