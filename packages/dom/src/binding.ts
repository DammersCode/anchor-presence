// Top-level wiring: registry + pointer + scheduler + resolver — consumed by the React adapter

import type { InterpolatorFactory, PresenceClient } from "@anchor-presence/core";
import { createAnchorRegistry } from "./registry";
import { attachPointerSource } from "./pointer";
import { createGeometryScheduler } from "./scheduler";
import type {
  CafLike,
  MutationObserverCtor,
  RafLike,
  ResizeObserverCtor,
} from "./scheduler";
import { startAutoRegister } from "./autoRegister";
import type { AutoRegisterOptions } from "./autoRegister";
import { RemoteResolver } from "./resolver";
import type { ResolvedCursor, VisibilityPolicy } from "./resolver";

export type { ResolvedCursor, ResolutionTier, VisibilityPolicy } from "./resolver";

/** How remote cursors turn into screen positions. */
export type ResolutionOptions<TContext = unknown, TUser = unknown> = {
  visibilityPolicy?: VisibilityPolicy<TContext, TUser>;
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

const ANCHOR_ATTRIBUTE_PATTERN = /^[A-Za-z][A-Za-z0-9]*(-[A-Za-z0-9]+)*$/;
const DEFAULT_ANCHOR_ATTRIBUTE = "data-anchor";
const DEFAULT_MAX_ANCHORS = 4;
const PROTOCOL_MAX_ANCHORS = 8;

export type DomBindingOptions<TContext = unknown, TUser = unknown> = {
  /** Attribute whose value is the anchor ID. Default `"data-anchor"`. */
  anchorAttribute?: string;
  /** Maximum anchors in the outbound fallback chain. Default `4`, clamped to `1` through `8`. */
  maxAnchors?: number;
  resolution?: ResolutionOptions<TContext, TUser>;
  environment?: EnvironmentOptions;
};

export type DomBinding<TContext = unknown, TUser = unknown> = {
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
  const anchorAttribute = options.anchorAttribute ?? DEFAULT_ANCHOR_ATTRIBUTE;
  if (!ANCHOR_ATTRIBUTE_PATTERN.test(anchorAttribute)) {
    throw new TypeError(`anchorAttribute must be a valid DOM attribute name, got "${anchorAttribute}"`);
  }

  let maxAnchors = DEFAULT_MAX_ANCHORS;
  if (options.maxAnchors !== undefined) {
    if (!Number.isInteger(options.maxAnchors) || !Number.isFinite(options.maxAnchors)) {
      throw new TypeError(`maxAnchors must be a finite integer, got ${String(options.maxAnchors)}`);
    }
    maxAnchors = Math.min(PROTOCOL_MAX_ANCHORS, Math.max(1, options.maxAnchors));
  }

  const registry = createAnchorRegistry();
  const autoOptions: AutoRegisterOptions = {
    attribute: anchorAttribute,
    registry,
  };
  if (environment.root !== undefined) autoOptions.root = environment.root;
  if (environment.MutationObserverCtor !== undefined) autoOptions.MutationObserverCtor = environment.MutationObserverCtor;
  const autoHandle = startAutoRegister(autoOptions);

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

  const pointerHandle = attachPointerSource(client, registry, {
    maxAnchors,
    root: environment.root,
    window: environment.window,
    getCachedRect: (element) => scheduler.getCachedRect(element),
  });

  let disposed = false;
  let unregisterTeardown: (() => void) | undefined;
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    unregisterTeardown?.();
    autoHandle?.dispose();
    scheduler.dispose();
    pointerHandle.detach();
    // final empty snapshot so subscribers render cursors gone before the signals go quiet
    snapshot = EMPTY_SNAPSHOT as ResolvedCursor<TContext, TUser>[];
    notifySnapshotListeners();
    snapshotListeners.clear();
  }
  unregisterTeardown = client.registerTeardown(dispose);

  return {
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
