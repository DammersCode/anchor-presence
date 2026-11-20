import type { VisibilityPolicy } from "@dammers/anchor-presence-dom";
import type { DemoContext } from "./setup";

export type LocalViewState = {
  page: string | null;
  settingsOpen: boolean;
};

/** The policy must stay a plain synchronous callback, so it reads local state through a getter. */
export function createVisibilityPolicy(getLocalState: () => LocalViewState): VisibilityPolicy<DemoContext> {
  return ({ presence, resolution }) => {
    if (resolution.tier === "hidden") return "hide";
    if (resolution.tier === "anchor" && !resolution.pointVisible) return "hide";
    const { page: localPage, settingsOpen } = getLocalState();
    if (presence.context?.dialog === "settings" && !settingsOpen) return "hide";
    // Local dialog open: a cursor outside it belongs to the covered layer.
    if (settingsOpen && !resolution.anchorId?.startsWith("settings.dialog")) return "hide";
    // different route: vanish instead of viewport-fallback; the presence pill still shows their page
    const remotePage = presence.context?.page;
    if (remotePage !== undefined && localPage !== null && remotePage !== localPage) return "hide";
    return "show";
  };
}
