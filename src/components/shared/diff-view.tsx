"use client";

import { useMemo } from "react";
import { diffWords } from "diff";

interface DiffViewProps {
  original: string;
  current: string;
  className?: string;
}

export function DiffView({ original, current, className = "" }: DiffViewProps) {
  const parts = useMemo(() => diffWords(original, current), [original, current]);

  return (
    <div className={`text-sm leading-relaxed whitespace-pre-wrap ${className}`}>
      {parts.map((part, i) => {
        if (part.added) {
          return (
            <span
              key={i}
              className="bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 rounded px-0.5"
            >
              {part.value}
            </span>
          );
        }
        if (part.removed) {
          return (
            <span
              key={i}
              className="bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 line-through opacity-60 rounded px-0.5"
            >
              {part.value}
            </span>
          );
        }
        return <span key={i}>{part.value}</span>;
      })}
    </div>
  );
}
