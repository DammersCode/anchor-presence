// UI context policy (spec §12): hide a remote cursor whose sender is in the settings dialog
// unless the local viewer also has it open. The topbar shows an "in Settings" indicator instead.
import type { VisibilityPolicy } from "@anchor-presence/dom";
import type { DemoContext } from "./setup";

// Mutable flag updated by the app when the local dialog opens/closes; the policy function itself
// stays a plain synchronous callback per the DomBindingOptions contract (no hooks, no store access).
let localSettingsOpen = false;

export function setLocalSettingsOpen(open: boolean): void {
  localSettingsOpen = open;
}

export const settingsAwareVisibilityPolicy: VisibilityPolicy<DemoContext> = ({ presence, resolution }) => {
  if (resolution.tier === "hidden") return "hide";
  if (presence.context?.dialog === "settings" && !localSettingsOpen) return "hide";
  return "show";
};
