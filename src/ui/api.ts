import type { DiffModel, Comment } from "../server/types";

export type { DiffModel, Comment, FileDiff, Hunk, DiffLine } from "../server/types";

export interface Meta {
  repoPath: string;
  branch: string | null;
  branches: string[];
  defaultBase: string | null;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  meta: () => fetch("/api/meta").then(json<Meta>),
  diff: (base?: string) =>
    fetch("/api/diff" + (base ? `?base=${encodeURIComponent(base)}` : "")).then(json<DiffModel>),
  comments: () => fetch("/api/comments").then(json<Comment[]>),
  addComment: (input: { file: string; line: number; body: string; anchorContent: string }) =>
    fetch("/api/comments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }).then(json<Comment>),
  updateComment: (id: string, body: string) =>
    fetch(`/api/comments/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body }),
    }).then(json<Comment>),
  deleteComment: (id: string) => fetch(`/api/comments/${id}`, { method: "DELETE" }),
};
