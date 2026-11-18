import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, useContext, useEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  createInMemoryPair,
  createPresenceClient,
  type EventChannel,
  type EventMap,
  type PeerChange,
  type TypedRemoteEvent,
  type ConnectionStatus,
  type CursorPresence,
  type PresenceClient,
  type RemotePresence,
} from "@anchor-presence/core";
import {
  createDomBinding,
  type DomBinding,
  type ResolutionTier,
  type ResolvedCursor,
  type VisibilityPolicy as ExportedVisibilityPolicy,
} from "@anchor-presence/dom";
import {
  createPresenceHooks as exportedCreatePresenceHooks,
  LiveCursorContext,
  LiveCursorProvider,
  useCursorBinding,
  useCursorStatus,
  type LiveCursorProviderProps,
  type RemoteUser,
} from "../src/index";
import type { useCursorBinding as exportedUseCursorBinding } from "../src/hooks/use-cursor-binding";
import { makeFakeBinding, makeFakeClient } from "./test-utils";

// Verbatim copies of doc samples; the last test checks each copy against its .mdx source.

function ConnectionBanner() {
  const status = useCursorStatus();
  if (status === "connected") return null;
  return <div role="status">{status}</div>;
}

function PresenceReady() {
  const { client, binding } = useContext(LiveCursorContext);
  return client !== null && binding !== null ? <p>Presence is ready.</p> : null;
}

type VisibilityPolicy<TContext = unknown, TUser = unknown> = (input: {
  presence: CursorPresence<TContext, TUser>;
  resolution: { tier: ResolutionTier; anchorId: string | null; pointVisible: boolean };
}) => "show" | "hide";

let receiverDialog: string | undefined;
const myOpenDialogId = () => receiverDialog;

const dialogAwarePolicy: VisibilityPolicy<{ dialog?: string }> = ({ presence, resolution }) => {
  const senderDialog = presence.context?.dialog;
  if (typeof senderDialog === "string" && senderDialog !== myOpenDialogId()) return "hide";
  return resolution.tier === "hidden" ? "hide" : "show";
};

const invalidations: (string | undefined)[] = [];
const binding = { invalidate: (reason?: string) => invalidations.push(reason) };

let openDialog: string | null = null;

const dialogPolicy: VisibilityPolicy<{ dialog?: string }> = ({ presence, resolution }) => {
  const senderDialog = presence.context?.dialog;
  if (typeof senderDialog === "string" && senderDialog !== openDialog) return "hide";
  return resolution.tier === "hidden" ? "hide" : "show";
};

function setOpenDialog(next: string | null) {
  openDialog = next;
  binding.invalidate("dialog-changed");
}

function SyncOpenDialog({ dialog }: { dialog: string | null }) {
  const cursorBinding = useCursorBinding();
  useEffect(() => {
    openDialog = dialog;
    cursorBinding?.invalidate("dialog-changed");
  }, [cursorBinding, dialog]);
  return null;
}

declare namespace Listing {
  // oxlint-disable-next-line eslint/no-shadow -- the listing keeps the exported name
  function useCursorBinding<TContext = unknown, TUser = unknown>(): DomBinding<TContext, TUser> | null;

  function createPresenceHooks<TContext = unknown, TUser = unknown, TEvents extends object = EventMap>(): {
    LiveCursorProvider: (props: LiveCursorProviderProps<TContext, TUser>) => ReactNode;
    useCursorBinding: () => DomBinding<TContext, TUser> | null;
    useCursorClient: () => PresenceClient<TContext, TUser> | null;
    useLocalContext: () => [TContext | undefined, (next: TContext | undefined) => void];
    useCursorEvents: (listener: (event: TypedRemoteEvent<TEvents>) => void) => void;
    useRemotePresence: () => RemotePresence<TContext, TUser>[];
    useCursorStatus: () => ConnectionStatus;
    useRemoteCursors: () => ResolvedCursor<TContext, TUser>[];
    useRemoteCursorsSelector: <TSelected>(
      select: (cursors: ResolvedCursor<TContext, TUser>[]) => TSelected,
      isEqual?: (a: TSelected, b: TSelected) => boolean,
    ) => TSelected;
    useRemoteUsers: () => RemoteUser<TUser>[];
    useLocalUser: () => [TUser | undefined, (next: TUser | undefined) => void];
    usePeerChanges: (listener: (change: PeerChange<TContext, TUser>) => void) => void;
    useSendEvent: () => EventChannel<TEvents>["send"];
  };
}

const readRepoFile = (file: string) =>
  readFileSync(join(process.cwd(), file), "utf8").replaceAll("\r\n", "\n");

// Leading whitespace differs between a sample and its copy inside a block, so compare trimmed lines.
const trimLines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .join("\n");

// Returns the ts or tsx block of `page` that contains `marker`, without import lines.
function docSample(page: string, marker: string): string {
  const markdown = readRepoFile(`apps/docs/content/docs/${page}`);
  const blocks = [...markdown.matchAll(/```tsx?\n([\s\S]*?)```/gu)].map(([, body = ""]) =>
    body
      .split("\n")
      .filter((line) => !line.startsWith("import "))
      .join("\n")
      .trim(),
  );
  const block = blocks.find((body) => body.includes(marker));
  if (block === undefined) throw new Error(`no sample with "${marker}" in ${page}`);
  return block;
}

function render(node: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(node));
  return {
    container,
    rerender: (next: ReactNode) => act(() => root.render(next)),
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const atAnchor = { tier: "anchor" as const, anchorId: "nav", pointVisible: true };
const fromSender = (context?: { dialog?: string }): CursorPresence<{ dialog?: string }> => ({
  version: 1,
  clientId: "peer",
  session: "s",
  sequence: 1,
  cursor: null,
  context,
});

describe("connection-status.mdx: ConnectionBanner", () => {
  it("renders nothing while connected and the status otherwise", () => {
    const { client, setStatus } = makeFakeClient();
    const view = render(
      <LiveCursorProvider client={client} binding={makeFakeBinding().binding}>
        <ConnectionBanner />
      </LiveCursorProvider>,
    );
    expect(view.container.textContent).toBe("");
    act(() => setStatus("reconnecting"));
    expect(view.container.querySelector('[role="status"]')?.textContent).toBe("reconnecting");
    view.unmount();
  });
});

describe("api/components.mdx: LiveCursorContext", () => {
  it("shows the line only below a provider with a client and a binding", () => {
    const { client } = makeFakeClient();
    const view = render(<PresenceReady />);
    expect(view.container.textContent).toBe("");
    view.rerender(
      <LiveCursorProvider client={client} binding={makeFakeBinding().binding}>
        <PresenceReady />
      </LiveCursorProvider>,
    );
    expect(view.container.textContent).toBe("Presence is ready.");
    view.unmount();
  });
});

describe("ui-context.mdx: VisibilityPolicy and dialogAwarePolicy", () => {
  it("the listing equals the exported type", () => {
    expectTypeOf<VisibilityPolicy<{ dialog?: string }, { name: string }>>().toEqualTypeOf<
      ExportedVisibilityPolicy<{ dialog?: string }, { name: string }>
    >();
  });

  it("hides a sender in another dialog and passes to a client with the same context type", () => {
    receiverDialog = undefined;
    expect(dialogAwarePolicy({ presence: fromSender({ dialog: "invite" }), resolution: atAnchor })).toBe(
      "hide",
    );
    expect(dialogAwarePolicy({ presence: fromSender(), resolution: atAnchor })).toBe("show");
    const cleared = fromSender({ dialog: null } as unknown as { dialog?: string });
    expect(dialogAwarePolicy({ presence: cleared, resolution: atAnchor })).toBe("show");
    receiverDialog = "invite";
    expect(dialogAwarePolicy({ presence: fromSender({ dialog: "invite" }), resolution: atAnchor })).toBe(
      "show",
    );

    const client = createPresenceClient<{ dialog?: string }>({ transport: createInMemoryPair().a });
    const domBinding = createDomBinding(client, { resolution: { visibilityPolicy: dialogAwarePolicy } });
    domBinding.dispose();
    client.dispose();
  });
});

describe("visibility-policy.mdx: run the policy again", () => {
  it("setOpenDialog changes the policy result and invalidates the binding", () => {
    const presence = fromSender({ dialog: "invite" });
    expect(dialogPolicy({ presence, resolution: atAnchor })).toBe("hide");
    setOpenDialog("invite");
    expect(dialogPolicy({ presence, resolution: atAnchor })).toBe("show");
    expect(invalidations).toEqual(["dialog-changed"]);
  });

  it("SyncOpenDialog writes the dialog and invalidates the provider binding on each change", () => {
    const { client } = makeFakeClient();
    const fake = makeFakeBinding().binding;
    const invalidate = vi.spyOn(fake, "invalidate");
    const tree = (dialog: string | null) => (
      <LiveCursorProvider client={client} binding={fake}>
        <SyncOpenDialog dialog={dialog} />
      </LiveCursorProvider>
    );
    const view = render(tree(null));
    view.rerender(tree(null));
    view.rerender(tree("review"));
    expect(openDialog).toBe("review");
    expect(invalidate.mock.calls).toEqual([["dialog-changed"], ["dialog-changed"]]);
    view.unmount();
  });
});

describe("api/hooks.mdx: useCursorBinding and createPresenceHooks listings", () => {
  it("equal the exported signatures", () => {
    type Context = { page: string };
    type User = { name: string };
    expectTypeOf<ReturnType<typeof Listing.useCursorBinding<Context, User>>>().toEqualTypeOf<
      ReturnType<typeof exportedUseCursorBinding<Context, User>>
    >();
    expectTypeOf<ReturnType<typeof Listing.createPresenceHooks<Context, User>>>().toEqualTypeOf<
      ReturnType<typeof exportedCreatePresenceHooks<Context, User>>
    >();
    expect(Object.keys(exportedCreatePresenceHooks<Context, User>())).toContain("useCursorBinding");
  });
});

describe("doc sample sources", () => {
  it("match the copies in this file", () => {
    const source = trimLines(readRepoFile("packages/react/test/docs-react-samples-more.test.tsx"))
      .split("\n")
      .filter((line) => !line.includes("oxlint-disable"))
      .join("\n");
    const samples = [
      docSample("react/connection-status.mdx", "function ConnectionBanner"),
      docSample("react/api/components.mdx", "function PresenceReady"),
      docSample("get-started/concepts/ui-context.mdx", "type VisibilityPolicy"),
      docSample("get-started/concepts/ui-context.mdx", "const dialogAwarePolicy"),
      docSample("dom/visibility-policy.mdx", "function setOpenDialog"),
      docSample("dom/visibility-policy.mdx", "function SyncOpenDialog"),
      docSample("react/api/hooks.mdx", "function useCursorBinding"),
      docSample("react/api/hooks.mdx", "function createPresenceHooks"),
    ];
    for (const sample of samples) expect(source).toContain(trimLines(sample));
  });
});
