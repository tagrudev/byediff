import { useState } from "react";
import type { Comment } from "../api";
import { CommentComposer } from "./CommentComposer";

function CommentCard({
  comment,
  onEdit,
  onDelete,
}: {
  comment: Comment;
  onEdit: (id: string, body: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className={`comment ${comment.status}`}>
        <CommentComposer
          initial={comment.body}
          submitLabel="Save"
          onSubmit={(body) => {
            onEdit(comment.id, body);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className={`comment ${comment.status}`}>
      <div className="comment-meta">
        <span>you</span>
        {comment.status !== "open" && <span className={`tag ${comment.status}`}>{comment.status}</span>}
      </div>
      <div className="comment-body">{comment.body}</div>
      {comment.replies.map((r, i) => (
        <div className="reply" key={i}>
          <div className="reply-label">↳ agent</div>
          <div className="reply-body">{r.body}</div>
        </div>
      ))}
      {comment.status === "open" && (
        <div className="comment-actions">
          <button onClick={() => setEditing(true)}>Edit</button>
          <button onClick={() => onDelete(comment.id)}>Delete</button>
        </div>
      )}
    </div>
  );
}

export function CommentThread({
  comments,
  onEdit,
  onDelete,
}: {
  comments: Comment[];
  onEdit: (id: string, body: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <>
      {comments.map((c) => (
        <CommentCard key={c.id} comment={c} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </>
  );
}
