import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deleteNote, deleteRule, parseRules, projectSlug, readMemory } from "./memory.js";

const RULES = `You are a pragmatic engineer.
Rule #1: ask first.

## Foundational rules

- Doing it right beats doing it fast.
- Tedious work is often correct.

## Being Proactive

When asked to do something, just do it. Pause only when:
- Multiple valid approaches exist
- The action would delete code
  - You don't understand the ask

## Test Driven Development

- FOR EVERY BUGFIX follow TDD:
    1. Write a failing test
    2. Run it
`;

const FENCED = [
  "## Examples",
  "",
  "- Use this shape:",
  "",
  "```ts",
  "- not a bullet",
  "const a = 1;",
  "```",
  "",
  "- Another rule",
  "",
].join("\n");

describe("parseRules", () => {
  it("splits each list item under its heading into its own rule", () => {
    const sections = parseRules(RULES);
    const foundational = sections.find((s) => s.heading === "Foundational rules")!;
    expect(foundational.level).toBe(2);
    expect(foundational.rules.map((r) => r.text)).toEqual([
      "- Doing it right beats doing it fast.",
      "- Tedious work is often correct.",
    ]);
  });

  it("keeps content before the first heading as an unheaded section", () => {
    const [preamble] = parseRules(RULES);
    expect(preamble!.heading).toBeNull();
    expect(preamble!.rules.map((r) => r.text)).toEqual([
      "You are a pragmatic engineer.\nRule #1: ask first.",
    ]);
  });

  it("keeps indented children with their parent rule", () => {
    const sections = parseRules(RULES);
    const proactive = sections.find((s) => s.heading === "Being Proactive")!;
    expect(proactive.rules.map((r) => r.text)).toEqual([
      "When asked to do something, just do it. Pause only when:",
      "- Multiple valid approaches exist",
      "- The action would delete code\n  - You don't understand the ask",
    ]);

    const tdd = sections.find((s) => s.heading === "Test Driven Development")!;
    expect(tdd.rules).toHaveLength(1);
    expect(tdd.rules[0]!.text).toBe(
      "- FOR EVERY BUGFIX follow TDD:\n    1. Write a failing test\n    2. Run it",
    );
  });

  it("keeps a fenced code block whole instead of splitting on its contents", () => {
    const [examples] = parseRules(FENCED);
    expect(examples!.rules.map((r) => r.text)).toEqual([
      "- Use this shape:",
      "```ts\n- not a bullet\nconst a = 1;\n```",
      "- Another rule",
    ]);
  });

  it("gives every rule in a file a distinct id", () => {
    const ids = parseRules(RULES).flatMap((s) => s.rules.map((r) => r.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("memory on the real filesystem", () => {
  let home: string;
  let repo: string;
  let globalRules: string;
  let notesDir: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "byediff-home-"));
    repo = mkdtempSync(join(tmpdir(), "byediff-repo-"));
    globalRules = join(home, ".claude", "CLAUDE.md");
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(globalRules, RULES);

    notesDir = join(home, ".claude", "projects", projectSlug(repo), "memory");
    mkdirSync(notesDir, { recursive: true });
    writeFileSync(
      join(notesDir, "deploy-target.md"),
      `---
name: deploy-target
description: Staging deploys go through fly.io, not Heroku
metadata:
  type: project
---

Staging runs on fly.io. See [[release-checklist]].
`,
    );
    writeFileSync(
      join(notesDir, "release_checklist.md"),
      `---
name: Release checklist
description: Tag, then deploy, then smoke-test
metadata:
  type: project
---

Tag the release first.
`,
    );
    writeFileSync(
      join(notesDir, "MEMORY.md"),
      `- [Deploy target](deploy-target.md) — fly.io, not Heroku
- [Release checklist](release_checklist.md) — the steps
`,
    );
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  });

  it("reads the global rule file and the project's notes", () => {
    const memory = readMemory(repo, home);
    expect(memory.ruleFiles.map((f) => f.source)).toEqual(["global"]);
    expect(memory.ruleFiles[0]!.path).toBe(globalRules);
    expect(memory.notesDir).toBe(notesDir);
    expect(memory.notes).toHaveLength(2);
    expect(memory.notes[0]).toMatchObject({
      file: "deploy-target.md",
      name: "deploy-target",
      description: "Staging deploys go through fly.io, not Heroku",
      type: "project",
    });
    expect(memory.notes[0]!.body).toContain("Staging runs on fly.io.");
    expect(memory.notes[0]!.body).not.toContain("---");
  });

  it("reports the file a note lives in, not just the name it calls itself", () => {
    const note = readMemory(repo, home).notes.find((n) => n.name === "Release checklist")!;
    expect(note.file).toBe("release_checklist.md");
    expect(note.path).toBe(join(notesDir, "release_checklist.md"));
  });

  it("deletes a note whose name differs from its filename", () => {
    const note = readMemory(repo, home).notes.find((n) => n.name === "Release checklist")!;
    expect(deleteNote(notesDir, note.file)).toBe(true);
    expect(existsSync(join(notesDir, "release_checklist.md"))).toBe(false);
    expect(readFileSync(join(notesDir, "MEMORY.md"), "utf8")).toBe(
      "- [Deploy target](deploy-target.md) — fly.io, not Heroku\n",
    );
  });

  it("picks up a repo-local CLAUDE.md as the project rule file", () => {
    writeFileSync(join(repo, "CLAUDE.md"), "## Project\n\n- Use pnpm.\n");
    const memory = readMemory(repo, home);
    expect(memory.ruleFiles.map((f) => f.source)).toEqual(["global", "project"]);
    expect(memory.ruleFiles[1]!.sections[0]!.rules[0]!.text).toBe("- Use pnpm.");
  });

  it("falls back to .claude/CLAUDE.md for the project rule file", () => {
    mkdirSync(join(repo, ".claude"), { recursive: true });
    writeFileSync(join(repo, ".claude", "CLAUDE.md"), "- Use bun.\n");
    const memory = readMemory(repo, home);
    expect(memory.ruleFiles[1]!.path).toBe(join(repo, ".claude", "CLAUDE.md"));
  });

  it("reports no notes when the project has never stored any", () => {
    const other = mkdtempSync(join(tmpdir(), "byediff-bare-"));
    const memory = readMemory(other, home);
    expect(memory.notes).toEqual([]);
    rmSync(other, { recursive: true, force: true });
  });

  it("deletes one rule and leaves every other byte of the file alone", () => {
    const target = parseRules(RULES)
      .flatMap((s) => s.rules)
      .find((r) => r.text === "- Tedious work is often correct.")!;

    expect(deleteRule(globalRules, target.id)).toBe(true);
    expect(readFileSync(globalRules, "utf8")).toBe(
      RULES.replace("- Tedious work is often correct.\n", ""),
    );
  });

  it("deletes a parent rule together with its indented children", () => {
    const target = parseRules(RULES)
      .flatMap((s) => s.rules)
      .find((r) => r.text.startsWith("- The action would delete code"))!;

    deleteRule(globalRules, target.id);
    const after = readFileSync(globalRules, "utf8");
    expect(after).not.toContain("The action would delete code");
    expect(after).not.toContain("You don't understand the ask");
    expect(after).toContain("- Multiple valid approaches exist");
  });

  it("collapses the blank line a removed paragraph would leave doubled", () => {
    const target = parseRules(RULES)
      .flatMap((s) => s.rules)
      .find((r) => r.text.startsWith("When asked to do something"))!;

    deleteRule(globalRules, target.id);
    expect(readFileSync(globalRules, "utf8")).toContain(
      "## Being Proactive\n\n- Multiple valid approaches exist",
    );
  });

  it("refuses an unknown id and leaves the file untouched", () => {
    expect(deleteRule(globalRules, "nope")).toBe(false);
    expect(readFileSync(globalRules, "utf8")).toBe(RULES);
  });

  it("refuses a stale id after the file changed underneath it", () => {
    const target = parseRules(RULES)
      .flatMap((s) => s.rules)
      .find((r) => r.text === "- Tedious work is often correct.")!;

    writeFileSync(globalRules, `## Added by hand\n\n- A brand new rule.\n\n${RULES}`);
    expect(deleteRule(globalRules, target.id)).toBe(false);
    expect(readFileSync(globalRules, "utf8")).toContain("- Tedious work is often correct.");
  });

  it("deletes a note and prunes its pointer from MEMORY.md", () => {
    expect(deleteNote(notesDir, "deploy-target.md")).toBe(true);
    expect(existsSync(join(notesDir, "deploy-target.md"))).toBe(false);
    expect(readFileSync(join(notesDir, "MEMORY.md"), "utf8")).toBe(
      "- [Release checklist](release_checklist.md) — the steps\n",
    );
  });

  it("refuses to delete the MEMORY.md index or escape the memory directory", () => {
    expect(deleteNote(notesDir, "MEMORY.md")).toBe(false);
    expect(deleteNote(notesDir, "../../CLAUDE.md")).toBe(false);
    expect(deleteNote(notesDir, "../../../.claude/CLAUDE.md")).toBe(false);
    expect(existsSync(join(notesDir, "MEMORY.md"))).toBe(true);
    expect(existsSync(globalRules)).toBe(true);
  });

  it("refuses a note that does not exist", () => {
    expect(deleteNote(notesDir, "never-written.md")).toBe(false);
  });
});

describe("projectSlug", () => {
  it("matches the slug Claude Code uses for a project directory", () => {
    expect(projectSlug("/Users/tagrudev/Projects/byediff")).toBe("-Users-tagrudev-Projects-byediff");
    expect(projectSlug("/Users/tagrudev/.claude")).toBe("-Users-tagrudev--claude");
  });
});
