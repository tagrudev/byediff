import { randomUUID } from "node:crypto";
import type { Comment, CommentStatus } from "./types.js";

export interface CommentInput {
  file: string;
  side?: "new" | "old";
  line: number;
  body: string;
  anchorContent: string;
}

export type LineReader = (file: string, line: number) => string | null;

export class CommentStore {
  private comments = new Map<string, Comment>();

  add(input: CommentInput): Comment {
    const comment: Comment = {
      id: randomUUID(),
      file: input.file,
      side: input.side ?? "new",
      line: input.line,
      anchorContent: input.anchorContent,
      body: input.body,
      status: "open",
      replies: [],
      createdAt: new Date().toISOString(),
    };
    this.comments.set(comment.id, comment);
    return comment;
  }

  get(id: string): Comment | undefined {
    return this.comments.get(id);
  }

  list(status?: CommentStatus): Comment[] {
    const all = [...this.comments.values()];
    return status ? all.filter((c) => c.status === status) : all;
  }

  update(id: string, body: string): Comment | undefined {
    const comment = this.comments.get(id);
    if (!comment) return undefined;
    comment.body = body;
    return comment;
  }

  delete(id: string): boolean {
    return this.comments.delete(id);
  }

  resolve(id: string, reply: string): Comment | undefined {
    const comment = this.comments.get(id);
    if (!comment) return undefined;
    comment.status = "resolved";
    comment.replies.push({ author: "agent", body: reply, at: new Date().toISOString() });
    return comment;
  }

  reanchor(readLine: LineReader): void {
    for (const comment of this.comments.values()) {
      if (comment.status === "resolved") continue;
      if (comment.side !== "new") continue;
      const current = readLine(comment.file, comment.line);
      comment.status = current === comment.anchorContent ? "open" : "stale";
    }
  }
}
