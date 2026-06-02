import { useCallback, useEffect, useState } from "react";

export type ColorMode = "light" | "dark";

const KEY = "byediff.mode";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function systemMode(): ColorMode {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function initialMode(): ColorMode {
  const stored = localStorage.getItem(KEY);
  return stored === "light" || stored === "dark" ? stored : systemMode();
}

export function useColorScheme(): { mode: ColorMode; toggle: () => void } {
  const [mode, setMode] = useState<ColorMode>(initialMode);

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
  }, [mode]);

  // Follow the OS theme until the user makes an explicit choice.
  useEffect(() => {
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem(KEY)) setMode(e.matches ? "dark" : "light");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(() => {
    setMode((m) => {
      const next: ColorMode = m === "light" ? "dark" : "light";
      localStorage.setItem(KEY, next);
      return next;
    });
  }, []);

  return { mode, toggle };
}
