import { useEffect, useRef, useState } from "react";
import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";
import githubLight from "shiki/themes/github-light.mjs";
import githubDark from "shiki/themes/github-dark.mjs";
import typescript from "shiki/langs/typescript.mjs";
import tsx from "shiki/langs/tsx.mjs";
import javascript from "shiki/langs/javascript.mjs";
import jsx from "shiki/langs/jsx.mjs";
import json from "shiki/langs/json.mjs";
import css from "shiki/langs/css.mjs";
import html from "shiki/langs/html.mjs";
import ruby from "shiki/langs/ruby.mjs";
import erb from "shiki/langs/erb.mjs";
import python from "shiki/langs/python.mjs";
import go from "shiki/langs/go.mjs";
import yaml from "shiki/langs/yaml.mjs";
import markdown from "shiki/langs/markdown.mjs";
import sql from "shiki/langs/sql.mjs";
import shellscript from "shiki/langs/shellscript.mjs";
import type { ColorMode } from "./useColorScheme";

const EXT_TO_LANG: Record<string, string> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  json: "json",
  css: "css",
  scss: "css",
  html: "html",
  erb: "erb",
  rb: "ruby",
  rake: "ruby",
  py: "python",
  go: "go",
  yml: "yaml",
  yaml: "yaml",
  md: "markdown",
  sql: "sql",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
};

export function langForPath(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_LANG[ext] ?? null;
}

export interface HighlightFn {
  ready: boolean;
  highlight: (content: string, lang: string | null) => string | null;
}

export function useHighlighter(mode: ColorMode): HighlightFn {
  const [ready, setReady] = useState(false);
  const hlRef = useRef<HighlighterCore | null>(null);
  const cache = useRef(new Map<string, string>());
  const theme = mode === "dark" ? "github-dark" : "github-light";

  useEffect(() => {
    let cancelled = false;
    createHighlighterCore({
      themes: [githubLight, githubDark],
      langs: [
        typescript,
        tsx,
        javascript,
        jsx,
        json,
        css,
        html,
        ruby,
        erb,
        python,
        go,
        yaml,
        markdown,
        sql,
        shellscript,
      ],
      engine: createOnigurumaEngine(import("shiki/wasm")),
    }).then((hl) => {
      if (cancelled) return;
      hlRef.current = hl;
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const highlight = (content: string, lang: string | null): string | null => {
    const hl = hlRef.current;
    if (!hl || !lang) return null;
    const key = `${theme} ${lang} ${content}`;
    const cached = cache.current.get(key);
    if (cached !== undefined) return cached;
    try {
      const html = hl.codeToHtml(content, { lang, theme });
      const inner = html.replace(/^.*<span class="line">/s, "").replace(/<\/span><\/code><\/pre>\s*$/s, "");
      cache.current.set(key, inner);
      return inner;
    } catch {
      return null;
    }
  };

  return { ready, highlight };
}
