// [data-anchor] auto-registration — a separate observer from the scheduler's geometry watcher

import type { AnchorRegistry } from "./registry";
import type { MutationObserverCtor } from "./scheduler";

export type AutoRegisterOptions = {
  /** Attribute to watch. Default "data-anchor". */
  attribute?: string;
  /** Subtree to scan and observe. Default `document`. */
  root?: ParentNode;
  registry: AnchorRegistry;
  /** Elements with a manual register; the auto observer never owns these. */
  explicit: WeakSet<Element>;
  onAutoRegistered(id: string, el: Element): void;
  onAutoUnregistered(id: string, el: Element): void;
  MutationObserverCtor?: MutationObserverCtor;
};

export type AutoRegisterHandle = {
  /** Re-run the scan + diff (called by the explicit-register wrapper for release/take-back). */
  resync(): void;
  dispose(): void;
};

function isDev(): boolean {
  try {
    return typeof process !== "undefined" && process.env?.NODE_ENV !== "production";
  } catch {
    return true;
  }
}

function defaultMutationObserverCtor(): MutationObserverCtor | undefined {
  return typeof MutationObserver !== "undefined" ? MutationObserver : undefined;
}

export function startAutoRegister(options: AutoRegisterOptions): AutoRegisterHandle {
  const attribute = options.attribute ?? "data-anchor";
  const root = options.root ?? document;
  const registry = options.registry;
  const explicit = options.explicit;
  const MutationObserverImpl = options.MutationObserverCtor ?? defaultMutationObserverCtor();

  const autoAnchors = new Map<Element, { id: string; unregister: () => void }>();
  let autoCounter = 0;
  let disposed = false;

  function resolveId(element: Element): string {
    const value = element.getAttribute(attribute);
    if (value !== null && value !== "") return value;
    if (element.id !== "") return element.id;
    autoCounter += 1;
    const id = `auto-${autoCounter}`;
    if (isDev()) {
      console.warn(`[anchor-presence] empty ${attribute} without an element id; registered as "${id}"`);
    }
    return id;
  }

  function autoUnregister(element: Element): void {
    const entry = autoAnchors.get(element);
    if (entry === undefined) return;
    autoAnchors.delete(element);
    entry.unregister();
    options.onAutoUnregistered(entry.id, element);
  }

  function registerAuto(element: Element, id: string): void {
    const unregister = registry.register(id, element);
    autoAnchors.set(element, { id, unregister });
    options.onAutoRegistered(id, element);
  }

  function sync(): void {
    if (disposed) return;
    const live = new Set<Element>(root.querySelectorAll(`[${attribute}]`));

    for (const element of autoAnchors.keys()) {
      if (!live.has(element)) autoUnregister(element);
    }

    for (const element of live) {
      if (explicit.has(element)) {
        // explicit registration wins over an auto one on the same element
        autoUnregister(element);
        continue;
      }
      const id = resolveId(element);
      const existing = autoAnchors.get(element);
      if (existing === undefined) {
        registerAuto(element, id);
      } else if (existing.id !== id) {
        // a value change is a different anchor: unregister the old, register the new
        autoUnregister(element);
        registerAuto(element, id);
      } else if (registry.get(id) === null) {
        // the registry entry was freed (last-wins owner gone): reclaim the id
        autoUnregister(element);
        registerAuto(element, id);
      }
    }
  }

  const observer = MutationObserverImpl !== undefined ? new MutationObserverImpl(sync) : null;
  if (observer !== null) {
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [attribute],
    });
  }
  sync();

  return {
    resync() {
      sync();
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      observer?.disconnect();
      for (const element of autoAnchors.keys()) autoUnregister(element);
    },
  };
}
