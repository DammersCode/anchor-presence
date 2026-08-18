// Pointer capture and target resolution — spec §9

import type { CursorPosition, PresenceClient } from "@anchor-presence/core";
import type { AnchorRegistry } from "./registry";

export const DEFAULT_MAX_ANCHORS = 4;

export type PointerSourceOptions = {
  maxAnchors?: number;
  root?: Document;
  window?: Window;
};

export type PointerSourceHandle = {
  detach(): void;
};

function eventTargetElement(event: Event): Element | null {
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  const first = path[0];
  if (first instanceof Element) return first;
  return event.target instanceof Element ? event.target : null;
}

function buildCursorPosition(
  clientX: number,
  clientY: number,
  target: Element,
  registry: AnchorRegistry,
  maxAnchors: number,
  win: Window,
): CursorPosition {
  const chain = registry.ancestors(target).slice(0, maxAnchors);

  const anchors: CursorPosition["anchors"] = [];
  for (const { id, element } of chain) {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    const u = (clientX - rect.left) / rect.width;
    const v = (clientY - rect.top) / rect.height;
    anchors.push({ id, u, v });
  }

  const position: CursorPosition = { anchors };
  if (win.innerWidth > 0 && win.innerHeight > 0) {
    position.viewport = { u: clientX / win.innerWidth, v: clientY / win.innerHeight };
  }
  return position;
}

/** Listens for pointer activity and feeds outbound samples to the presence client — spec §9. */
export function attachPointerSource(
  client: PresenceClient<unknown, unknown>,
  registry: AnchorRegistry,
  options: PointerSourceOptions = {},
): PointerSourceHandle {
  const maxAnchors = options.maxAnchors ?? DEFAULT_MAX_ANCHORS;
  const doc = options.root ?? document;
  const win = options.window ?? window;

  function onPointerEvent(event: PointerEvent): void {
    const target = eventTargetElement(event);
    if (target === null) return;
    const position = buildCursorPosition(event.clientX, event.clientY, target, registry, maxAnchors, win);
    client.updateLocalCursor(position);
  }

  function onDocumentPointerLeave(): void {
    client.updateLocalCursor(null);
  }

  function onWindowBlur(): void {
    client.updateLocalCursor(null);
  }

  doc.addEventListener("pointermove", onPointerEvent);
  doc.addEventListener("pointerdown", onPointerEvent);
  doc.addEventListener("pointerenter", onPointerEvent);
  doc.addEventListener("pointerleave", onDocumentPointerLeave);
  win.addEventListener("blur", onWindowBlur);

  function detach(): void {
    doc.removeEventListener("pointermove", onPointerEvent);
    doc.removeEventListener("pointerdown", onPointerEvent);
    doc.removeEventListener("pointerenter", onPointerEvent);
    doc.removeEventListener("pointerleave", onDocumentPointerLeave);
    win.removeEventListener("blur", onWindowBlur);
  }

  client.registerTeardown(detach);

  return { detach };
}
