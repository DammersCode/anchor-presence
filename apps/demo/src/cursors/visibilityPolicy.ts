import type { VisibilityPolicy } from "@anchor-presence/dom";
import type { DemoContext } from "./setup";

// module-level flag because the policy must stay a plain synchronous callback
let localSettingsOpen = false;

export function setLocalSettingsOpen(open: boolean): void {
  localSettingsOpen = open;
}

export const settingsAwareVisibilityPolicy: VisibilityPolicy<DemoContext> = ({ presence, resolution }) => {
  if (resolution.tier === "hidden") return "hide";
  if (presence.context?.dialog === "settings" && !localSettingsOpen) return "hide";
  return "show";
};
