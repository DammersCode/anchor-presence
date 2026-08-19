// Top-level wiring: registry + pointer + scheduler + resolver — consumed by the React adapter

import type { InterpolatorFactory, PresenceClient } from "@anchor-presence/core";
import { createAnchorRegistry } from "./registry";
import type { AnchorRegistry } from "./registry";
import { attachPointerSource } from "./pointer";
import { createGeometryScheduler } from "./scheduler";
import type {
  CafLike,
  MutationObserverCtor,
  RafLike,
  ResizeObserverCtor,
} from "./scheduler";
import { RemoteResolver } from "./resolver";
import type { ResolvedCursor, VisibilityPolicy } from "./resolver";

export type { AnchorRegistry } from "./registry";
export type { ResolvedCursor, ResolutionTier, VisibilityPolicy } from "./resolver";

/** How remote cursors turn into screen positions. */
export type ResolutionOptions<TContext = unknown> = {
  visibilityPolicy?: VisibilityPolicy<TContext>;
  interpolatorFactory?: InterpolatorFactory;
  hitTest?: boolean;
};

/** The DOM and timing hosts the binding runs against; every field defaults to the ambient browser globals. */
export type EnvironmentOptions = {
  root?: Document;
  window?: Window;
  raf?: RafLike;
  caf?: CafLike;
  ResizeObserverCtor?: ResizeObserverCtor;
  MutationObserverCtor?: MutationObserverCtor;
};

export type DomBindingOptions<TContext = unknown, TUser = unknown> = {
  maxAnchors?: number;
  resolution?: ResolutionOptions<TContext>;
  environment?: EnvironmentOptions;
};

export type DomBinding<TContext = unknown, TUser = unknown> = {
  registry: AnchorRegistry;
  invalidate(reason?: string): void;
  getSnapshot(): ResolvedCursor<TContext, TUser>[];
  subscribe(listener: () => void): () => void;
  dispose(): void;
};

const EMPTY_SNAPSHOT: ResolvedCursor[] = [];

export function createDomBinding<TContext = unknown, TUser = unknown>(
  client: PresenceClient<TContext, TUser>,
  options: DomBindingOptions<TContext, TUser> = {},
): DomBinding<TContext, TUser> {
  const { resolution = {}, environment = {} } = options;
  const registry = createAnchorRegistry();
  const resolver = new RemoteResolver<TContext, TUser>({ registry, ...resolution });

  let snapshot: ResolvedCursor<TContext, TUser>[] = EMPTY_SNAPSHOT as ResolvedCursor<TContext, TUser>[];
  const snapshotListeners = new Set<() => void>();

  function notifySnapshotListeners(): void {
    for (const listener of snapshotListeners) listener();
  }

  const scheduler = createGeometryScheduler<ResolvedCursor<TContext, TUser>[]>({
    hasActiveCursors: () => client.getRemoteSnapshot().some((presence) => presence.cursor !== null),

    compute(readState, timestampMs) {
      const { cursors, unsettled, activeAnchors } = resolver.resolveAll(
        client.getRemoteSnapshot(),
        readState,
        timestampMs,
      );

      const documentElement = (environment.root ?? document).documentElement;
      activeAnchors.push(documentElement);

      return { snapshot: cursors, activeAnchors, needsAnotherFrame: unsettled };
    },

    notify(next) {
      snapshot = next;
      notifySnapshotListeners();
    },

    onRegistryChange: (listener) => registry.onChange(listener),
    onRemoteData: (listener) => client.subscribeRemote(listener),

    ...environment,
  });

  const pointerHandle = attachPointerSource(client as PresenceClient<unknown, unknown>, registry, {
    maxAnchors: options.maxAnchors,
    root: environment.root,
    window: environment.window,
    getCachedRect: (element) => scheduler.getCachedRect(element),
  });

  let disposed = false;
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    scheduler.dispose();
    pointerHandle.detach();
    snapshotListeners.clear();
  }
  client.registerTeardown(dispose);

  return {
    registry,
    invalidate: (reason) => scheduler.invalidate(reason),
    getSnapshot: () => snapshot,
    subscribe(listener) {
      snapshotListeners.add(listener);
      return () => {
        snapshotListeners.delete(listener);
      };
    },
    dispose,
  };
}
