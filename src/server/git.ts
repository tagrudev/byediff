import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import parse from "parse-diff";
import type { DiffModel, FileDiff, FileStatus, Hunk, DiffLine } from "./types.js";

function stripPrefix(path: string | undefined): string | null {
  if (!path || path === "/dev/null") return null;
  return path.replace(/^[ab]\//, "");
}

function fileStatus(file: parse.File): FileStatus {
  if (file.new) return "added";
  if (file.deleted) return "deleted";
  if (file.from && file.to && file.from !== file.to) return "renamed";
  return "modified";
}

export function parseDiff(raw: string): FileDiff[] {
  return parse(raw).map((file): FileDiff => {
    const path = stripPrefix(file.to) ?? stripPrefix(file.from) ?? "";
    const oldPath = stripPrefix(file.from);
    const hunks: Hunk[] = file.chunks.map((chunk) => ({
      header: chunk.content,
      oldStart: chunk.oldStart,
      newStart: chunk.newStart,
      lines: chunk.changes.map((change): DiffLine => {
        if (change.type === "add") {
          return { type: "add", oldNo: null, newNo: change.ln, content: change.content.slice(1) };
        }
        if (change.type === "del") {
          return { type: "del", oldNo: change.ln, newNo: null, content: change.content.slice(1) };
        }
        return { type: "context", oldNo: change.ln1, newNo: change.ln2, content: change.content.slice(1) };
      }),
    }));
    return {
      path,
      oldPath: oldPath === path ? null : oldPath,
      status: fileStatus(file),
      additions: file.additions,
      deletions: file.deletions,
      hunks,
      binary: hunks.length === 0,
    };
  });
}

export function buildUntrackedFileDiff(path: string, content: string): FileDiff {
  const raw = content.endsWith("\n") ? content.slice(0, -1) : content;
  const rows = raw.length === 0 ? [] : raw.split("\n");
  const lines: DiffLine[] = rows.map((text, i) => ({
    type: "add",
    oldNo: null,
    newNo: i + 1,
    content: text,
  }));
  return {
    path,
    oldPath: null,
    status: "untracked",
    additions: lines.length,
    deletions: 0,
    hunks: lines.length === 0 ? [] : [{ header: `@@ -0,0 +1,${lines.length} @@`, oldStart: 0, newStart: 1, lines }],
    binary: false,
  };
}

function git(repoPath: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: repoPath,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

export function currentBranch(repoPath: string): string | null {
  try {
    return git(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]).trim() || null;
  } catch {
    return null;
  }
}

export function listBranches(repoPath: string): string[] {
  try {
    const out = git(repoPath, ["for-each-ref", "--format=%(refname:short)", "refs/heads"]);
    const current = currentBranch(repoPath);
    return out.split("\n").map((b) => b.trim()).filter((b) => b && b !== current);
  } catch {
    return [];
  }
}

export function defaultBase(repoPath: string): string | null {
  const branches = listBranches(repoPath);
  return branches.find((b) => b === "master") ?? branches.find((b) => b === "main") ?? branches[0] ?? null;
}

function trackedDiff(repoPath: string): FileDiff[] {
  try {
    return parseDiff(git(repoPath, ["diff", "HEAD"]));
  } catch {
    return parseDiff(git(repoPath, ["diff"]));
  }
}

function untrackedDiffs(repoPath: string): FileDiff[] {
  const out = git(repoPath, ["ls-files", "--others", "--exclude-standard", "-z"]);
  const paths = out.split("\u0000").filter(Boolean);
  const files: FileDiff[] = [];
  for (const path of paths) {
    try {
      const content = readFileSync(join(repoPath, path), "utf8");
      if (content.includes("\u0000")) {
        files.push({ path, oldPath: null, status: "untracked", additions: 0, deletions: 0, hunks: [], binary: true });
      } else {
        files.push(buildUntrackedFileDiff(path, content));
      }
    } catch {
      // unreadable (e.g. removed mid-scan) — skip
    }
  }
  return files;
}

export function computeDiff(repoPath: string): DiffModel {
  const files = [...trackedDiff(repoPath), ...untrackedDiffs(repoPath)].sort((a, b) =>
    a.path.localeCompare(b.path),
  );
  return { branch: currentBranch(repoPath), files };
}

export function computeRangeDiff(repoPath: string, base: string): DiffModel {
  const files = parseDiff(git(repoPath, ["diff", `${base}...HEAD`])).sort((a, b) =>
    a.path.localeCompare(b.path),
  );
  return { branch: currentBranch(repoPath), files };
}
