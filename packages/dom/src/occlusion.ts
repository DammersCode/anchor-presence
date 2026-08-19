import type { Rect } from "./geometry";
import type { SchedulerReadState } from "./scheduler";

export type StyleValues = Pick<CSSStyleDeclaration, "overflow" | "overflowX" | "overflowY">;

function intersect(first: Rect, second: Rect): Rect | null {
  const left = Math.max(first.left, second.left);
  const top = Math.max(first.top, second.top);
  const right = Math.min(first.left + first.width, second.left + second.width);
  const bottom = Math.min(first.top + first.height, second.top + second.height);
  if (right <= left || bottom <= top) return null;
  return { left, top, width: right - left, height: bottom - top };
}

function isElement(value: unknown): value is Element {
  return typeof value === "object" && value !== null && (value as Node).nodeType === 1;
}

function parent(element: Element): Element | null {
  if (element.parentElement !== null) return element.parentElement;
  const host = (element.getRootNode() as { host?: unknown }).host;
  return isElement(host) ? host : null;
}

function clips(style: StyleValues): boolean {
  return ![style.overflow, style.overflowX, style.overflowY].every((value) => value === "" || value === "visible");
}

type ClientBoxElement = Element & {
  clientLeft: number;
  clientTop: number;
  clientWidth: number;
  clientHeight: number;
  offsetWidth: number;
  offsetHeight: number;
};

function isFiniteMetric(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function readClientRect(element: Element, rect: Rect): Rect {
  const metrics = element as ClientBoxElement;
  const { clientHeight, clientLeft, clientTop, clientWidth, offsetHeight, offsetWidth } = metrics;
  if (
    !isFiniteMetric(clientHeight) ||
    !isFiniteMetric(clientLeft) ||
    !isFiniteMetric(clientTop) ||
    !isFiniteMetric(clientWidth) ||
    !isFiniteMetric(offsetHeight) ||
    !isFiniteMetric(offsetWidth) ||
    offsetWidth <= 0 ||
    offsetHeight <= 0
  ) return rect;
  const scaleX = rect.width / offsetWidth;
  const scaleY = rect.height / offsetHeight;
  return {
    left: rect.left + clientLeft * scaleX,
    top: rect.top + clientTop * scaleY,
    width: clientWidth * scaleX,
    height: clientHeight * scaleY,
  };
}

export function computeVisibleRect(
  element: Element,
  rect: Rect,
  readState: SchedulerReadState,
  onClippingAncestor?: (element: Element) => void,
): Rect | null {
  let visible = rect;
  let ancestor = parent(element);
  const documentElement = element.ownerDocument.documentElement;
  while (ancestor !== null && ancestor !== documentElement) {
    if (clips(readState.getStyle(ancestor))) {
      onClippingAncestor?.(ancestor);
      // an unmeasurable ancestor cannot clip: skip it rather than intersecting against a guessed rect
      if (readState.getRect(ancestor) !== undefined) {
        const clipped = intersect(visible, readState.getClientRect(ancestor));
        if (clipped === null) return null;
        visible = clipped;
      }
    }
    ancestor = parent(ancestor);
  }
  return visible;
}

export function isPointInRect(x: number, y: number, rect: Rect | null): boolean {
  if (rect === null) return false;
  return x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height;
}
