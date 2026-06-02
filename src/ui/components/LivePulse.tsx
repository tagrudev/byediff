export function LivePulse({ live }: { live: boolean }) {
  return (
    <span className={`pulse ${live ? "live" : ""}`} title={live ? "watching working tree" : "stream offline"}>
      <span className="pulse-dot" />
      {live ? "live" : "offline"}
    </span>
  );
}
