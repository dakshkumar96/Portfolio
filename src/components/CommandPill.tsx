"use client";

import { useState } from "react";
import { site } from "@/content/site";

export function CommandPill() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(site.commandCopy);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="command-pill">
      <div className="more-command">
        <span className="command-prompt">%</span>
        {site.command}
      </div>
      <button
        type="button"
        className="copy-btn"
        onClick={copy}
        aria-label={copied ? "Copied" : `Copy ${site.command}`}
      >
        {copied ? (
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M3.5 8.5l3 3 6-7"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
            <rect x="5" y="5" width="8" height="8" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
            <path
              d="M3.5 11V3.8A1.3 1.3 0 0 1 4.8 2.5H11"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        )}
      </button>
    </div>
  );
}
