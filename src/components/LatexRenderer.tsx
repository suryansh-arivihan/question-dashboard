"use client";

import { useMemo } from "react";
import "katex/dist/katex.min.css";

interface LatexRendererProps {
  content: string;
  className?: string;
}

export function LatexRenderer({ content, className = "" }: LatexRendererProps) {
  const processedContent = useMemo(() => {
    if (typeof window === "undefined") return content;

    const katex = require("katex");
    let processed = content;

    // Process inline math: $...$
    processed = processed.replace(/\$([^$]+)\$/g, (match, math) => {
      try {
        return katex.renderToString(math, {
          throwOnError: false,
          displayMode: false,
        });
      } catch (e) {
        return match;
      }
    });

    // Process display math: $$...$$
    processed = processed.replace(/\$\$([^$]+)\$\$/g, (match, math) => {
      try {
        return katex.renderToString(math, {
          throwOnError: false,
          displayMode: true,
        });
      } catch (e) {
        return match;
      }
    });

    // Process LaTeX commands like \dfrac, \left, \right, etc.
    processed = processed.replace(/\\([a-zA-Z]+)/g, (match) => {
      try {
        return katex.renderToString(match, {
          throwOnError: false,
          displayMode: false,
        });
      } catch (e) {
        return match;
      }
    });

    return processed;
  }, [content]);

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: processedContent }}
    />
  );
}
