// Pointer capture and target resolution — spec §9

import type { AnchorPoint, CursorPosition, PointerInfo, PresenceClient } from "@dammers/anchor-presence-core";
import type { AnchorRegistry } from "./registry.js";
import type { Rect } from "./geometry.js";

export type PointerSourceOptions = {
  maxAnchors: number;
  root?: Document | undefined;
  window?: Window | undefined;
  getCachedRect?: ((element: Element) => Rect | undefined) | undefined;
  /**
   * Publish a cursor at the focused element's center on focus changes.
   * The cursor clears when focus leaves the document. Default `false`.
   */
  captureFocus?: boolean | undefined;
  /** Elements with this attribute, and their descendants, never publish a cursor. Default `data-anchor-private`. */
  privateAttribute?: string | undefined;
};

export type PointerSourceHandle = {
  detach(): void;
};

// Shared per pointer type, so a move never allocates pointer info.
const POINTER_INFO: Record<string, PointerInfo | undefined> = {
  mouse: { type: "mouse" },
  pen: { type: "pen" },
  touch: { type: "touch" },
};

type AnchorEntry = { id: string; element: Element };

// nodeType instead of instanceof: an element of an iframe belongs to another realm
function isElement(value: unknown): value is Element {
  return typeof value === "object" && value !== null && (value as Node).nodeType === 1;
}

function pathHasAttribute(path: readonly EventTarget[], attribute: string): boolean {
  for (const node of path) if (isElement(node) && node.hasAttribute(attribute)) return true;
  return false;
}

function eventTargetElement(event: Event): Element | null {
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  const first = path[0];
  if (isElement(first)) return first;
  return isElement(event.target) ? event.target : null;
}

// 1e-4 of a box is 0.2 px at 2000 px, and it shortens every JSON frame by about a quarter
function roundFraction(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

const HIT_CACHE_MS = 50;

function buildCursorPosition(
  clientX: number,
  clientY: number,
  chain: AnchorEntry[],
  win: Window,
  getCachedRect?: (element: Element) => Rect | undefined,
): CursorPosition {
  const anchors: AnchorPoint[] = [];
  for (const { id, element } of chain) {
    // cache is at most one frame old; every layout-changing signal invalidates it (spec §9 tolerance)
    const rect = getCachedRect?.(element) ?? element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    const u = roundFraction((clientX - rect.left) / rect.width);
    const v = roundFraction((clientY - rect.top) / rect.height);
    anchors.push({ id, u, v });
  }

  const position: CursorPosition = { anchors };
  if (win.innerWidth > 0 && win.innerHeight > 0) {
    position.viewport = {
      u: roundFraction(clientX / win.innerWidth),
      v: roundFraction(clientY / win.innerHeight),
    };
  }
  return position;
}

/** Listens for pointer activity and feeds outbound samples to the presence client — spec §9. */
export function attachPointerSource(
  client: Pick<PresenceClient, "setLocalCursor" | "registerTeardown">,
  registry: AnchorRegistry,
  options: PointerSourceOptions,
): PointerSourceHandle {
  const maxAnchors = options.maxAnchors;
  const doc = options.root ?? document;
  const win = options.window ?? window;
  const getCachedRect = options.getCachedRect;
  const captureFocus = options.captureFocus ?? false;
  const privateAttribute = options.privateAttribute ?? "data-anchor-private";

  // composedPath sees through shadow roots; closest covers the hit-tested element of a captured pointer
  function isPrivate(event: Event, element: Element): boolean {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    return pathHasAttribute(path, privateAttribute) || element.closest(`[${privateAttribute}]`) !== null;
  }

  let clearedByPrivacy = false;
  function clearForPrivacy(): void {
    if (clearedByPrivacy) return;
    clearedByPrivacy = true;
    client.setLocalCursor(null);
  }

  // ponytail: composedPath still runs per move (shadow retargeting needs it); only the registry walk is cached
  let cachedTarget: Element | null = null;
  let cachedChain: AnchorEntry[] = [];
  let cachedGeneration = -1;

  function chainFor(target: Element): AnchorEntry[] {
    const generation = registry.getGeneration();
    if (target !== cachedTarget || generation !== cachedGeneration) {
      cachedTarget = target;
      cachedChain = registry.ancestors(target).slice(0, maxAnchors);
      cachedGeneration = generation;
    }
    return cachedChain;
  }

  const activeTouchPointers = new Set<number>();
  let cachedHit: { pointerId: number; at: number; element: Element } | null = null;

  // a captured pointer keeps its start element as target; the element under the pointer is the real anchor
  // shortcut: the hit lags up to one publish interval on moves, so a hit test does not run on every event
  function pointerTarget(event: PointerEvent): Element | null {
    const target = eventTargetElement(event);
    if (target?.hasPointerCapture?.(event.pointerId) !== true) return target;
    const fresh =
      event.type === "pointermove" &&
      cachedHit?.pointerId === event.pointerId &&
      event.timeStamp - cachedHit.at < HIT_CACHE_MS;
    if (fresh && cachedHit !== null) return cachedHit.element;
    const element = target.ownerDocument.elementFromPoint(event.clientX, event.clientY) ?? target;
    cachedHit = { pointerId: event.pointerId, at: event.timeStamp, element };
    return element;
  }

  function onPointerEvent(event: PointerEvent): void {
    // a synthetic mouse event reports isPrimary false, so only a second touch or pen contact is skipped
    if (event.pointerType !== "mouse" && "isPrimary" in event && !event.isPrimary) return;
    const target = pointerTarget(event);
    if (target === null) return;
    if (event.pointerType === "touch") activeTouchPointers.add(event.pointerId);
    if (isPrivate(event, target)) return clearForPrivacy();
    clearedByPrivacy = false;
    const position = buildCursorPosition(event.clientX, event.clientY, chainFor(target), win, getCachedRect);
    client.setLocalCursor(position, POINTER_INFO[event.pointerType] ?? {});
  }

  function onPointerEnd(event: PointerEvent): void {
    cachedHit = null;
    if (event.pointerType !== "touch") return;
    activeTouchPointers.delete(event.pointerId);
    if (activeTouchPointers.size === 0) client.setLocalCursor(null);
  }

  function onDocumentPointerLeave(): void {
    client.setLocalCursor(null);
  }

  function onWindowBlur(): void {
    client.setLocalCursor(null);
  }

  function onFocusIn(event: FocusEvent): void {
    const target = event.target;
    if (!isElement(target)) return;
    if (isPrivate(event, target)) return clearForPrivacy();
    clearedByPrivacy = false;
    const rect = getCachedRect?.(target) ?? target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const position = buildCursorPosition(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
      registry.ancestors(target).slice(0, maxAnchors),
      win,
      getCachedRect,
    );
    client.setLocalCursor(position, {});
  }

  function onFocusOut(): void {
    const active = doc.activeElement;
    if (active === null || active === doc.body) client.setLocalCursor(null);
  }

  doc.addEventListener("pointermove", onPointerEvent);
  doc.addEventListener("pointerdown", onPointerEvent);
  // pointerenter never fires at the document with an Element target; pointerover bubbles and does
  doc.addEventListener("pointerover", onPointerEvent);
  doc.addEventListener("pointerup", onPointerEnd);
  doc.addEventListener("pointercancel", onPointerEnd);
  doc.addEventListener("pointerleave", onDocumentPointerLeave);
  win.addEventListener("blur", onWindowBlur);
  if (captureFocus) {
    doc.addEventListener("focusin", onFocusIn);
    doc.addEventListener("focusout", onFocusOut);
  }

  let unregisterTeardown: (() => void) | undefined;

  function detach(): void {
    unregisterTeardown?.();
    doc.removeEventListener("pointermove", onPointerEvent);
    doc.removeEventListener("pointerdown", onPointerEvent);
    doc.removeEventListener("pointerover", onPointerEvent);
    doc.removeEventListener("pointerup", onPointerEnd);
    doc.removeEventListener("pointercancel", onPointerEnd);
    doc.removeEventListener("pointerleave", onDocumentPointerLeave);
    win.removeEventListener("blur", onWindowBlur);
    if (captureFocus) {
      doc.removeEventListener("focusin", onFocusIn);
      doc.removeEventListener("focusout", onFocusOut);
    }
  }

  unregisterTeardown = client.registerTeardown(detach);

  return { detach };
}
