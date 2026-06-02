# byediff

A local, GitHub-style review tool. Run it inside a repo, review the working-tree diff
in your browser, leave line comments, then run `/byediff` in Claude Code to have the
agent resolve them.

- **Working tree vs HEAD** — staged, unstaged, and untracked files (new files show
  as all-additions).
- **Live** — the server watches the tree and pushes diff updates over SSE as code
  changes. A green pulse breathes while it's connected.
- **Line comments** — comment on any new-side line. Comments live in the running
  session (they're meant to be resolved, not archived).
- **`/byediff` resolve loop** — the agent reads your open comments, applies the
  changes, and replies on each one. It never commits — you re-review and commit.
- Comments that drift after edits are flagged **stale** instead of pointing at the
  wrong line.
- **GitHub look** — matches GitHub's light/dark color scheme and follows your
  system theme, with a toggle in the top bar. Split/unified view is remembered.

## Install

```bash
git clone <repo> ~/Projects/byediff
cd ~/Projects/byediff
npm install
npm run build        # builds the UI bundle + the CLI

# put `byediff` on your PATH via a launcher (manager-agnostic; works with Volta/fnm/nvm/brew)
cat > ~/.local/bin/byediff <<'EOF'
#!/bin/sh
exec node "$HOME/Projects/byediff/dist/cli.js" "$@"
EOF
chmod +x ~/.local/bin/byediff

# install the resolve skill for Claude Code
cp -r skill/byediff ~/.claude/skills/byediff
```

> The launcher avoids `npm link`, which installs into the global bin of whichever
> Node happens to be active and may not be on your shell's `PATH`. Ensure
> `~/.local/bin` is on `PATH`. After a `git pull` + `npm run build`, the launcher
> keeps working — it always points at the freshly built `dist/cli.js`.

## Use

```bash
cd ~/Projects/some-app
byediff                 # opens http://localhost:7777 (auto-increments if taken)
byediff --no-open       # don't open a browser
byediff --port 5050     # pick a port
```

Review the diff, hover a line and click the `+` to leave a comment. Then, in Claude
Code from the same repo:

```
/byediff
```

The agent finds the running server (via `~/.config/byediff/instances.json`), reads
your open comments, makes the changes, and replies on each. The browser updates
live and the comments flip to **resolved**. Your tree is left dirty so you can
re-review before committing.

## Attach to a tmuxinator project

Add one window to any `~/.config/tmuxinator/<project>.yml`:

```yaml
windows:
  - server: bundle exec rails s
  - vite: bundle exec vite dev --clobber
  - byediff: byediff
```

Now `tmuxinator start <project>` boots the reviewer alongside your dev servers.

## How it fits together

```
byediff (CLI)                         /byediff (Claude Code skill)
  ├─ git diff HEAD + untracked          ├─ read ~/.config/byediff/instances.json
  ├─ native fs.watch → SSE              ├─ GET open comments for this repo
  ├─ in-memory comments + stale         ├─ apply each change
  └─ React UI (served on $PORT)         └─ POST resolve + reply (no commit)
```

## Develop

```bash
npm test             # vitest — git parsing, comment store, server API
npm run dev          # run the CLI from source (tsx)
npx vite             # UI dev server with /api proxied to :7777
```
