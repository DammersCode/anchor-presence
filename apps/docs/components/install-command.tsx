"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { installPackages } from "@/lib/shared";

const ADD = { bun: "bun add", npm: "npm install", pnpm: "pnpm add" };
const RUN = { bun: "bunx", npm: "npx", pnpm: "pnpm dlx" };
type Manager = keyof typeof ADD;

/** Package-manager-aware snippet with a one-click copy: installs `packages`, or executes `run` as a CLI. */
export function InstallCommand({ packages = installPackages, run }: { packages?: string; run?: string }) {
  const [tab, setTab] = useState<Manager>("bun");
  const [copied, setCopied] = useState(false);
  const command = run === undefined ? `${ADD[tab]} ${packages}` : `${RUN[tab]} ${run}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // clipboard can be unavailable (permissions, insecure context); button stays as-is
    }
  };

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-fd-border bg-fd-secondary/40">
      <div className="flex items-center gap-3 border-b border-fd-border px-3 py-1.5 text-xs">
        {(Object.keys(ADD) as Manager[]).map((name) => (
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
