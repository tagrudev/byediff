import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { createServer as createHttpServer, type Server } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type ServerHandle } from "./index.js";

describe("server API (real http + git)", () => {
  let repo: string;
  let handle: ServerHandle;
  let server: Server;
  let base: string;

  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });

  beforeEach(async () => {
    repo = mkdtempSync(join(tmpdir(), "byediff-srv-"));
    git("init", "-q");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "Test");
    writeFileSync(join(repo, "app.ts"), "const a = 1;\nconst b = 2;\n");
    git("add", "-A");
    git("commit", "-qm", "init");
    writeFileSync(join(repo, "app.ts"), "const a = 1;\nconst b = 20;\n");

    handle = createServer(repo);
    server = createHttpServer(handle.app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    base = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    handle.close();
    await new Promise<void>((r) => server.close(() => r()));
    rmSync(repo, { recursive: true, force: true });
  });

  it("serves the working-tree diff", async () => {
    const diff = await (await fetch(`${base}/api/diff`)).json();
    expect(diff.files.map((f: { path: string }) => f.path)).toEqual(["app.ts"]);
  });

  it("runs the full comment lifecycle and re-anchors on refresh", async () => {
    const created = await (
      await fetch(`${base}/api/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file: "app.ts", line: 2, body: "use a const name", anchorContent: "const b = 20;" }),
      })
    ).json();
    expect(created.status).toBe("open");

    let open = await (await fetch(`${base}/api/comments?status=open`)).json();
    expect(open).toHaveLength(1);

    const resolved = await (
      await fetch(`${base}/api/comments/${created.id}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reply: "renamed to total" }),
      })
    ).json();
    expect(resolved.status).toBe("resolved");
    expect(resolved.replies[0].body).toBe("renamed to total");

    const second = await (
      await fetch(`${base}/api/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file: "app.ts", line: 2, body: "still here", anchorContent: "const b = 20;" }),
      })
    ).json();

    writeFileSync(join(repo, "app.ts"), "const a = 1;\nconst b = 999;\n");
    handle.refresh();

    const stale = await (await fetch(`${base}/api/comments`)).json();
    const drifted = stale.find((c: { id: string }) => c.id === second.id);
    expect(drifted.status).toBe("stale");
  });
});
