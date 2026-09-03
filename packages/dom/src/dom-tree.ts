// Shared internal tree walk — used by occlusion (§10), registry (§8), and resolver (§10)

/** Walks up one step through ancestors, crossing shadow boundaries via `host`. */
export function parentAcrossShadow(element: Element): Element | null {
  const parent = element.parentElement;
  if (parent !== null) return parent;
  const root = element.getRootNode();
  if (root instanceof ShadowRoot) return root.host;
  return null;
}
