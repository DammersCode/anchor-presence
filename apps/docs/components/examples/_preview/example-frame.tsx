"use client";

import { createPresenceClient } from "@anchor-presence/core";
import { usePresenceClient } from "@anchor-presence/react";
import { useSearchParams } from "next/navigation";
import { createBroadcastChannelTransport } from "@/components/demo/broadcast-transport";
import { ResolutionInsight } from "./resolution-insight";
import { SCENE_COMPONENTS } from "./scene-components";
import { READER, SCENES, type Layout, type SceneName } from "./scenes";
import type { TourUser } from "./tour";
import { useTourControl } from "./use-tour-control";

const NO_TRACKS = [] as const;

// The Next dev overlay badge would sit on top of the scene in every pane.
const FRAME_CSS = "html, body { overflow: hidden; } nextjs-portal { display: none; }";

/** One preview pane: a scene with its own presence client, plus the status bar and outline. */
export function ExampleFrame({ scene, layout }: { scene: SceneName; layout: Layout }) {
  const channel = useSearchParams().get("channel") ?? `anchor-presence-preview-${scene}`;
  const { Scene, clientOptions } = SCENE_COMPONENTS[scene];

  const client = usePresenceClient<unknown, TourUser>({
    key: `${channel}:${layout}`,
    factory: () => {
      const transport = createBroadcastChannelTransport(channel);
      transport.connect();
      return createPresenceClient({ transport, user: READER, ...clientOptions });
    },
  });

  useTourControl(channel, layout === "wide" ? SCENES[scene].tour : NO_TRACKS);

  return (
    <div className="h-dvh bg-fd-card text-fd-foreground select-none">
      <style>{FRAME_CSS}</style>
      <div className="h-[calc(100dvh-2rem)]">
        <Scene client={client} layout={layout}>
          <ResolutionInsight />
        </Scene>
      </div>
    </div>
  );
}
