import express from "express";
import type { Request, Response } from "express";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { computeDiff, computeRangeDiff, currentBranch, listBranches, defaultBase } from "./git.js";
import { deleteNote, deleteRule, memoryPaths, readMemory } from "./memory.js";
import { CommentStore, type LineReader } from "./comments.js";
import { watchRepo } from "./watcher.js";

const UI_DIR = fileURLToPath(new URL("./ui", import.meta.url));

export interface ServerHandle {
  app: express.Express;
  store: CommentStore;
  refresh(): void;
  close(): void;
}

function workingLineReader(repoPath: string): LineReader {
  return (file, line) => {
    try {
      const lines = readFileSync(join(repoPath, file), "utf8").split("\n");
      return lines[line - 1] ?? null;
    } catch {
      return null;
    }
  };
}

export function createServer(repoPath: string, home: string = homedir()): ServerHandle {
  const app = express();
  app.use(express.json({ limit: "4mb" }));

  const store = new CommentStore();
  const reader = workingLineReader(repoPath);
  const clients = new Set<Response>();

  const broadcast = (event: string, data: unknown) => {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of clients) client.write(payload);
  };

  const refresh = () => {
    store.reanchor(reader);
    broadcast("diffUpdated", { at: new Date().toISOString() });
  };

  app.get("/api/meta", (_req, res) => {
    res.json({
      repoPath,
      branch: currentBranch(repoPath),
      branches: listBranches(repoPath),
      defaultBase: defaultBase(repoPath),
    });
  });

  app.get("/api/diff", (req, res) => {
    const base = (req.query.base as string | undefined)?.trim();
    if (!base) {
      res.json(computeDiff(repoPath));
      return;
    }
    if (!listBranches(repoPath).includes(base)) {
      res.status(400).json({ error: `unknown branch: ${base}` });
      return;
    }
    res.json(computeRangeDiff(repoPath, base));
  });

  app.get("/api/comments", (req, res) => {
    const status = req.query.status as "open" | "resolved" | "stale" | undefined;
    res.json(store.list(status));
  });

  app.post("/api/comments", (req: Request, res: Response) => {
    const { file, side, line, body, anchorContent } = req.body ?? {};
    if (!file || typeof line !== "number" || !body) {
      res.status(400).json({ error: "file, line and body are required" });
      return;
    }
    const comment = store.add({ file, side, line, body, anchorContent: anchorContent ?? "" });
    broadcast("commentsChanged", { reason: "added" });
    res.status(201).json(comment);
  });

  app.patch("/api/comments/:id", (req, res) => {
    const updated = store.update(req.params.id, req.body?.body ?? "");
    if (!updated) {
      res.status(404).json({ error: "not found" });
      return;
    }
    broadcast("commentsChanged", { reason: "updated" });
    res.json(updated);
  });

  app.delete("/api/comments/:id", (req, res) => {
    const ok = store.delete(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "not found" });
      return;
    }
    broadcast("commentsChanged", { reason: "deleted" });
    res.status(204).end();
  });

  app.post("/api/comments/:id/resolve", (req, res) => {
    const resolved = store.resolve(req.params.id, req.body?.reply ?? "");
    if (!resolved) {
      res.status(404).json({ error: "not found" });
      return;
    }
    broadcast("commentsChanged", { reason: "resolved" });
    res.json(resolved);
  });

  app.get("/api/memory", (_req, res) => {
    res.json(readMemory(repoPath, home));
  });

  app.delete("/api/memory/rules/:source/:id", (req, res) => {
    const file = memoryPaths(repoPath, home).ruleFiles.find((f) => f.source === req.params.source);
    if (!file) {
      res.status(404).json({ error: `no ${req.params.source} rule file` });
      return;
    }
    if (!deleteRule(file.path, req.params.id)) {
      res.status(409).json({ error: "that rule no longer matches the file on disk" });
      return;
    }
    res.status(204).end();
  });

  app.delete("/api/memory/notes/:name", (req, res) => {
    if (!deleteNote(memoryPaths(repoPath, home).notesDir, req.params.name)) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.status(204).end();
  });

  app.get("/api/events", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write("event: connected\ndata: {}\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
  });

  app.use(express.static(UI_DIR));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(join(UI_DIR, "index.html"));
  });

  const stopWatcher = watchRepo(repoPath, refresh);

  return {
    app,
    store,
    refresh,
    close: () => {
      stopWatcher();
      for (const client of clients) client.end();
      clients.clear();
    },
  };
}
