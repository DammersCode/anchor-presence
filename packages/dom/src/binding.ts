// Top-level wiring: registry, pointer, scheduler, and resolver. The React adapter consumes it.

import type { InterpolatorFactory, PresenceClient } from "@anchor-presence/core";
import { linearInterpolator, noneInterpolator, reportListenerError } from "@anchor-presence/core";
import { createAnchorRegistry } from "./registry.js";
import { attachPointerSource } from "./pointer.js";
import { createGeometryScheduler } from "./scheduler.js";
import type { CafLike, MutationObserverCtor, RafLike, ResizeObserverCtor } from "./scheduler.js";
import { startAutoRegister } from "./auto-register.js";
import type { AutoRegisterOptions } from "./auto-register.js";
import { RemoteResolver } from "./resolver.js";
import type { ResolvedCursor, VisibilityPolicy } from "./resolver.js";

/**
 * How remote cursors turn into screen positions.
 */
export type ResolutionOptions<TContext = unknown, TUser = unknown> = {
  /**
   * Shows or hides one cursor.
   * @default hides a cursor that does not resolve
   */
  visibilityPolicy?: VisibilityPolicy<TContext, TUser>;
  /**
   * Creates the interpolator per remote client.
   * @default `linearInterpolator`, or `noneInterpolator` when the OS prefers reduced motion
   */
  interpolatorFactory?: InterpolatorFactory;
  /**
   * Runs a DOM hit test on the resolved point.
   * @default false
   */
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
const DEFAULT_PRIVATE_ATTRIBUTE = "data-anchor-private";
const DEFAULT_SENT_ANCHORS = 4;
const PROTOCOL_MAX_ANCHORS = 8;

// evaluated lazily inside createDomBinding, never at import time, so this stays SSR-safe
function prefersReducedMotion(win: Window | undefined): boolean {
  const target = win ?? (typeof window !== "undefined" ? window : undefined);
  return target?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function defaultInterpolatorFactory(win: Window | undefined): InterpolatorFactory {
  return prefersReducedMotion(win) ? noneInterpolator : linearInterpolator;
}

/**
 * Options for `createDomBinding`.
 */
export type DomBindingOptions<TContext = unknown, TUser = unknown> = {
  /**
   * Attribute whose value is the anchor ID.
   * @default "data-anchor"
   */
  anchorAttribute?: string;
  /**
   * Attribute that keeps the cursor private: over the element and its descendants the binding sends no cursor.
   * @default "data-anchor-private"
   */
  privateAttribute?: string;
  /**
   * Maximum anchors in the outbound fallback chain, clamped to `1` through `8`.
   * @default 4
   */
  maxSentAnchors?: number;
  /** Settings for how remote cursors resolve. Omit for the defaults. */
  resolution?: ResolutionOptions<TContext, TUser>;
  /** The DOM and timing hosts the binding runs against. Omit for the browser globals. */
  environment?: EnvironmentOptions;
  /**
   * Whether the local pointer publishes a cursor.
   * When `false` the client stays presence-only: context and user still flow, no local cursor.
   * @default true
   */
  capturePointer?: boolean;
  /**
   * Publish a cursor at the focused element's center on focus changes.
   * Ignored when `capturePointer` is `false`.
   * @default false
   */
  captureFocus?: boolean;
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
  /** Returns the element the resolver uses for an anchor id: the newest one when ids repeat, `null` when none is connected. */
  getAnchorElement(anchorId: string): Element | null;
  /**
   * Adds a listener for new cursor snapshots.
   * @returns A function that removes the listener.
   */
  subscribe(listener: () => void): () => void;
  /**
   * Stops the binding, then sends one final empty snapshot to its listeners and clears them.
   * It also clears the local cursor on the client, unless you pass `keepLocalCursor`, for example when you rebuild the binding.
   */
  dispose(options?: { keepLocalCursor?: boolean }): void;
};

const EMPTY_SNAPSHOT: never[] = [];

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
    throw new TypeError(
      `createDomBinding: anchorAttribute must be letters and digits in hyphen-separated groups, such as data-anchor, got "${anchorAttribute}"`,
    );
  }

  const privateAttribute = options.privateAttribute ?? DEFAULT_PRIVATE_ATTRIBUTE;
  if (!ANCHOR_ATTRIBUTE_PATTERN.test(privateAttribute)) {
    throw new TypeError(
      `createDomBinding: privateAttribute must be letters and digits in hyphen-separated groups, such as data-anchor-private, got "${privateAttribute}"`,
    );
  }

  let sentAnchors = DEFAULT_SENT_ANCHORS;
  if (options.maxSentAnchors !== undefined) {
    if (!Number.isInteger(options.maxSentAnchors)) {
      throw new TypeError(
        `createDomBinding: maxSentAnchors must be a finite integer, got ${String(options.maxSentAnchors)}`,
      );
    }
    sentAnchors = Math.min(PROTOCOL_MAX_ANCHORS, Math.max(1, options.maxSentAnchors));
  }

  const registry = createAnchorRegistry();
  const autoOptions: AutoRegisterOptions = {
    attribute: anchorAttribute,
    registry,
  };
  if (environment.root !== undefined) autoOptions.root = environment.root;
  if (environment.MutationObserverCtor !== undefined)
    autoOptions.MutationObserverCtor = environment.MutationObserverCtor;
  const autoHandle = startAutoRegister(autoOptions);

  const interpolatorFactory =
    resolution.interpolatorFactory ?? defaultInterpolatorFactory(environment.window);
  const resolver = new RemoteResolver<TContext, TUser>({ registry, ...resolution, interpolatorFactory });

  let snapshot: ResolvedCursor<TContext, TUser>[] = EMPTY_SNAPSHOT;
  const snapshotListeners = new Set<() => void>();

  function notifySnapshotListeners(): void {
    for (const listener of snapshotListeners) {
      try {
        listener();
      } catch (error) {
        reportListenerError(error);
      }
    }
  }

  // while our own connection is down, remote cursors are ghosts: hide them until it is back
  const isLive = () => {
    const status = client.getStatus();
    return status !== "reconnecting" && status !== "disconnected";
  };

  const scheduler = createGeometryScheduler<ResolvedCursor<TContext, TUser>[]>({
    hasActiveCursors: () =>
      isLive() &&
      (client.hasActiveCursors?.() ??
        client.getRemoteSnapshot().some((presence) => presence.cursor !== null)),

    compute(readState, timestampMs) {
      const idleClientIds = new Set<string>();
      for (const presence of client.getRemotePresence()) {
        if (presence.idle) idleClientIds.add(presence.clientId);
      }

      const { cursors, unsettled, activeAnchors } = resolver.resolveAll(
        isLive() ? client.getRemoteSnapshot() : [],
        readState,
        timestampMs,
        (clientId) => idleClientIds.has(clientId),
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
    onRemoteData: (listener) => {
      const stopRemote = client.subscribeRemote(listener);
      const stopStatus = client.subscribeStatus(() => listener());
      return () => {
        stopRemote();
        stopStatus();
      };
    },
    onMutationRecords: (records) => autoHandle.handleRecords(records),
    onAttach: () => autoHandle.setEnabled(false),
    onDetach: () => autoHandle.setEnabled(true),

    ...environment,
  });

  const pointerHandle =
    options.capturePointer !== false
      ? attachPointerSource(client, registry, {
          maxAnchors: sentAnchors,
          root: environment.root,
          window: environment.window,
          getCachedRect: (element) => scheduler.getCachedRect(element),
          captureFocus: options.captureFocus ?? false,
          privateAttribute,
        })
      : { detach() {} };

  // a closed tab never disposes the client: tell peers on pagehide, and the next publish rejoins
  const pageWindow = environment.window ?? (typeof window === "undefined" ? undefined : window);
  const leaveOnPageHide = () => client.leave();
  pageWindow?.addEventListener("pagehide", leaveOnPageHide);

  let disposed = false;
  let unregisterTeardown: (() => void) | undefined;
  function dispose(disposeOptions?: { keepLocalCursor?: boolean }): void {
    if (disposed) return;
    disposed = true;
    // a consumer-owned client stays alive: do not leave the last cursor on peers
    if (disposeOptions?.keepLocalCursor !== true) client.setLocalCursor(null);
    pageWindow?.removeEventListener("pagehide", leaveOnPageHide);
    unregisterTeardown?.();
    autoHandle?.dispose();
    scheduler.dispose();
    pointerHandle.detach();
    // final empty snapshot so subscribers render cursors gone before the signals go quiet
    snapshot = EMPTY_SNAPSHOT;
    notifySnapshotListeners();
    snapshotListeners.clear();
  }
  unregisterTeardown = client.registerTeardown(dispose);

  return {
    invalidate: (reason) => scheduler.invalidate(reason),
    getSnapshot: () => snapshot,
    getAnchorElement: (anchorId) => registry.get(anchorId),
    subscribe(listener) {
      snapshotListeners.add(listener);
      return () => {
        snapshotListeners.delete(listener);
      };
    },
    dispose,
  };
}
