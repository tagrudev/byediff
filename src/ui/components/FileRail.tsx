import type { FileDiff } from "../api";

function StatBars({ add, del }: { add: number; del: number }) {
  const total = add + del;
  const addBars = total === 0 ? 0 : Math.max(add > 0 ? 1 : 0, Math.round((add / total) * 5));
  const delBars = total === 0 ? 0 : 5 - addBars;
  return (
    <span className="statbars">
      {Array.from({ length: 5 }).map((_, i) => (
        <i key={i} className={total === 0 ? "none" : i < addBars ? "add" : i < addBars + delBars ? "del" : "none"} />
      ))}
    </span>
  );
}

export function FileRail({
  files,
  activePath,
  openCountByFile,
  onSelect,
}: {
  files: FileDiff[];
  activePath: string | null;
  openCountByFile: Record<string, number>;
  onSelect: (path: string) => void;
}) {
  return (
    <nav className="rail">
      <div className="rail-title">{files.length} changed</div>
      {files.map((f) => {
        const slash = f.path.lastIndexOf("/");
        const dir = slash >= 0 ? f.path.slice(0, slash) : "";
        const name = slash >= 0 ? f.path.slice(slash + 1) : f.path;
        return (
          <button
            key={f.path}
            className={`rail-item ${activePath === f.path ? "active" : ""}`}
            onClick={() => onSelect(f.path)}
          >
            <StatBars add={f.additions} del={f.deletions} />
            <span className="rail-file">
              <span className="rail-name">{name}</span>
              {dir && <span className="rail-dir">{dir}</span>}
            </span>
            {openCountByFile[f.path] ? <span className="open-dot" title={`${openCountByFile[f.path]} open`} /> : null}
          </button>
        );
      })}
    </nav>
  );
}
