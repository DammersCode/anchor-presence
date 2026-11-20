import { isDevMode } from "@dammers/anchor-presence-core";
import type { AnchorRegistry } from "./registry.js";
import type { MutationObserverCtor } from "./scheduler.js";

export type AutoRegisterOptions = {
  attribute: string;
  root?: ParentNode | undefined;
  registry: AnchorRegistry;
  MutationObserverCtor?: MutationObserverCtor | undefined;
};

export type AutoRegisterHandle = {
  setEnabled(enabled: boolean): void;
  handleRecords(records?: MutationRecord[]): void;
  dispose(): void;
};

function defaultMutationObserverCtor(): MutationObserverCtor | undefined {
  return typeof MutationObserver !== "undefined" ? MutationObserver : undefined;
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1;
}

export function startAutoRegister(options: AutoRegisterOptions): AutoRegisterHandle {
  const attribute = options.attribute;
  const root = options.root ?? document;
  const registry = options.registry;
  const MutationObserverImpl = options.MutationObserverCtor ?? defaultMutationObserverCtor();

  const autoAnchors = new Map<Element, { id: string; unregister: () => void }>();
  const warnedEmpty = new WeakSet<Element>();
  let disposed = false;
  let enabled = true;

  const observer =
    MutationObserverImpl !== undefined ? new MutationObserverImpl((records) => handleRecords(records)) : null;

  function connectObserver(): void {
    if (disposed || !enabled || observer === null) return;
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [attribute],
    });
  }

  function disconnectObserver(): void {
    observer?.disconnect();
  }

  function handleRecords(records?: MutationRecord[]): void {
    if (disposed) return;
    if (records === undefined || records.length === 0) {
      sync();
      return;
    }
    const replacedIds = new Set<string>();
    for (const record of records) {
      if (record.type === "attributes") {
        if (record.attributeName === attribute && isElement(record.target)) {
          const previous = autoAnchors.get(record.target);
          syncElement(record.target);
          if (previous !== undefined && autoAnchors.get(record.target)?.id !== previous.id)
            replacedIds.add(previous.id);
        }
        continue;
      }
      for (const node of Array.from(record.removedNodes)) releaseNode(node, replacedIds);
      for (const node of Array.from(record.addedNodes)) adoptNode(node);
    }
    // one querySelectorAll pass for every id a removal replaced, instead of one pass per id
    if (replacedIds.size > 0) resyncIds(replacedIds);
  }

  function warnEmpty(element: Element): void {
    if (!isDevMode() || warnedEmpty.has(element)) return;
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

  function syncElement(element: Element): void {
    const id = element.getAttribute(attribute)?.trim() ?? "";
    if (id === "") {
      autoUnregister(element);
      warnEmpty(element);
      return;
    }

    const existing = autoAnchors.get(element);
    if (existing === undefined || existing.id !== id || registry.get(id) === null) {
      autoUnregister(element);
      registerAuto(element, id);
    }
  }

  // one querySelectorAll pass covers every id in `ids`, instead of one pass per id
  function resyncIds(ids: ReadonlySet<string>): void {
    for (const element of Array.from(root.querySelectorAll(`[${attribute}]`))) {
      const id = element.getAttribute(attribute)?.trim() ?? "";
      if (ids.has(id)) syncElement(element);
    }
  }

  function adoptNode(node: Node): void {
    if (!isElement(node)) return;
    if (node.hasAttribute(attribute)) syncElement(node);
    for (const element of Array.from(node.querySelectorAll(`[${attribute}]`))) syncElement(element);
  }

  // accumulates the ids this removal frees into `replacedIds`; the caller resyncs them in one pass
  function releaseNode(node: Node, replacedIds: Set<string>): void {
    if (!isElement(node)) return;
    const release = (element: Element): void => {
      const entry = autoAnchors.get(element);
      if (entry !== undefined) replacedIds.add(entry.id);
      autoUnregister(element);
    };

    release(node);
    for (const element of Array.from(node.querySelectorAll(`[${attribute}]`))) release(element);
  }

  function sync(): void {
    if (disposed) return;
    const live = new Set<Element>(Array.from(root.querySelectorAll(`[${attribute}]`)));

    for (const element of autoAnchors.keys()) {
      if (!live.has(element)) autoUnregister(element);
    }

    for (const element of live) syncElement(element);
  }

  connectObserver();
  sync();

  return {
    setEnabled(next: boolean): void {
      if (disposed || enabled === next) return;
      enabled = next;
      if (enabled) {
        connectObserver();
        sync();
      } else {
        disconnectObserver();
      }
    },

    handleRecords,

    dispose() {
      if (disposed) return;
      disposed = true;
      disconnectObserver();
      for (const element of autoAnchors.keys()) autoUnregister(element);
    },
  };
}
