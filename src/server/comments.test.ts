import { describe, it, expect, beforeEach } from "vitest";
import { CommentStore } from "./comments.js";

describe("CommentStore", () => {
  let store: CommentStore;

  beforeEach(() => {
    store = new CommentStore();
  });

  it("adds an open comment with defaults", () => {
    const c = store.add({ file: "a.ts", line: 3, body: "rename this", anchorContent: "const x = 1;" });
    expect(c.id).toBeTruthy();
    expect(c.status).toBe("open");
    expect(c.side).toBe("new");
    expect(c.replies).toEqual([]);
    expect(c.createdAt).toBeTruthy();
    expect(store.list()).toHaveLength(1);
  });

  it("filters list by status", () => {
    store.add({ file: "a.ts", line: 1, body: "x", anchorContent: "a" });
    const b = store.add({ file: "a.ts", line: 2, body: "y", anchorContent: "b" });
    store.resolve(b.id, "fixed");
    expect(store.list("open")).toHaveLength(1);
    expect(store.list("resolved")).toHaveLength(1);
  });

  it("updates and deletes", () => {
    const c = store.add({ file: "a.ts", line: 1, body: "x", anchorContent: "a" });
    store.update(c.id, "y");
    expect(store.get(c.id)!.body).toBe("y");
    store.delete(c.id);
    expect(store.get(c.id)).toBeUndefined();
  });

  it("resolves with an agent reply", () => {
    const c = store.add({ file: "a.ts", line: 1, body: "x", anchorContent: "a" });
    const resolved = store.resolve(c.id, "renamed to y")!;
    expect(resolved.status).toBe("resolved");
    expect(resolved.replies).toHaveLength(1);
    expect(resolved.replies[0]).toMatchObject({ author: "agent", body: "renamed to y" });
    expect(resolved.replies[0]!.at).toBeTruthy();
  });

  describe("reanchor", () => {
    it("keeps a comment open when its anchored line still matches", () => {
      store.add({ file: "a.ts", line: 2, body: "x", anchorContent: "const b = 2;" });
      store.reanchor((file, line) => (file === "a.ts" && line === 2 ? "const b = 2;" : null));
      expect(store.list()[0]!.status).toBe("open");
    });

    it("marks a comment stale when the line drifts", () => {
      store.add({ file: "a.ts", line: 2, body: "x", anchorContent: "const b = 2;" });
      store.reanchor(() => "const b = 99;");
      expect(store.list()[0]!.status).toBe("stale");
    });

    it("marks stale when the line no longer exists", () => {
      store.add({ file: "a.ts", line: 9, body: "x", anchorContent: "gone" });
      store.reanchor(() => null);
      expect(store.list()[0]!.status).toBe("stale");
    });

    it("restores a stale comment to open when content reappears", () => {
      const c = store.add({ file: "a.ts", line: 2, body: "x", anchorContent: "const b = 2;" });
      store.reanchor(() => "drifted");
      expect(store.get(c.id)!.status).toBe("stale");
      store.reanchor(() => "const b = 2;");
      expect(store.get(c.id)!.status).toBe("open");
    });

    it("never reopens or restales a resolved comment", () => {
      const c = store.add({ file: "a.ts", line: 2, body: "x", anchorContent: "const b = 2;" });
      store.resolve(c.id, "done");
      store.reanchor(() => "totally different");
      expect(store.get(c.id)!.status).toBe("resolved");
    });
  });
});
