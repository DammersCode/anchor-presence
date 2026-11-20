// Anchor registry — spec §8

import { isDevMode } from "@dammers/anchor-presence-core";
import { parentAcrossShadow } from "./dom-tree.js";

export interface AnchorRegistry {
  register(id: string, element: Element): () => void;
  get(id: string): Element | null;
  has(id: string): boolean;
  ancestors(element: Element): { id: string; element: Element }[]; // innermost first
  /** Changes on every register/unregister; callers use it to detect a stale cached walk. */
  getGeneration(): number;
  /** Notified whenever register/unregister changes the map (for scheduler invalidation). Not part of spec §8's interface. */
  onChange(listener: () => void): () => void;
}

export function createAnchorRegistry(): AnchorRegistry {
  const byId = new Map<string, Element>();
  const idByElement = new WeakMap<Element, string>();
  const changeListeners = new Set<() => void>();
  const warnedDuplicateIds = new Set<string>();
  let generation = 0;

  function notifyChange(): void {
    generation += 1;
    for (const listener of changeListeners) listener();
  }

  return {
    register(id, element) {
      const existing = byId.get(id);
      if (existing !== undefined && existing !== element && isDevMode() && !warnedDuplicateIds.has(id)) {
        warnedDuplicateIds.add(id);
        console.warn(`[anchor-presence] duplicate anchor id "${id}"; new element wins`, {
          id,
          previous: existing,
          next: element,
        });
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
        current = parentAcrossShadow(current);
      }
      return result;
    },

    getGeneration() {
      return generation;
    },

    onChange(listener) {
      changeListeners.add(listener);
      return () => {
        changeListeners.delete(listener);
      };
    },
  };
}
