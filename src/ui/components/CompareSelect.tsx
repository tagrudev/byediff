export function CompareSelect({
  base,
  branches,
  branch,
  onChange,
}: {
  base: string;
  branches: string[];
  branch: string;
  onChange: (base: string) => void;
}) {
  const head = branch || "HEAD";
  return (
    <select
      className="compare-select"
      value={base}
      onChange={(e) => onChange(e.target.value)}
      title="Compare against"
    >
      <option value="">HEAD ↔ working tree</option>
      {branches.map((b) => (
        <option key={b} value={b}>
          {b} ↔ {head}
        </option>
      ))}
    </select>
  );
}
