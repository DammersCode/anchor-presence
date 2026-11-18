// Shared internal tree walk — used by occlusion (§10), registry (§8), and resolver (§10)

/** Walks up one step through ancestors, crossing shadow boundaries via `host`. */
export function parentAcrossShadow(element: Element): Element | null {
  const parent = element.parentElement;
  if (parent !== null) return parent;
  const root = element.getRootNode();
  if (isShadowRoot(root)) return root.host;
  return null;
}

// nodeType instead of instanceof: a node of an iframe belongs to another realm
export function isShadowRoot(node: Node): node is ShadowRoot {
  return node.nodeType === 11 && "host" in node;
}
