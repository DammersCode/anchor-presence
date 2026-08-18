// Anchor registry — spec §8

export interface AnchorRegistry {
  register(id: string, element: Element): () => void;
  get(id: string): Element | null;
  has(id: string): boolean;
  ancestors(element: Element): { id: string; element: Element }[]; // innermost first
  /** Notified whenever register/unregister changes the map (for scheduler invalidation). Not part of spec §8's interface. */
  onChange(listener: () => void): () => void;
}

function isDev(): boolean {
  try {
    return typeof process !== "undefined" && process.env?.NODE_ENV !== "production";
  } catch {
    return true;
  }
}

/** Walks up through ancestors, crossing shadow boundaries via `host`. */
function parentOf(element: Element): Element | null {
  const parent = element.parentElement;
  if (parent !== null) return parent;
  const root = element.getRootNode();
  if (root instanceof ShadowRoot) return root.host;
  return null;
}

export function createAnchorRegistry(): AnchorRegistry {
  const byId = new Map<string, Element>();
  const idByElement = new WeakMap<Element, string>();
  const changeListeners = new Set<() => void>();

  function notifyChange(): void {
    for (const listener of changeListeners) listener();
  }

  return {
    register(id, element) {
      const existing = byId.get(id);
      if (existing !== undefined && existing !== element && isDev()) {
        console.warn(`[anchor-presence] anchor id "${id}" re-registered with a different element; new element wins`);
      }
      byId.set(id, element);
      idByElement.set(element, id);
      notifyChange();

      let active = true;
      return () => {
        if (!active) return;
        active = false;
        if (byId.get(id) === element) {
          byId.delete(id);
          notifyChange();
        }
      };
    },

    get(id) {
      const element = byId.get(id);
      if (element === undefined) return null;
      return element.isConnected ? element : null;
    },

    has(id) {
      return this.get(id) !== null;
    },

    ancestors(element) {
      const result: { id: string; element: Element }[] = [];
      let current: Element | null = element;
      while (current !== null) {
        const id = idByElement.get(current);
        // reverse map can hold a stale entry after a new-element-wins replacement; cross-check the forward map
        if (id !== undefined && byId.get(id) === current) {
          result.push({ id, element: current });
        }
        current = parentOf(current);
      }
      return result;
    },

    onChange(listener) {
      changeListeners.add(listener);
      return () => {
        changeListeners.delete(listener);
      };
    },
  };
}
