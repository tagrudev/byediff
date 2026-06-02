import { watch, type FSWatcher } from "node:fs";

const IGNORED =
  /(^|[/\\])(\.git|node_modules|dist|tmp|log|storage|coverage|vendor|\.byediff-test-tmp|public[/\\](assets|packs)|app[/\\]assets[/\\]builds)([/\\]|$)/;

export function watchRepo(repoPath: string, onChange: () => void, debounceMs = 250): () => void {
  let timer: NodeJS.Timeout | null = null;
  let watcher: FSWatcher | null = null;

  const trigger = (_event: string, filename: string | Buffer | null) => {
    if (filename && IGNORED.test(filename.toString())) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(onChange, debounceMs);
  };

  try {
    watcher = watch(repoPath, { recursive: true, persistent: true }, trigger);
    watcher.on("error", (err) => {
      console.error(`byediff: file watcher stopped, live refresh disabled (${err.message})`);
      watcher?.close();
      watcher = null;
    });
  } catch (err) {
    console.error(`byediff: could not start file watcher, live refresh disabled (${(err as Error).message})`);
  }

  return () => {
    if (timer) clearTimeout(timer);
    watcher?.close();
  };
}
