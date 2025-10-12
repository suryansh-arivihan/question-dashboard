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

    // Process display math: $$...$$ (must be done before inline math)
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

    // Process LaTeX expressions with commands (wrapped in \[ \] format)
    processed = processed.replace(/\\\[(.+?)\\\]/gs, (match, math) => {
      try {
        return katex.renderToString(math, {
          throwOnError: false,
          displayMode: true,
        });
      } catch (e) {
        return match;
      }
    });

    // Process inline LaTeX expressions (wrapped in \( \) format)
    processed = processed.replace(/\\\((.+?)\\\)/gs, (match, math) => {
      try {
        return katex.renderToString(math, {
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
