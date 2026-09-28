import Link from "next/link";
import { InstallCommand } from "@/components/install-command";
import { Demo } from "@/components/demo";
import { mainContentId } from "@/lib/shared";

const GUARANTEES = [
  {
    n: "01",
    title: "No pixels on the wire",
    body: "Position is a label plus an offset, never a coordinate.",
  },
  {
    n: "02",
    title: "Your layout is the source of truth",
    body: "Each browser resolves against its own DOM.",
  },
  { n: "03", title: "Survives reflow and resize", body: "The cursor follows the element, not the frame." },
  {
    n: "04",
    title: "Fails in a defined order",
    body: "Element, then parent, then region, then viewport, then hidden.",
  },
  { n: "05", title: "Adapters stay thin", body: "The framework layer never owns the engine's state." },
  { n: "06", title: "The channel is swappable", body: "The engine imports no transport." },
  {
    n: "07",
    title: "Reflow costs nothing",
    body: "A local layout change moves a still cursor with zero packets.",
  },
  {
    n: "08",
    title: "Messages can't run code",
    body: "Anchor IDs resolve only against elements marked with the binding's anchor attribute.",
  },
  { n: "09", title: "You own the rendering", body: "No cursor component is required." },
  { n: "10", title: "Built to grow", body: "The boundary is designed to extend without touching the core." },
];

export default function HomePage() {
  return (
    <div id={mainContentId} className="mx-auto max-w-6xl px-4 py-12">
      <section className="pt-4 pb-10 md:pt-8 md:pb-14">
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-fd-border bg-fd-card px-3 py-1.5 text-sm shadow-sm">
          <span className="live-dot size-1.5 rounded-full bg-[#22d3ee]" />
          Real-time presence for the web
        </span>
        <h1 className="font-display text-balance text-4xl leading-[1.05] font-extrabold tracking-tight md:text-6xl">
          Live cursors that stay on the{" "}
          <span className="text-[#4f46e5] dark:text-fd-accent-foreground">right element</span>.
        </h1>
        <p className="mt-6 max-w-[52ch] text-lg text-fd-muted-foreground">
          Anchor Presence sends a label, not pixels. Each browser resolves it against its own layout. Your
          teammate&apos;s cursor stays on the element, even when their screen differs from yours.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link
            href="/docs"
            className="rounded-full bg-fd-primary px-5 py-2.5 text-sm font-semibold text-fd-primary-foreground"
          >
            Read the docs
          </Link>
          <Link
            href="/docs/examples"
            className="rounded-full border border-fd-border px-5 py-2.5 text-sm font-semibold"
          >
            See the examples
          </Link>
          <Link href="#how" className="border-b border-fd-border pb-px text-sm font-semibold">
            How it works &rarr;
          </Link>
        </div>
        <div className="mt-10 md:mt-14">
          <Demo />
          <p className="text-xs text-fd-muted-foreground">
            The same board in two layouts. Move your pointer in one pane — the cursor lands on the same card
            in the other.
          </p>
        </div>
      </section>

      <section id="how" className="border-t border-fd-border py-14">
        <p className="font-mono text-xs tracking-[0.16em] text-[#4f46e5] dark:text-fd-accent-foreground uppercase">
          How it works
        </p>
        <h2 className="font-display mt-3 mb-3 text-3xl font-extrabold tracking-tight md:text-4xl">
          A cursor is an address, not a coordinate.
        </h2>
        <p className="mb-8 max-w-[60ch] text-fd-muted-foreground">
          No screen position ever crosses the wire. What travels is an address — the rest happens locally.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-fd-border bg-fd-card p-6">
            <div className="mb-3 font-mono text-xs text-[#4f46e5] dark:text-fd-accent-foreground">01</div>
            <h3 className="mb-2 font-semibold">You send what, not where</h3>
            <p className="text-sm text-fd-muted-foreground">
              A pointer move becomes a label plus a position inside it. Never a screen coordinate.
            </p>
          </div>
          <div className="rounded-2xl border border-fd-border bg-fd-card p-6">
            <div className="mb-3 font-mono text-xs text-[#4f46e5] dark:text-fd-accent-foreground">02</div>
            <h3 className="mb-2 font-semibold">Your channel carries it</h3>
            <p className="text-sm text-fd-muted-foreground">
              It works over any real-time channel: WebSocket, Socket.IO, SignalR, BroadcastChannel.
            </p>
          </div>
          <div className="rounded-2xl border border-fd-border bg-fd-card p-6">
            <div className="mb-3 font-mono text-xs text-[#4f46e5] dark:text-fd-accent-foreground">03</div>
            <h3 className="mb-2 font-semibold">Their browser does the rest</h3>
            <p className="text-sm text-fd-muted-foreground">
              The label is measured against their own layout and turned into pixels there.
            </p>
          </div>
        </div>
      </section>

      <section id="rules" className="border-t border-fd-border py-14">
        <p className="font-mono text-xs tracking-[0.16em] text-[#4f46e5] dark:text-fd-accent-foreground uppercase">
          Guarantees
        </p>
        <h2 className="font-display mt-3 mb-3 text-3xl font-extrabold tracking-tight md:text-4xl">
          Built so it doesn&apos;t break.
        </h2>
        <p className="mb-8 max-w-[60ch] text-fd-muted-foreground">
          The library holds ten rules on every message. The ones you feel on the first move:
        </p>
        <div className="grid gap-x-11 gap-y-0 rounded-2xl border border-fd-border bg-fd-card p-8 md:grid-cols-2">
          {GUARANTEES.map((g) => (
            <div
              key={g.n}
              className="grid grid-cols-[44px_1fr] gap-3.5 border-t border-fd-border/60 py-4 first:border-t-0"
            >
              <span className="font-mono text-sm font-semibold text-[#4f46e5] dark:text-fd-accent-foreground">
                {g.n}
              </span>
              <div>
                <b className="block text-sm font-semibold">{g.title}</b>
                <span className="text-[13.5px] text-fd-muted-foreground">{g.body}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-fd-border py-14">
        <p className="font-mono text-xs tracking-[0.16em] text-[#4f46e5] dark:text-fd-accent-foreground uppercase">
          Run it
        </p>
        <h2 className="font-display mt-3 mb-3 text-3xl font-extrabold tracking-tight md:text-4xl">
          Add live cursors in minutes.
        </h2>
        <p className="max-w-[60ch] text-fd-muted-foreground">
          One provider, one hook, one layer. Your transport, your rendering.
        </p>
        <InstallCommand />
        <p className="max-w-[60ch] text-xs text-fd-muted-foreground">
          For a React app. Other setups need fewer packages.{" "}
          <Link
            href="/docs/get-started/installation"
            className="font-medium text-fd-foreground underline underline-offset-2"
          >
            See Installation
          </Link>
        </p>
        <p className="mt-8 font-mono text-xs text-fd-muted-foreground">Or let your AI agent wire it up</p>
        <InstallCommand run="skills add DammersCode/anchor-presence" />
        <p className="max-w-[60ch] text-xs text-fd-muted-foreground">
          One skill wires up cursors, another audits layouts.{" "}
          <Link href="/docs/skills" className="font-medium text-fd-foreground underline underline-offset-2">
            See Skills
          </Link>
        </p>
        <Link
          href="/docs/get-started/quick-start"
          className="mt-8 inline-block rounded-full bg-fd-primary px-5 py-2.5 text-sm font-semibold text-fd-primary-foreground"
        >
          Quick start
        </Link>
      </section>
    </div>
  );
}
