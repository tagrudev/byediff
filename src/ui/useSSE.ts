import { useEffect, useState } from "react";

export interface SSEHandlers {
  onDiffUpdated?: () => void;
  onCommentsChanged?: () => void;
}

export function useSSE(handlers: SSEHandlers): boolean {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const source = new EventSource("/api/events");
    source.addEventListener("connected", () => setConnected(true));
    source.addEventListener("diffUpdated", () => handlers.onDiffUpdated?.());
    source.addEventListener("commentsChanged", () => handlers.onCommentsChanged?.());
    source.onerror = () => setConnected(false);
    return () => source.close();
    // handlers are stable refs from the caller via useCallback
  }, [handlers]);

  return connected;
}
