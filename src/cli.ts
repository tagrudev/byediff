#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createServer as createHttpServer, type Server } from "node:http";
import open from "open";
import { createServer } from "./server/index.js";
import { registerInstance, unregisterInstance } from "./server/registry.js";

interface Options {
  port: number;
  open: boolean;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { port: 7777, open: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--no-open") opts.open = false;
    else if (arg === "--port") opts.port = Number(argv[++i]);
    else if (arg?.startsWith("--port=")) opts.port = Number(arg.slice(7));
  }
  return opts;
}

function isGitRepo(cwd: string): boolean {
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function listen(server: Server, startPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    let port = startPort;
    const attempt = () => {
      server.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE" && port < startPort + 50) {
          port++;
          attempt();
        } else {
          reject(err);
        }
      });
      server.listen(port, "127.0.0.1", () => resolve(port));
    };
    attempt();
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const repoPath = process.cwd();

  if (!isGitRepo(repoPath)) {
    console.error("byediff: not a git repository — run inside a project with git.");
    process.exit(1);
  }

  const handle = createServer(repoPath);
  const server = createHttpServer(handle.app);
  const port = await listen(server, opts.port);
  const url = `http://localhost:${port}`;

  registerInstance({ repoPath, port, pid: process.pid });

  const shutdown = () => {
    unregisterInstance(repoPath);
    handle.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log(`byediff reviewing ${repoPath}`);
  console.log(`  ${url}`);
  if (opts.open) await open(url).catch(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
