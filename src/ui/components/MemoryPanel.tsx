import { useCallback, useEffect, useState } from "react";
import { api, type MemoryModel, type RuleSource } from "../api";

const SOURCE_LABEL: Record<RuleSource, string> = {
  global: "every project",
  project: "this project",
};

function DeleteAction({
  armed,
  onArm,
  onCancel,
  onConfirm,
}: {
  armed: boolean;
  onArm: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!armed) {
    return (
      <button className="mem-delete" onClick={onArm}>
        delete
      </button>
    );
  }
  return (
    <span className="mem-armed">
      <button className="mem-delete confirm" onClick={onConfirm}>
        yes, delete
      </button>
      <button className="mem-delete cancel" onClick={onCancel}>
        cancel
      </button>
    </span>
  );
}

export function MemoryPanel() {
  const [memory, setMemory] = useState<MemoryModel | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .memory()
      .then(setMemory)
      .catch(() => setError("Couldn't read your Claude memory."));
  }, []);

  useEffect(load, [load]);

  const remove = (work: Promise<void>) => {
    setArmed(null);
    setError(null);
    work.then(load).catch((err: Error) => {
      setError(err.message);
      load();
    });
  };

  if (!memory) {
    return <div className="memory empty">{error ?? "Reading your Claude memory…"}</div>;
  }

  const ruleCount = memory.ruleFiles.flatMap((f) => f.sections).reduce((n, s) => n + s.rules.length, 0);

  return (
    <div className="memory">
      {error && (
        <div className="mem-error" role="alert">
          {error}
          <button className="mem-error-close" onClick={() => setError(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      <div className="memory-inner">
        <header className="mem-intro">
          <h1>Claude memory</h1>
          <p>
            The rules Claude loads into every session, and the facts it has written down about this
            repo. Deleting here edits the files on disk — there's no undo.
          </p>
          <p className="mem-totals">
            <b>{ruleCount}</b> rules · <b>{memory.notes.length}</b> memories
          </p>
        </header>

        {memory.ruleFiles.map((file) => (
          <section className="mem-card" key={file.source}>
            <header className="mem-card-head">
              <span className="mem-badge">{SOURCE_LABEL[file.source]}</span>
              <code className="mem-path">{file.path}</code>
            </header>
            {file.sections.map((section) => (
              <div className="mem-section" key={section.rules[0]!.id}>
                {section.heading && (
                  <h2 className="mem-heading" data-level={section.level}>
                    {section.heading}
                  </h2>
                )}
                {section.rules.map((rule) => (
                  <div className="mem-rule" key={rule.id}>
                    <pre className="mem-rule-text">{rule.text}</pre>
                    <DeleteAction
                      armed={armed === rule.id}
                      onArm={() => setArmed(rule.id)}
                      onCancel={() => setArmed(null)}
                      onConfirm={() => remove(api.deleteRule(file.source, rule.id))}
                    />
                  </div>
                ))}
              </div>
            ))}
          </section>
        ))}

        <section className="mem-card">
          <header className="mem-card-head">
            <span className="mem-badge">written by claude</span>
            <code className="mem-path">{memory.notesDir}</code>
          </header>
          {memory.notes.length === 0 ? (
            <p className="mem-none">Claude hasn't stored anything about this repo yet.</p>
          ) : (
            memory.notes.map((note) => (
              <article className="mem-note" key={note.file}>
                <div className="mem-note-head">
                  <b className="mem-note-name">{note.name}</b>
                  {note.type && <span className="mem-type">{note.type}</span>}
                  <code className="mem-note-file">{note.file}</code>
                  <DeleteAction
                    armed={armed === note.file}
                    onArm={() => setArmed(note.file)}
                    onCancel={() => setArmed(null)}
                    onConfirm={() => remove(api.deleteNote(note.file))}
                  />
                </div>
                {note.description && <p className="mem-desc">{note.description}</p>}
                <pre className="mem-note-body">{note.body}</pre>
              </article>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
