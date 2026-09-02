import type { AnchorRegistry } from "./registry";
import type { MutationObserverCtor } from "./scheduler";

export type AutoRegisterOptions = {
  attribute: string;
  root?: ParentNode;
  registry: AnchorRegistry;
  MutationObserverCtor?: MutationObserverCtor;
};

export type AutoRegisterHandle = {
  dispose(): void;
};

function isDev(): boolean {
  try {
    const env = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env;
    return env?.NODE_ENV !== "production";
  } catch {
    return true;
  }
}

function defaultMutationObserverCtor(): MutationObserverCtor | undefined {
  return typeof MutationObserver !== "undefined" ? MutationObserver : undefined;
}

export function startAutoRegister(options: AutoRegisterOptions): AutoRegisterHandle {
  const attribute = options.attribute;
  const root = options.root ?? document;
  const registry = options.registry;
  const MutationObserverImpl = options.MutationObserverCtor ?? defaultMutationObserverCtor();

  const autoAnchors = new Map<Element, { id: string; unregister: () => void }>();
  const warnedEmpty = new WeakSet<Element>();
  let disposed = false;

  function warnEmpty(element: Element): void {
    if (!isDev() || warnedEmpty.has(element)) return;
    warnedEmpty.add(element);
    console.warn(`[anchor-presence] empty ${attribute} value ignored`, { attribute, element });
  }

  function autoUnregister(element: Element): void {
    const entry = autoAnchors.get(element);
    if (entry === undefined) return;
    autoAnchors.delete(element);
    entry.unregister();
  }

  function registerAuto(element: Element, id: string): void {
    const unregister = registry.register(id, element);
    autoAnchors.set(element, { id, unregister });
  }

  function sync(): void {
    if (disposed) return;
    const live = new Set<Element>(root.querySelectorAll(`[${attribute}]`));

    for (const element of autoAnchors.keys()) {
      if (!live.has(element)) autoUnregister(element);
    }

    for (const element of live) {
      const id = element.getAttribute(attribute)?.trim() ?? "";
      if (id === "") {
        autoUnregister(element);
        warnEmpty(element);
        continue;
      }

      const existing = autoAnchors.get(element);
      if (existing === undefined) {
        registerAuto(element, id);
      } else if (existing.id !== id || registry.get(id) === null) {
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
    dispose() {
      if (disposed) return;
      disposed = true;
      observer?.disconnect();
      for (const element of autoAnchors.keys()) autoUnregister(element);
    },
  };
}
