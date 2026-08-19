export type { Rect, ViewportSize } from "./geometry";

export { computeVisibleRect, isPointInRect } from "./occlusion";

export { createAnchorRegistry } from "./registry";
export type { AnchorRegistry } from "./registry";

export { attachPointerSource, DEFAULT_MAX_ANCHORS } from "./pointer";
export type { PointerSourceHandle, PointerSourceOptions } from "./pointer";

export { createGeometryScheduler } from "./scheduler";
export type {
  CafLike,
  ComputeResult,
  GeometryScheduler,
  GeometrySchedulerOptions,
  MutationObserverCtor,
  MutationObserverLike,
  RafLike,
  ResizeObserverCtor,
  ResizeObserverLike,
  SchedulerReadState,
} from "./scheduler";

export { defaultVisibilityPolicy, findResolvableAnchor, isMeasurable, RemoteResolver, resolveGeometry } from "./resolver";
export type {
  ResolutionTier,
  ResolvedCursor,
  ResolverOptions,
  VisibilityPolicy,
} from "./resolver";

export { createDomBinding } from "./binding";
export type { DomBinding, DomBindingOptions } from "./binding";
