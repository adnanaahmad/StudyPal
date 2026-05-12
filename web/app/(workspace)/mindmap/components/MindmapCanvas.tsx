"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2 } from "lucide-react";

interface MindmapCanvasProps {
  markdown: string;
  focusedId?: string | null;
}

export function MindmapCanvas({ markdown, focusedId }: MindmapCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  // Store markmap instance so we can call fit/setData
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mmRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  // Create Markmap instance once the SVG is mounted
  useEffect(() => {
    if (!svgRef.current) return;
    let mounted = true;

    (async () => {
      const { Markmap, loadCSS, loadJS } = await import("markmap-view");
      const { builtInPlugins } = await import("markmap-lib");

      // Load built-in assets (katex, prism, etc.) silently
      const assets = builtInPlugins.flatMap((p: any) => [
        ...(p.styles ?? []),
        ...(p.scripts ?? []),
      ]);
      await Promise.all([
        loadCSS(assets.filter((a: any) => "href" in a)),
        loadJS(assets.filter((a: any) => "src" in a), { getMarkmap: () => ({ Markmap }) }),
      ]).catch(() => { /* non-critical */ });

      if (!mounted || !svgRef.current) return;
      mmRef.current = Markmap.create(svgRef.current);
      setReady(true);
    })();

    return () => { mounted = false; };
  }, []);

  // Update the map whenever `markdown` changes
  useEffect(() => {
    if (!ready || !mmRef.current || !markdown) return;

    (async () => {
      const { Transformer } = await import("markmap-lib");
      const transformer = new Transformer();
      const { root } = transformer.transform(markdown);
      mmRef.current.setData(root);
      
      // Wait for the layout/animation to settle before fitting
      setTimeout(() => {
        mmRef.current?.fit();
      }, 200);
    })();
  }, [markdown, ready]);

  // Also fit when focus changes
  useEffect(() => {
    if (!ready || !mmRef.current || !focusedId) return;
    setTimeout(() => {
      mmRef.current?.fit();
    }, 100);
  }, [focusedId, ready]);

  const handleFit = () => {
    mmRef.current?.fit();
  };

  return (
    <div suppressHydrationWarning className="relative flex-1 overflow-hidden bg-[var(--background)]">
      <svg
        ref={svgRef}
        className="h-full w-full"
        style={{ display: markdown ? "block" : "none" }}
      />

      {/* Fit-to-screen button */}
      {markdown && (
        <button
          onClick={handleFit}
          title="Fit to screen"
          className="absolute bottom-4 right-4 rounded-lg border border-[var(--border)] bg-[var(--secondary)] p-2 text-[var(--muted-foreground)] shadow-sm transition-colors hover:text-[var(--foreground)]"
        >
          <Maximize2 size={14} />
        </button>
      )}
    </div>
  );
}
