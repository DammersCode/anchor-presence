"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

const PACKAGES = "@anchor-presence/core @anchor-presence/dom @anchor-presence/react";

const TABS: Record<string, string> = {
  bun: `bun add ${PACKAGES}`,
  npm: `npm install ${PACKAGES}`,
  pnpm: `pnpm add ${PACKAGES}`,
};

/** Package-manager-aware install snippet with a one-click copy, matching the landing page style. */
export function InstallCommand({ packages = PACKAGES }: { packages?: string }) {
  const [tab, setTab] = useState<keyof typeof TABS>("bun");
  const [copied, setCopied] = useState(false);
  const command = tab === "bun" ? `bun add ${packages}` : TABS[tab]?.replace(PACKAGES, packages);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // clipboard can be unavailable (permissions, insecure context); button stays as-is
    }
  };

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-fd-border bg-fd-secondary/40">
      <div className="flex items-center gap-3 border-b border-fd-border px-3 py-1.5 text-xs">
        {Object.keys(TABS).map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setTab(name)}
            className={
              name === tab
                ? "font-medium text-fd-foreground"
                : "text-fd-muted-foreground hover:text-fd-foreground"
            }
          >
            {name}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3 font-mono text-sm">
        <span>{command}</span>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label="Copy install command"
          className="text-fd-muted-foreground hover:text-fd-foreground"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </button>
      </div>
    </div>
  );
}
