// Top-level wiring: registry, pointer, scheduler, and resolver. The React adapter consumes it.

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

/**
 * How remote cursors turn into screen positions.
 */
export type ResolutionOptions<TContext = unknown, TUser = unknown> = {
  /** Shows or hides one cursor. Default: hide a cursor that does not resolve. */
  visibilityPolicy?: VisibilityPolicy<TContext, TUser>;
  /** Creates the interpolator per remote client. Default: `linearInterpolator`. */
  interpolatorFactory?: InterpolatorFactory;
  /** Runs a DOM hit test on the resolved point. Default `false`. */
  hitTest?: boolean;
};

/**
 * The DOM and timing hosts the binding runs against.
 * Every field defaults to the browser globals.
 */
export type EnvironmentOptions = {
  /** The document root to watch. Default: the global `document`. */
  root?: Document;
  /** The window for pointer and scroll events. Default: the global `window`. */
  window?: Window;
  /** The requestAnimationFrame function to use. Default: the global one. */
  raf?: RafLike;
  /** The cancelAnimationFrame function to use. Default: the global one. */
  caf?: CafLike;
  /** The ResizeObserver constructor to use. Default: the global one. */
  ResizeObserverCtor?: ResizeObserverCtor;
  /** The MutationObserver constructor to use. Default: the global one. */
  MutationObserverCtor?: MutationObserverCtor;
};

const ANCHOR_ATTRIBUTE_PATTERN = /^[A-Za-z][A-Za-z0-9]*(-[A-Za-z0-9]+)*$/u;
const DEFAULT_ANCHOR_ATTRIBUTE = "data-anchor";
const DEFAULT_MAX_ANCHORS = 4;
const PROTOCOL_MAX_ANCHORS = 8;

/**
 * Options for `createDomBinding`.
 */
export type DomBindingOptions<TContext = unknown, TUser = unknown> = {
  /** Attribute whose value is the anchor ID. Default `"data-anchor"`. */
  anchorAttribute?: string;
  /** Maximum anchors in the outbound fallback chain. Default `4`, clamped to `1` through `8`. */
  maxAnchors?: number;
  /** Settings for how remote cursors resolve. Omit for the defaults. */
  resolution?: ResolutionOptions<TContext, TUser>;
  /** The DOM and timing hosts the binding runs against. Omit for the browser globals. */
  environment?: EnvironmentOptions;
};

/**
 * The resolved-cursor surface of one client.
 */
export type DomBinding<TContext = unknown, TUser = unknown> = {
  /**
   * Marks the layout as dirty.
   * The binding re-resolves the cursors on the next frame.
   * @param reason An optional name for the trigger.
   */
  invalidate(reason?: string): void;
  /** Returns the latest resolved cursors. */
  getSnapshot(): ResolvedCursor<TContext, TUser>[];
  /**
   * Adds a listener for new cursor snapshots.
   * @returns A function that removes the listener.
   */
  subscribe(listener: () => void): () => void;
  /**
   * Stops the binding and clears its listeners.
   * The binding sends one final empty snapshot before it stops.
   */
  dispose(): void;
};

const EMPTY_SNAPSHOT: ResolvedCursor[] = [];

/**
 * Creates the DOM side of one client.
 * The binding watches local anchors, remote presences, and layout changes, then publishes resolved cursors.
 * @param client The client the binding reads from.
 * @param options Optional binding settings.
 * @returns The binding.
 */
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
    onMutationRecords: (records) => autoHandle.handleRecords(records),
    onAttach: () => autoHandle.setEnabled(false),
    onDetach: () => autoHandle.setEnabled(true),

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
