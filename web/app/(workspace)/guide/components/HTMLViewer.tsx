"use client";

import { useRef, useEffect, useState } from "react";
import { Bug, Loader2 } from "lucide-react";
import { useKaTeXInjection } from "../hooks";
import { useTranslation } from "react-i18next";
import { subscribeToThemeChanges, type Theme } from "@/lib/theme";

interface HTMLViewerProps {
  html: string;
  currentIndex: number;
  loadingMessage: string;
  onOpenDebugModal: () => void;
}

/**
 * Regex that matches common LaTeX patterns NOT already wrapped in $..$ or $$..$$.
 * Used to detect bare LaTeX commands in text nodes.
 */
const BARE_LATEX_RE =
  /(?<![\\$])(?:\\(?:underbrace|mathbb|frac|text|sqrt|subseteq|supseteq|notsubset|mid|pmod|leq|geq|Rightarrow|Leftarrow|Rightarrow|neq|approx|infty|partial|nabla|forall|exists|emptyset|varnothing|in|notin|alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega|vec|hat|bar|dot|tilde|overline|overbrace|boldsymbol|mathrm|mathit|mathbf|mathcal|mathfrak|mathscr|mathsf|mathtt|quad|qquad|ldots|cdots|vdots|ddots|prime|limits|sum|int|prod|oint|bigcup|bigcap|bigvee|bigwedge|bigoplus|bigotimes|binom|choose)[\s{])|\{[^}]*\\(?:underbrace|mathbb|frac|text|sqrt)/;

export default function HTMLViewer({
  html,
  currentIndex,
  loadingMessage,
  onOpenDebugModal,
}: HTMLViewerProps) {
  const { t } = useTranslation();
  const htmlFrameRef = useRef<HTMLIFrameElement>(null);
  const lastWrittenRef = useRef<string>("");
  const lastIndexRef = useRef<number>(currentIndex);
  const { injectKaTeX } = useKaTeXInjection();

  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof document !== "undefined") {
      return document.documentElement.classList.contains("dark") ? "dark" : "light";
    }
    return "light";
  });

  useEffect(() => {
    // Initial sync
    if (typeof document !== "undefined") {
      setThemeState(document.documentElement.classList.contains("dark") ? "dark" : "light");
    }

    // Subscribe to real-time theme changes
    const unsubscribe = subscribeToThemeChanges((newTheme) => {
      setThemeState(newTheme);
    });
    return unsubscribe;
  }, []);

  const sanitizeHtml = (rawHtml: string) =>
    rawHtml
      .replace(/<script(?![^>]*katex)[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, (match) => {
        if (/onload\s*=\s*(['"])renderMathInElement/i.test(match)) return match;
        return "";
      })
      .replace(/\s(href|src)\s*=\s*(['"])javascript:[\s\S]*?\2/gi, "");

  useEffect(() => {
    if (currentIndex !== lastIndexRef.current) {
      lastWrittenRef.current = "";
      lastIndexRef.current = currentIndex;
    }
  }, [currentIndex]);

  useEffect(() => {
    if (!html) return;

    const injected = injectKaTeX(html);
    const htmlWithKaTeX = sanitizeHtml(injected);

    const isDark = theme === "dark";
    let finalHtml = htmlWithKaTeX;

    if (isDark) {
      const darkStyles = `
<style id="iframe-theme-overrides">
  html.dark {
    color-scheme: dark;
    --background-color: #0f172a !important;
    --text-color: #f8fafc !important;
    --border-color: #334155 !important;
  }
  html.dark body {
    background-color: #0f172a !important;
    color: #f8fafc !important;
  }

  /* 1. Universal structural layout catch-all to guarantee slate/dark backgrounds */
  html.dark div,
  html.dark section,
  html.dark article,
  html.dark main,
  html.dark header,
  html.dark footer,
  html.dark table,
  html.dark tr,
  html.dark td,
  html.dark th {
    background-color: #1e293b !important;
    background: #1e293b !important;
    color: #cbd5e1 !important;
    border-color: #334155 !important;
  }

  /* 2. Universal text readability catch-all */
  html.dark p,
  html.dark li,
  html.dark span:not(.katex *),
  html.dark label,
  html.dark strong,
  html.dark em,
  html.dark i,
  html.dark b,
  html.dark u {
    color: #cbd5e1 !important;
  }

  /* 3. High contrast bright headers */
  html.dark h1,
  html.dark h2,
  html.dark h3,
  html.dark h4,
  html.dark h5,
  html.dark h6 {
    color: #f1f5f9 !important;
    border-color: #334155 !important;
  }

  /* 4. Link colors */
  html.dark a {
    color: #38bdf8 !important;
  }

  /* 5. Custom themed accents using semi-transparent overlay cards */
  /* Green themed boxes (Definitions, success) */
  html.dark .definition-box,
  html.dark div[style*="background-color: #e8f5e9"],
  html.dark div[style*="background-color: #e2f0d9"],
  html.dark div[style*="background: #e8f5e9"],
  html.dark div[style*="background: #e2f0d9"] {
    background-color: rgba(16, 185, 129, 0.1) !important;
    background: rgba(16, 185, 129, 0.1) !important;
    border-color: #10b981 !important;
  }
  html.dark .definition-box *,
  html.dark div[style*="background-color: #e8f5e9"] *,
  html.dark div[style*="background-color: #e2f0d9"] * {
    color: #a7f3d0 !important;
  }

  /* Orange/Yellow themed boxes (Formulas, warnings) */
  html.dark .formula-box,
  html.dark div[style*="background-color: #fff3e0"],
  html.dark div[style*="background-color: #fffde7"],
  html.dark div[style*="background-color: #fff9c4"],
  html.dark div[style*="background-color: #fff3cd"],
  html.dark div[style*="background: #fff3e0"],
  html.dark div[style*="background: #fffde7"] {
    background-color: rgba(245, 158, 11, 0.1) !important;
    background: rgba(245, 158, 11, 0.1) !important;
    border-color: #f59e0b !important;
  }
  html.dark .formula-box *,
  html.dark div[style*="background-color: #fff3e0"] *,
  html.dark div[style*="background-color: #fffde7"] *,
  html.dark div[style*="background-color: #fff9c4"] *,
  html.dark div[style*="background-color: #fff3cd"] * {
    color: #fed7aa !important;
  }

  /* Blue themed boxes (Interactive panels, Info blocks) */
  html.dark .interactive-section,
  html.dark div[style*="background-color: #e3f2fd"],
  html.dark div[style*="background-color: #f0f8ff"],
  html.dark div[style*="background-color: #e0f2fe"],
  html.dark div[style*="background-color: #e9f7ff"],
  html.dark div[style*="background-color: #f1f8ff"],
  html.dark div[style*="background: #e3f2fd"],
  html.dark div[style*="background: #f0f8ff"] {
    background-color: rgba(59, 130, 246, 0.1) !important;
    background: rgba(59, 130, 246, 0.1) !important;
    border-color: #3b82f6 !important;
  }
  html.dark .interactive-section *,
  html.dark div[style*="background-color: #e3f2fd"] *,
  html.dark div[style*="background-color: #f0f8ff"] *,
  html.dark div[style*="background-color: #e0f2fe"] *,
  html.dark div[style*="background-color: #e9f7ff"] * {
    color: #bfdbfe !important;
  }

  /* Grey sequences list displays and item tags */
  html.dark .term-item,
  html.dark div[style*="background-color: #e0f7fa"],
  html.dark div[style*="background-color: #fafafa"],
  html.dark div[style*="background-color: #f9f9f9"],
  html.dark span[style*="background: #f9f9f9"],
  html.dark p[style*="background: #f9f9f9"] {
    background-color: #334155 !important;
    background: #334155 !important;
    color: #f1f5f9 !important;
  }
  html.dark .term-item *,
  html.dark .term-item span {
    color: #38bdf8 !important;
  }

  /* Inputs, buttons, selections */
  html.dark input,
  html.dark select,
  html.dark textarea {
    background-color: #0f172a !important;
    color: #f8fafc !important;
    border: 1px solid #475569 !important;
  }
  html.dark button {
    background-color: #2563eb !important;
    color: #ffffff !important;
  }
  html.dark button:hover {
    background-color: #1d4ed8 !important;
  }

  /* KaTeX mathematical syntax colors */
  html.dark .katex-display,
  html.dark .katex,
  html.dark .katex * {
    color: #f8fafc !important;
  }
</style>
`;
      if (finalHtml.includes("</head>")) {
        finalHtml = finalHtml.replace("</head>", `${darkStyles}</head>`);
      } else {
        finalHtml = `${darkStyles}${finalHtml}`;
      }

      // Inject class="dark" into <html>
      if (finalHtml.includes("<html")) {
        finalHtml = finalHtml.replace(/<html([^>]*)>/i, (match, group) => {
          if (group.includes("class=")) {
            return match.replace(/class=(['"])(.*?)\1/i, 'class="$2 dark"');
          } else {
            return `<html class="dark"${group}>`;
          }
        });
      } else {
        finalHtml = `<html class="dark">${finalHtml}</html>`;
      }
    }

    if (lastWrittenRef.current === finalHtml) {
      return;
    }

    const timer = setTimeout(() => {
      if (htmlFrameRef.current) {
        const iframe = htmlFrameRef.current;
        // Set srcdoc
        iframe.srcdoc = finalHtml;
        lastWrittenRef.current = finalHtml;

        /**
         * Fallback rendering strategy:
         * 1. Wait for CDN scripts to load
         * 2. Find text nodes with bare LaTeX (no $ wrapping)
         * 3. Wrap them in $...$ delimiters
         * 4. Call renderMathInElement to render everything
         */
        const fallbackDelays = [1500, 3000];
        const fallbackTimers = fallbackDelays.map((delay) =>
          setTimeout(() => {
            try {
              const doc = iframe.contentDocument;
              if (!doc || !doc.body) return;
              const win = doc.defaultView as Window & {
                renderMathInElement?: (el: HTMLElement, opts: Record<string, unknown>) => void;
              };
              if (typeof win?.renderMathInElement !== "function") return;

              let wrappedCount = 0;

              // Step 1: Find text nodes with bare LaTeX and fix them
              const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
              const nodesToProcess: Text[] = [];
              let node: Text | null;
              while ((node = walker.nextNode() as Text | null)) {
                // Skip if inside a .katex element (already rendered)
                const parent = node.parentElement;
                if (parent && parent.closest(".katex")) continue;

                const text = node.textContent || "";
                // Check for bare LaTeX patterns not already delimited
                if (BARE_LATEX_RE.test(text) && !/^\$.*\$$/.test(text.trim())) {
                  nodesToProcess.push(node);
                }
              }

              // Process each bare LaTeX text node
              for (const textNode of nodesToProcess) {
                const originalText = textNode.textContent || "";
                const trimmed = originalText.trim();
                // Skip already-delimited content
                if (
                  trimmed.startsWith("$") ||
                  trimmed.endsWith("$") ||
                  trimmed.startsWith("\\(") ||
                  trimmed.startsWith("\\[")
                )
                  continue;

                // Wrap the entire text node content in $...$
                // KaTeX handles non-math parts gracefully (renders them as \text{})
                const span = doc.createElement("span");
                span.textContent = `$${originalText}$`;
                textNode.parentNode?.replaceChild(span, textNode);
                wrappedCount++;
              }

              // Step 2: Render all math (including newly wrapped)
              win.renderMathInElement(doc.body, {
                delimiters: [
                  { left: "$$", right: "$$", display: true },
                  { left: "$", right: "$", display: false },
                  { left: "\\(", right: "\\)", display: false },
                  { left: "\\[", right: "\\]", display: true },
                ],
                throwOnError: false,
              });

              if (wrappedCount > 0) {
                console.log(`[KaTeX] Auto-wrapped ${wrappedCount} bare LaTeX nodes`);
              }
            } catch (_e) {
              // Silently ignore fallback errors
            }
          }, delay),
        );

        // Store cleanup refs
        (iframe as unknown as Record<string, unknown>).__fallbackTimers = fallbackTimers;
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      // Clear any pending fallback timers from previous render
      const prev = htmlFrameRef.current as unknown as Record<string, unknown> | null;
      if (prev?.__fallbackTimers) {
        (prev.__fallbackTimers as ReturnType<typeof setTimeout>[]).forEach(clearTimeout);
      }
    };
  }, [html, currentIndex, injectKaTeX, theme]);

  if (!html) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-white dark:bg-slate-800 rounded-b-2xl border border-t-0 border-slate-200 dark:border-slate-700">
        <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
        <p className="text-slate-500 dark:text-slate-400">
          {loadingMessage || t("Loading learning content...")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-white dark:bg-slate-800 rounded-b-2xl shadow-sm border border-t-0 border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden relative">
      <button
        onClick={onOpenDebugModal}
        className="absolute top-4 right-4 z-10 p-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors shadow-sm"
        title={t("Fix HTML")}
      >
        <Bug className="w-4 h-4 text-slate-600 dark:text-slate-300" />
      </button>

      <iframe
        ref={htmlFrameRef}
        className="w-full flex-1 border-0"
        title={t("Interactive Learning Content")}
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}
