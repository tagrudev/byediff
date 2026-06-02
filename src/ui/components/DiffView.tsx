import { Fragment, useState } from "react";
import type { FileDiff, Comment, DiffLine } from "../api";
import { langForPath } from "../useHighlighter";
import { CommentThread } from "./CommentThread";
import { CommentComposer } from "./CommentComposer";
import type { ViewMode } from "./ViewToggle";

type Highlight = (content: string, lang: string | null) => string | null;

interface Props {
  file: FileDiff;
  viewMode: ViewMode;
  comments: Comment[];
  highlight: Highlight;
  onAdd: (line: number, anchorContent: string, body: string) => void;
  onEdit: (id: string, body: string) => void;
  onDelete: (id: string) => void;
}

interface SplitSide {
  no: number | null;
  content: string;
  kind: "context" | "add" | "del" | "empty";
}

function buildSplitRows(lines: DiffLine[]): { left: SplitSide; right: SplitSide }[] {
  const rows: { left: SplitSide; right: SplitSide }[] = [];
  let dels: DiffLine[] = [];
  let adds: DiffLine[] = [];
  const empty: SplitSide = { no: null, content: "", kind: "empty" };
  const flush = () => {
    const n = Math.max(dels.length, adds.length);
    for (let i = 0; i < n; i++) {
      const d = dels[i];
      const a = adds[i];
      rows.push({
        left: d ? { no: d.oldNo, content: d.content, kind: "del" } : empty,
        right: a ? { no: a.newNo, content: a.content, kind: "add" } : empty,
      });
    }
    dels = [];
    adds = [];
  };
  for (const ln of lines) {
    if (ln.type === "del") dels.push(ln);
    else if (ln.type === "add") adds.push(ln);
    else {
      flush();
      rows.push({
        left: { no: ln.oldNo, content: ln.content, kind: "context" },
        right: { no: ln.newNo, content: ln.content, kind: "context" },
      });
    }
  }
  flush();
  return rows;
}

export function DiffView({ file, viewMode, comments, highlight, onAdd, onEdit, onDelete }: Props) {
  const [addingLine, setAddingLine] = useState<{ line: number; content: string } | null>(null);
  const lang = langForPath(file.path);

  const byLine = new Map<number, Comment[]>();
  for (const c of comments) {
    const list = byLine.get(c.line) ?? [];
    list.push(c);
    byLine.set(c.line, list);
  }

  const Code = ({ content, mark, anchor }: { content: string; mark?: string; anchor?: number }) => {
    const html = highlight(content, lang);
    return (
      <>
        {anchor != null && (
          <button className="add-btn" title="comment" onClick={() => setAddingLine({ line: anchor, content })}>
            +
          </button>
        )}
        {mark ? <span className="mark">{mark}</span> : null}
        {html != null ? <span className="shiki" dangerouslySetInnerHTML={{ __html: html }} /> : content}
      </>
    );
  };

  const colSpan = viewMode === "split" ? 4 : 3;

  const threadRow = (line: number, key: string) => {
    const list = byLine.get(line) ?? [];
    const adding = addingLine?.line === line;
    if (list.length === 0 && !adding) return null;
    return (
      <tr key={key}>
        <td className="thread-cell" colSpan={colSpan}>
          <CommentThread comments={list} onEdit={onEdit} onDelete={onDelete} />
          {adding && (
            <CommentComposer
              onSubmit={(body) => {
                onAdd(line, addingLine!.content, body);
                setAddingLine(null);
              }}
              onCancel={() => setAddingLine(null)}
            />
          )}
        </td>
      </tr>
    );
  };

  const statusClass = file.status;
  const dir = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/") + 1) : "";
  const base = file.path.slice(dir.length);

  return (
    <section className="file">
      <header className="file-head">
        <span className="file-path">
          <span className="dir">{dir}</span>
          {base}
        </span>
        <span className={`status-pill ${statusClass}`}>{file.status}</span>
        <span className="file-counts">
          <span className="plus">+{file.additions}</span>
          <span className="minus">−{file.deletions}</span>
        </span>
      </header>

      {file.binary ? (
        <div className="empty">binary file — not shown</div>
      ) : (
        <table className="diff">
          <tbody>
            {file.hunks.map((hunk, hi) => (
              <Fragment key={hi}>
                <tr className="hunk-row">
                  <td colSpan={colSpan}>{hunk.header}</td>
                </tr>
                {viewMode === "unified"
                  ? hunk.lines.map((ln, li) => {
                      const mark = ln.type === "add" ? "+" : ln.type === "del" ? "−" : "";
                      const anchor = ln.type !== "del" && ln.newNo != null ? ln.newNo : undefined;
                      const cls = ln.type === "context" ? "" : ln.type;
                      return (
                        <Fragment key={li}>
                          <tr className={`diffline ${ln.type}`}>
                            <td className={`ln ${cls}`}>{ln.oldNo ?? ""}</td>
                            <td className={`ln ${cls}`}>{ln.newNo ?? ""}</td>
                            <td className={`code ${cls}`}>
                              <Code content={ln.content} mark={mark} anchor={anchor} />
                            </td>
                          </tr>
                          {anchor != null && threadRow(anchor, `t-${li}`)}
                        </Fragment>
                      );
                    })
                  : buildSplitRows(hunk.lines).map((row, ri) => {
                      const anchor = row.right.kind === "add" || row.right.kind === "context" ? row.right.no : null;
                      return (
                        <Fragment key={ri}>
                          <tr className="diffline">
                            <td className={`ln ${row.left.kind}`}>{row.left.no ?? ""}</td>
                            <td className={`code ${row.left.kind}`}>
                              {row.left.kind !== "empty" && (
                                <Code content={row.left.content} mark={row.left.kind === "del" ? "−" : ""} />
                              )}
                            </td>
                            <td className={`ln ${row.right.kind}`}>{row.right.no ?? ""}</td>
                            <td className={`code ${row.right.kind}`}>
                              {row.right.kind !== "empty" && (
                                <Code
                                  content={row.right.content}
                                  mark={row.right.kind === "add" ? "+" : ""}
                                  anchor={anchor ?? undefined}
                                />
                              )}
                            </td>
                          </tr>
                          {anchor != null && threadRow(anchor, `t-${ri}`)}
                        </Fragment>
                      );
                    })}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
