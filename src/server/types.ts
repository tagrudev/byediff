export type LineType = "add" | "del" | "context";

export interface DiffLine {
  type: LineType;
  oldNo: number | null;
  newNo: number | null;
  content: string;
}

export interface Hunk {
  header: string;
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
}

export type FileStatus =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked";

export interface FileDiff {
  path: string;
  oldPath: string | null;
  status: FileStatus;
  additions: number;
  deletions: number;
  hunks: Hunk[];
  binary: boolean;
}

export interface DiffModel {
  branch: string | null;
  files: FileDiff[];
}

export type CommentStatus = "open" | "resolved" | "stale";

export interface Reply {
  author: "agent";
  body: string;
  at: string;
}

export interface Comment {
  id: string;
  file: string;
  side: "new" | "old";
  line: number;
  anchorContent: string;
  body: string;
  status: CommentStatus;
  replies: Reply[];
  createdAt: string;
}

export type RuleSource = "global" | "project";

export interface Rule {
  id: string;
  text: string;
}

export interface RuleSection {
  heading: string | null;
  level: number;
  rules: Rule[];
}

export interface RuleFile {
  source: RuleSource;
  path: string;
  sections: RuleSection[];
}

export interface MemoryNote {
  name: string;
  path: string;
  description: string;
  type: string;
  body: string;
}

export interface MemoryModel {
  ruleFiles: RuleFile[];
  notesDir: string;
  notes: MemoryNote[];
}
