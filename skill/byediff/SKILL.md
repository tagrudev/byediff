---
name: byediff
description: Resolve byediff review comments. Reads the open line-comments from the running byediff server for the current repo and applies the code changes each one asks for, replying on every comment as it goes. Use when the user types /byediff or asks to resolve their byediff review notes.
---

# Resolve byediff review comments

byediff runs a local review server for the current repo. The user has left line
comments on the working-tree diff. Your job: read each **open** comment, make the
change it requests, and mark it resolved with a short reply. **Do not commit** —
leave the working tree dirty so the user re-reviews the updated diff.

## 1. Find the running server

Read the registry and match the current repo:

```bash
cat ~/.config/byediff/instances.json
```

It is a JSON array of `{ "repoPath", "port", "pid" }`. Pick the entry whose
`repoPath` equals the current working directory (`pwd`). If exactly one instance
is listed, use it. If several are listed and none matches `pwd`, **stop and ask
the user which port to use** — do not guess.

If the file is missing, empty, or the matched port does not respond, tell the
user to start the tool first with `byediff` in this repo, then stop.

Use the port as `$PORT` below.

## 2. Read the open comments

```bash
curl -s "http://localhost:$PORT/api/comments?status=open"
```

This returns an array of comments:

```json
[
  {
    "id": "…",
    "file": "src/foo.ts",
    "line": 42,
    "anchorContent": "const timeout = 1000;",
    "body": "make this configurable",
    "status": "open"
  }
]
```

- `body` is the user's instruction — interpret it and apply the change.
- `anchorContent` is the exact line text when the comment was made. Use it to
  locate the line precisely (line numbers may have drifted). If you cannot find
  `anchorContent` in `file`, the comment is ambiguous — skip it and report it
  rather than editing the wrong place.

If there are no open comments, say so and stop.

Comments with status `stale` are intentionally excluded — the code under them
drifted. Mention any stale comments to the user but do not act on them.

## 3. Apply each change, then resolve it

For every open comment:

1. Open `file`, find the line matching `anchorContent`, and make the edit the
   `body` asks for. Keep changes minimal and focused on what the comment says.
2. Mark the comment resolved with a one-line reply describing what you did:

```bash
curl -s -X POST "http://localhost:$PORT/api/comments/$ID/resolve" \
  -H 'content-type: application/json' \
  -d '{"reply":"Made the timeout a constructor option (default 1000ms)."}'
```

The reply shows up under the comment in the browser as an `↳ agent` note, and the
comment flips to **resolved**. The server watches the working tree, so the diff
in the browser updates on its own as you edit.

## 4. Wrap up

- **Never commit** — the user re-reviews the new diff and commits themselves.
- Summarize what you changed per comment, and call out anything you skipped
  (ambiguous anchors, stale comments, or notes that need a decision from the user).
