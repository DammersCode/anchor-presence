"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { siteUrl } from "@/lib/shared";

// LLM compatibility: lets a reader copy page markdown or hand it straight to a chat model.
export function PageActions({ markdownUrl }: { markdownUrl: string }) {
  const [copied, setCopied] = useState(false);
  const absoluteMarkdownUrl = `${siteUrl}${markdownUrl}`;

  const copyMarkdown = async () => {
    try {
      const res = await fetch(markdownUrl);
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // clipboard or fetch can fail (permissions, offline); the button just stays "Copy"
    }
  };

  const chatGptUrl = `https://chat.openai.com/?q=${encodeURIComponent(`Read ${absoluteMarkdownUrl} and help me with it.`)}`;
  const claudeUrl = `https://claude.ai/new?q=${encodeURIComponent(`Read ${absoluteMarkdownUrl} and help me with it.`)}`;

  return (
    <div className="flex flex-row items-center gap-2 border-b border-fd-border pb-6 text-sm">
      <button
        type="button"
        onClick={() => void copyMarkdown()}
        className="inline-flex items-center gap-1.5 rounded-md border border-fd-border px-2.5 py-1.5 text-fd-muted-foreground hover:text-fd-foreground"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? "Copied" : "Copy Markdown"}
      </button>
      <a
        href={chatGptUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-md border border-fd-border px-2.5 py-1.5 text-fd-muted-foreground hover:text-fd-foreground"
      >
        Open in ChatGPT <ExternalLink className="size-3.5" />
      </a>
      <a
        href={claudeUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-md border border-fd-border px-2.5 py-1.5 text-fd-muted-foreground hover:text-fd-foreground"
      >
        Open in Claude <ExternalLink className="size-3.5" />
      </a>
    </div>
  );
}
