import type { VisibilityPolicy } from "@anchor-presence/dom";
import type { DemoContext } from "./setup";

// module-level flags because the policy must stay a plain synchronous callback
let localSettingsOpen = false;
let localPage: string | null = null;

export function setLocalSettingsOpen(open: boolean): void {
  localSettingsOpen = open;
}

export function setLocalPage(page: string): void {
  localPage = page;
}

export const settingsAwareVisibilityPolicy: VisibilityPolicy<DemoContext> = ({ presence, resolution }) => {
  if (resolution.tier === "hidden") return "hide";
  if (resolution.tier === "anchor" && !resolution.pointVisible) return "hide";
  if (presence.context?.dialog === "settings" && !localSettingsOpen) return "hide";
  // different route: vanish instead of viewport-fallback; the presence pill still shows their page
  const remotePage = presence.context?.page;
  if (remotePage !== undefined && localPage !== null && remotePage !== localPage) return "hide";
  return "show";
};
