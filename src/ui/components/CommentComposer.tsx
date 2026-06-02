import { useState } from "react";

export function CommentComposer({
  initial = "",
  submitLabel = "Comment",
  onSubmit,
  onCancel,
}: {
  initial?: string;
  submitLabel?: string;
  onSubmit: (body: string) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState(initial);

  const submit = () => {
    const trimmed = body.trim();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <div className="composer">
      <textarea
        autoFocus
        value={body}
        placeholder="Leave a review note for the agent…"
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
          if (e.key === "Escape") onCancel();
        }}
      />
      <div className="composer-actions">
        <button className="btn primary" onClick={submit}>
          {submitLabel}
        </button>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
