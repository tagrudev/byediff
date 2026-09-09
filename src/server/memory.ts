import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  MemoryModel,
  MemoryNote,
  RuleFile,
  RuleSection,
  RuleSource,
} from "./types.js";

const HEADING = /^(#{1,6})\s+(.*)$/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+/;
const FENCE = /^\s*(```+|~~~+)/;
const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?/;
const FIELD = /^\s*([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/;
const NOTE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

interface Block {
  id: string;
  text: string;
  start: number;
  end: number;
  heading: string | null;
  level: number;
  indent: number;
}

function blockId(ordinal: number, text: string): string {
  return createHash("sha256").update(`${ordinal}\n${text}`).digest("hex").slice(0, 12);
}

/**
 * Splits a CLAUDE.md into the units a reader would call individual rules: one list
 * item with everything nested under it, one paragraph, or one fenced code block.
 * A blank line ends a block; a list item at the same or shallower indent starts
 * the next one.
 */
function parseBlocks(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let heading: string | null = null;
  let level = 0;
  let current: Block | null = null;
  let fence: string | null = null;

  const extend = (block: Block, line: string, i: number) => {
    block.text += `\n${line}`;
    block.end = i;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fenceEdge = FENCE.exec(line);

    if (current && fence) {
      extend(current, line, i);
      if (fenceEdge && line.trim().startsWith(fence)) fence = null;
      continue;
    }

    const head = HEADING.exec(line);
    if (head) {
      heading = head[2]!.trim();
      level = head[1]!.length;
      current = null;
      continue;
    }

    if (line.trim() === "") {
      current = null;
      continue;
    }

    const indent = line.length - line.trimStart().length;
    if (current === null || (LIST_ITEM.test(line) && indent <= current.indent)) {
      current = { id: "", text: line, start: i, end: i, heading, level, indent };
      blocks.push(current);
    } else {
      extend(current, line, i);
    }
    if (fenceEdge) fence = fenceEdge[1]!;
  }

  return blocks.map((block, ordinal) => ({ ...block, id: blockId(ordinal, block.text) }));
}

export function parseRules(text: string): RuleSection[] {
  const sections: RuleSection[] = [];
  for (const block of parseBlocks(text)) {
    let section = sections.at(-1);
    if (!section || section.heading !== block.heading || section.level !== block.level) {
      section = { heading: block.heading, level: block.level, rules: [] };
      sections.push(section);
    }
    section.rules.push({ id: block.id, text: block.text });
  }
  return sections;
}

export function projectSlug(repoPath: string): string {
  return repoPath.replace(/[^a-zA-Z0-9]/g, "-");
}

export function memoryPaths(
  repoPath: string,
  home: string = homedir(),
): { ruleFiles: { source: RuleSource; path: string }[]; notesDir: string } {
  const ruleFiles: { source: RuleSource; path: string }[] = [
    { source: "global", path: join(home, ".claude", "CLAUDE.md") },
  ];
  const project = [join(repoPath, "CLAUDE.md"), join(repoPath, ".claude", "CLAUDE.md")].find(
    (path) => existsSync(path),
  );
  if (project) ruleFiles.push({ source: "project", path: project });

  return {
    ruleFiles,
    notesDir: join(home, ".claude", "projects", projectSlug(repoPath), "memory"),
  };
}

function readRuleFile(source: RuleSource, path: string): RuleFile | null {
  try {
    return { source, path, sections: parseRules(readFileSync(path, "utf8")) };
  } catch {
    return null;
  }
}

function frontmatterFields(raw: string): Record<string, string> {
  const match = FRONTMATTER.exec(raw);
  if (!match) return {};
  return Object.fromEntries(
    match[1]!
      .split("\n")
      .map((line) => FIELD.exec(line))
      .filter((field): field is RegExpExecArray => field !== null && field[2]!.trim() !== "")
      .map((field) => [field[1]!, field[2]!.trim()]),
  );
}

function readNote(dir: string, file: string): MemoryNote {
  const path = join(dir, file);
  const raw = readFileSync(path, "utf8");
  const fields = frontmatterFields(raw);
  return {
    name: fields.name ?? file.replace(/\.md$/, ""),
    path,
    description: fields.description ?? "",
    type: fields.type ?? "",
    body: raw.replace(FRONTMATTER, "").trim(),
  };
}

function readNotes(dir: string): MemoryNote[] {
  try {
    return readdirSync(dir)
      .filter((file) => file.endsWith(".md") && file !== "MEMORY.md")
      .sort()
      .map((file) => readNote(dir, file));
  } catch {
    return [];
  }
}

export function readMemory(repoPath: string, home?: string): MemoryModel {
  const { ruleFiles, notesDir } = memoryPaths(repoPath, home);
  return {
    ruleFiles: ruleFiles
      .map(({ source, path }) => readRuleFile(source, path))
      .filter((file): file is RuleFile => file !== null),
    notesDir,
    notes: readNotes(notesDir),
  };
}

export function deleteRule(path: string, id: string): boolean {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return false;
  }

  const block = parseBlocks(text).find((candidate) => candidate.id === id);
  if (!block) return false;

  const lines = text.split("\n");
  lines.splice(block.start, block.end - block.start + 1);
  if (block.start > 0 && lines[block.start - 1]?.trim() === "" && lines[block.start]?.trim() === "") {
    lines.splice(block.start, 1);
  }
  writeFileSync(path, lines.join("\n"));
  return true;
}

export function deleteNote(dir: string, name: string): boolean {
  if (!NOTE_NAME.test(name) || name === "MEMORY") return false;

  const path = join(dir, `${name}.md`);
  try {
    unlinkSync(path);
  } catch {
    return false;
  }

  const indexPath = join(dir, "MEMORY.md");
  try {
    const lines = readFileSync(indexPath, "utf8").split("\n");
    const kept = lines.filter((line) => !line.includes(`](${name}.md)`));
    if (kept.length !== lines.length) writeFileSync(indexPath, kept.join("\n"));
  } catch {
    // no index to prune
  }
  return true;
}
