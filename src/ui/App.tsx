import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type Comment, type DiffModel, type Meta } from "./api";
import { useSSE } from "./useSSE";
import { useHighlighter } from "./useHighlighter";
import { useColorScheme } from "./useColorScheme";
import { FileRail } from "./components/FileRail";
import { DiffView } from "./components/DiffView";
import { LivePulse } from "./components/LivePulse";
import { ViewToggle, type ViewMode } from "./components/ViewToggle";
import { ThemeToggle } from "./components/ThemeToggle";
import { CompareSelect } from "./components/CompareSelect";
import { MemoryPanel } from "./components/MemoryPanel";
import { useHashRoute } from "./useHashRoute";

const VIEW_KEY = "byediff.view";
const BASE_KEY = "byediff.base";

const RepoIcon = () => (
  <svg className="repo-icon" viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
    <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z" />
  </svg>
);

const BranchIcon = () => (
  <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
    <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
  </svg>
);

const MemoryIcon = () => (
  <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
    <path d="M0 1.75A.75.75 0 0 1 .75 1h4.253c1.227 0 2.317.59 3 1.501A3.743 3.743 0 0 1 11.006 1h4.245a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75h-4.507a2.25 2.25 0 0 0-1.591.659l-.622.621a.75.75 0 0 1-1.06 0l-.622-.621A2.25 2.25 0 0 0 5.258 13H.75a.75.75 0 0 1-.75-.75Zm7.251 10.324.004-5.073-.002-.006A2.25 2.25 0 0 0 5.003 4.5H1.5v7h3.757a3.75 3.75 0 0 1 1.994.574ZM8.755 4.75l-.004 7.322a3.752 3.752 0 0 1 1.992-.572H14.5v-7h-3.495a2.25 2.25 0 0 0-2.25 2.25Z" />
  </svg>
);

export function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [diff, setDiff] = useState<DiffModel | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    const stored = localStorage.getItem(VIEW_KEY);
    return stored === "split" || stored === "unified" ? stored : "unified";
  });
  const setViewMode = useCallback((m: ViewMode) => {
    setViewModeState(m);
    localStorage.setItem(VIEW_KEY, m);
  }, []);
  const [compareBase, setCompareBaseState] = useState<string>(() => localStorage.getItem(BASE_KEY) ?? "");
  const setCompareBase = useCallback((b: string) => {
    setCompareBaseState(b);
    localStorage.setItem(BASE_KEY, b);
  }, []);
  const [activePath, setActivePath] = useState<string | null>(null);
  const onMemory = useHashRoute() === "#/memory";
  const { mode, toggle } = useColorScheme();
  const sections = useRef<Record<string, HTMLDivElement | null>>({});
  const { highlight } = useHighlighter(mode);

  const refetchDiff = useCallback(() => {
    api.diff(compareBase || undefined).then(setDiff).catch(() => {});
  }, [compareBase]);
  const refetchComments = useCallback(() => {
    api.comments().then(setComments).catch(() => {});
  }, []);

  useEffect(() => {
    api.meta().then(setMeta).catch(() => {});
    refetchDiff();
    refetchComments();
  }, [refetchDiff, refetchComments]);

  const handlers = useMemo(
    () => ({
      onDiffUpdated: () => {
        refetchDiff();
        refetchComments();
      },
      onCommentsChanged: refetchComments,
    }),
    [refetchDiff, refetchComments],
  );
  const live = useSSE(handlers);

  const files = diff?.files ?? [];

  const select = useCallback((path: string) => {
    setActivePath(path);
    sections.current[path]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (onMemory) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.key !== "j" && e.key !== "k") return;
      const idx = files.findIndex((f) => f.path === activePath);
      const next = e.key === "j" ? Math.min(files.length - 1, idx + 1) : Math.max(0, idx - 1);
      const target = files[next] ?? files[0];
      if (target) select(target.path);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [files, activePath, select, onMemory]);

  const commentsByFile = useMemo(() => {
    const map = new Map<string, Comment[]>();
    for (const c of comments) {
      const list = map.get(c.file) ?? [];
      list.push(c);
      map.set(c.file, list);
    }
    return map;
  }, [comments]);

  const openCountByFile = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of comments) if (c.status !== "resolved") counts[c.file] = (counts[c.file] ?? 0) + 1;
    return counts;
  }, [comments]);

  const openCount = comments.filter((c) => c.status === "open").length;

  const addComment = (file: string) => (line: number, anchorContent: string, body: string) => {
    api.addComment({ file, line, body, anchorContent }).then(refetchComments).catch(() => {});
  };
  const editComment = (id: string, body: string) => {
    api.updateComment(id, body).then(refetchComments).catch(() => {});
  };
  const deleteComment = (id: string) => {
    api.deleteComment(id).then(refetchComments).catch(() => {});
  };

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">
          <span className="bye">bye</span>diff
        </span>
        <span className="topbar-divider" />
        <span className="repo-meta">
          <RepoIcon />
          <span className="repo-name">{meta?.repoPath.split("/").pop() ?? "…"}</span>
          {meta?.branch && (
            <span className="branch-pill">
              <BranchIcon />
              {meta.branch}
            </span>
          )}
          {!onMemory && (
            <CompareSelect
              base={compareBase}
              branches={meta?.branches ?? []}
              branch={meta?.branch ?? ""}
              onChange={setCompareBase}
            />
          )}
        </span>
        <span className="topbar-spacer" />
        {!onMemory && (
          <>
            <span className="counts">
              <span>
                <b>{files.length}</b> files
              </span>
              <span>
                <b>{openCount}</b> open
              </span>
            </span>
            <ViewToggle mode={viewMode} onChange={setViewMode} />
          </>
        )}
        <a className="nav-link" href={onMemory ? "#/" : "#/memory"}>
          <MemoryIcon />
          {onMemory ? "back to diff" : "memory"}
        </a>
        <ThemeToggle mode={mode} onToggle={toggle} />
        <LivePulse live={live} />
      </header>

      {onMemory ? (
        <MemoryPanel />
      ) : (
        <div className="body">
          <FileRail files={files} activePath={activePath} openCountByFile={openCountByFile} onSelect={select} />
          <main className="stage">
            {files.length === 0 ? (
              <div className="empty">
                {compareBase
                  ? `No changes between ${compareBase} and ${meta?.branch ?? "HEAD"}.`
                  : "Working tree is clean — nothing to review."}
              </div>
            ) : (
              files.map((file) => (
                <div
                  key={file.path}
                  ref={(el) => {
                    sections.current[file.path] = el;
                  }}
                >
                  <DiffView
                    file={file}
                    viewMode={viewMode}
                    comments={commentsByFile.get(file.path) ?? []}
                    highlight={highlight}
                    onAdd={addComment(file.path)}
                    onEdit={editComment}
                    onDelete={deleteComment}
                  />
                </div>
              ))
            )}
          </main>
        </div>
      )}
    </div>
  );
}
