export type ViewMode = "split" | "unified";

export function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div className="toggle">
      <button className={mode === "split" ? "on" : ""} onClick={() => onChange("split")}>
        split
      </button>
      <button className={mode === "unified" ? "on" : ""} onClick={() => onChange("unified")}>
        unified
      </button>
    </div>
  );
}
