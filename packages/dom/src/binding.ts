// Top-level wiring: registry + pointer + scheduler + resolver — consumed by the React adapter

import type { InterpolatorFactory, PresenceClient } from "@anchor-presence/core";
import { createAnchorRegistry } from "./registry";
import type { AnchorRegistry } from "./registry";
import { attachPointerSource } from "./pointer";
import type { PointerSourceOptions } from "./pointer";
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

export type DomBindingOptions<TContext = unknown, TUser = unknown> = {
  maxAnchors?: number;
  visibilityPolicy?: VisibilityPolicy<TContext>;
  interpolatorFactory?: InterpolatorFactory;
  hitTest?: boolean;
  root?: Document;
  window?: Window;
  raf?: RafLike;
  caf?: CafLike;
  ResizeObserverCtor?: ResizeObserverCtor;
  MutationObserverCtor?: MutationObserverCtor;
  pointer?: Pick<PointerSourceOptions, "root" | "window">;
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
  const registry = createAnchorRegistry();
  const resolver = new RemoteResolver<TContext, TUser>({
    registry,
    ...(options.visibilityPolicy !== undefined ? { visibilityPolicy: options.visibilityPolicy } : {}),
    ...(options.interpolatorFactory !== undefined ? { interpolatorFactory: options.interpolatorFactory } : {}),
    ...(options.hitTest !== undefined ? { hitTest: options.hitTest } : {}),
  });

  let snapshot: ResolvedCursor<TContext, TUser>[] = EMPTY_SNAPSHOT as ResolvedCursor<TContext, TUser>[];
  const snapshotListeners = new Set<() => void>();
  let lastSeenPresenceByClientId = new Map<string, unknown>();

  function notifySnapshotListeners(): void {
    for (const listener of snapshotListeners) listener();
  }

  const scheduler = createGeometryScheduler<ResolvedCursor<TContext, TUser>[]>({
    hasActiveCursors: () => client.getRemoteSnapshot().some((presence) => presence.cursor !== null),

    compute(readState, timestampMs) {
      const presences = client.getRemoteSnapshot();

      const networkUpdated = new Set<string>();
      const currentPresenceByClientId = new Map<string, unknown>();
      for (const presence of presences) {
        currentPresenceByClientId.set(presence.clientId, presence);
        if (lastSeenPresenceByClientId.get(presence.clientId) !== presence) {
          networkUpdated.add(presence.clientId);
        }
      }
      lastSeenPresenceByClientId = currentPresenceByClientId;

      const { cursors, unsettled, activeAnchors } = resolver.resolveAll(
        presences,
        readState.getRect,
        readState.viewportSize,
        networkUpdated,
        timestampMs,
        readState.getClientRect,
      );

      const documentElement = (options.root ?? document).documentElement;
      activeAnchors.push(documentElement);

      return { snapshot: cursors, activeAnchors, needsAnotherFrame: unsettled };
    },

    notify(next) {
      snapshot = next;
      notifySnapshotListeners();
    },

    onRegistryChange: (listener) => registry.onChange(listener),
    onRemoteData: (listener) => client.subscribeRemote(listener),

    ...(options.root !== undefined ? { root: options.root } : {}),
    ...(options.window !== undefined ? { window: options.window } : {}),
    ...(options.raf !== undefined ? { raf: options.raf } : {}),
    ...(options.caf !== undefined ? { caf: options.caf } : {}),
    ...(options.ResizeObserverCtor !== undefined ? { ResizeObserverCtor: options.ResizeObserverCtor } : {}),
    ...(options.MutationObserverCtor !== undefined ? { MutationObserverCtor: options.MutationObserverCtor } : {}),
  });

  const pointerHandle = attachPointerSource(client as PresenceClient<unknown, unknown>, registry, {
    ...(options.maxAnchors !== undefined ? { maxAnchors: options.maxAnchors } : {}),
    getCachedRect: (element) => scheduler.getCachedRect(element),
    ...(options.pointer ?? {}),
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
