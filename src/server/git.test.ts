import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDiff, buildUntrackedFileDiff, computeDiff, computeRangeDiff, listBranches, defaultBase } from "./git.js";

const SAMPLE = `diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,4 +1,5 @@
 const a = 1;
-const b = 2;
+const b = 20;
+const c = 3;
 const d = 4;
`;

describe("parseDiff", () => {
  it("maps a modified file into the diff model", () => {
    const files = parseDiff(SAMPLE);
    expect(files).toHaveLength(1);
    const file = files[0]!;
    expect(file.path).toBe("src/app.ts");
    expect(file.status).toBe("modified");
    expect(file.additions).toBe(2);
    expect(file.deletions).toBe(1);
    expect(file.hunks).toHaveLength(1);

    const lines = file.hunks[0]!.lines;
    const added = lines.filter((l) => l.type === "add");
    expect(added.map((l) => l.content)).toEqual(["const b = 20;", "const c = 3;"]);
    expect(added[0]!.newNo).toBe(2);
    expect(added[0]!.oldNo).toBeNull();

    const del = lines.find((l) => l.type === "del")!;
    expect(del.content).toBe("const b = 2;");
    expect(del.oldNo).toBe(2);
    expect(del.newNo).toBeNull();

    const ctx = lines.find((l) => l.type === "context")!;
    expect(ctx.oldNo).toBe(1);
    expect(ctx.newNo).toBe(1);
  });
});

describe("buildUntrackedFileDiff", () => {
  it("renders an untracked file as all-additions", () => {
    const file = buildUntrackedFileDiff("src/new.ts", "line one\nline two\n");
    expect(file.status).toBe("untracked");
    expect(file.deletions).toBe(0);
    expect(file.additions).toBe(2);
    expect(file.hunks).toHaveLength(1);
    const lines = file.hunks[0]!.lines;
    expect(lines.every((l) => l.type === "add")).toBe(true);
    expect(lines.map((l) => l.newNo)).toEqual([1, 2]);
    expect(lines.map((l) => l.content)).toEqual(["line one", "line two"]);
  });
});

describe("computeDiff (real git)", () => {
  let repo: string;
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repo, encoding: "utf8" });

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "byediff-git-"));
    git("init", "-q");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "Test");
    writeFileSync(join(repo, "tracked.txt"), "alpha\nbeta\ngamma\n");
    git("add", "-A");
    git("commit", "-qm", "init");
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("returns modified tracked files and untracked files", () => {
    writeFileSync(join(repo, "tracked.txt"), "alpha\nBETA\ngamma\n");
    writeFileSync(join(repo, "fresh.txt"), "brand new\n");

    const model = computeDiff(repo);
    const paths = model.files.map((f) => f.path).sort();
    expect(paths).toEqual(["fresh.txt", "tracked.txt"]);

    const tracked = model.files.find((f) => f.path === "tracked.txt")!;
    expect(tracked.status).toBe("modified");
    expect(tracked.additions).toBe(1);
    expect(tracked.deletions).toBe(1);

    const fresh = model.files.find((f) => f.path === "fresh.txt")!;
    expect(fresh.status).toBe("untracked");
    expect(fresh.additions).toBe(1);
    expect(model.branch).toBeTruthy();
  });

  it("returns an empty file list for a clean tree", () => {
    const model = computeDiff(repo);
    expect(model.files).toEqual([]);
  });
});

describe("branch comparison (real git)", () => {
  let repo: string;
  let baseBranch: string;
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repo, encoding: "utf8" });

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "byediff-range-"));
    git("init", "-q");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "Test");
    writeFileSync(join(repo, "base.txt"), "one\ntwo\nthree\n");
    git("add", "-A");
    git("commit", "-qm", "init");
    baseBranch = git("rev-parse", "--abbrev-ref", "HEAD").trim();

    git("checkout", "-qb", "feature");
    writeFileSync(join(repo, "base.txt"), "one\nTWO\nthree\n");
    git("add", "-A");
    git("commit", "-qm", "feature change");

    // a base-only commit after divergence — must NOT appear in a three-dot diff
    git("checkout", "-q", baseBranch);
    writeFileSync(join(repo, "base-only.txt"), "added on base\n");
    git("add", "-A");
    git("commit", "-qm", "base advances");
    git("checkout", "-q", "feature");
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("diffs the branch against the base using merge-base (three-dot)", () => {
    const model = computeRangeDiff(repo, baseBranch);
    const paths = model.files.map((f) => f.path);
    expect(paths).toEqual(["base.txt"]);
    expect(paths).not.toContain("base-only.txt");

    const changed = model.files[0]!;
    expect(changed.status).toBe("modified");
    expect(changed.additions).toBe(1);
    expect(changed.deletions).toBe(1);
    expect(model.branch).toBe("feature");
  });

  it("lists local branches excluding the current branch", () => {
    const branches = listBranches(repo);
    expect(branches).toContain(baseBranch);
    expect(branches).not.toContain("feature");
  });

  it("prefers master/main as the default base", () => {
    expect(defaultBase(repo)).toBe(baseBranch);
  });
});
