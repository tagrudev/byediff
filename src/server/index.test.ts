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

describe("server API — branch comparison (real http + git)", () => {
  let repo: string;
  let handle: ServerHandle;
  let server: Server;
  let base: string;
  let baseBranch: string;

  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });

  beforeEach(async () => {
    repo = mkdtempSync(join(tmpdir(), "byediff-srvrange-"));
    git("init", "-q");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "Test");
    writeFileSync(join(repo, "app.ts"), "const a = 1;\nconst b = 2;\n");
    git("add", "-A");
    git("commit", "-qm", "init");
    baseBranch = git("rev-parse", "--abbrev-ref", "HEAD").trim();

    git("checkout", "-qb", "feature");
    writeFileSync(join(repo, "app.ts"), "const a = 1;\nconst b = 2;\nconst committed = 3;\n");
    git("add", "-A");
    git("commit", "-qm", "branch work");

    // an uncommitted edit that only the working-tree diff should reflect
    writeFileSync(join(repo, "app.ts"), "const a = 1;\nconst b = 2;\nconst committed = 3;\nconst dirty = 4;\n");

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

  it("diffs the branch against the base via ?base", async () => {
    const ranged = await (await fetch(`${base}/api/diff?base=${baseBranch}`)).json();
    const file = ranged.files.find((f: { path: string }) => f.path === "app.ts");
    const added = file.hunks.flatMap((h: { lines: { type: string; content: string }[] }) => h.lines)
      .filter((l: { type: string }) => l.type === "add")
      .map((l: { content: string }) => l.content);
    expect(added).toContain("const committed = 3;");
    expect(added).not.toContain("const dirty = 4;");
  });

  it("still serves the working-tree diff with no base", async () => {
    const wt = await (await fetch(`${base}/api/diff`)).json();
    const file = wt.files.find((f: { path: string }) => f.path === "app.ts");
    const added = file.hunks.flatMap((h: { lines: { type: string; content: string }[] }) => h.lines)
      .filter((l: { type: string }) => l.type === "add")
      .map((l: { content: string }) => l.content);
    expect(added).toContain("const dirty = 4;");
  });

  it("exposes branches and a default base in meta", async () => {
    const meta = await (await fetch(`${base}/api/meta`)).json();
    expect(meta.branch).toBe("feature");
    expect(meta.branches).toContain(baseBranch);
    expect(meta.branches).not.toContain("feature");
    expect(meta.defaultBase).toBe(baseBranch);
  });

  it("rejects an unknown base with 400", async () => {
    const res = await fetch(`${base}/api/diff?base=does-not-exist`);
    expect(res.status).toBe(400);
  });
});
