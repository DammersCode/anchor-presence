"use client";

import { useEffect, useState } from "react";
import { createPresenceClient } from "@dammers/anchor-presence-core";
import type { PresenceClient, PresenceClientOptions } from "@dammers/anchor-presence-core";
import { useSearchParams } from "next/navigation";
import { createBroadcastChannelTransport } from "@dammers/anchor-presence-dom";
import { ResolutionInsight } from "./resolution-insight";
import { SCENE_COMPONENTS } from "./scene-components";
import { READER, SCENES, type Layout, type SceneName } from "./scenes";
import { parseTourContext, parseTourUser, type TourContext, type TourUser } from "./tour";
import { useTourControl } from "./use-tour-control";

const NO_TRACKS = [] as const;

// The Next dev overlay badge would sit on top of the scene in every pane.
const FRAME_CSS = "html, body { overflow: hidden; } nextjs-portal { display: none; }";

// One client per preview pane: the broadcast channel is the preview's transport.
function usePreviewClient(
  channel: string,
  clientOptions:
    Pick<PresenceClientOptions, "heartbeatIntervalMs" | "idleAfterMs" | "staleTimeoutMs"> | undefined,
): PresenceClient<TourContext, TourUser> | null {
  const [client, setClient] = useState<PresenceClient<TourContext, TourUser> | null>(null);

  useEffect(() => {
    const transport = createBroadcastChannelTransport(channel);
    transport.connect();
    const created = createPresenceClient({
      transport,
      user: READER,
      parseUser: parseTourUser,
      parseContext: parseTourContext,
      ...clientOptions,
    });
    setClient(created);
    return () => {
      created.dispose();
      setClient(null);
    };
  }, [channel, clientOptions]);

  return client;
}

/** One preview pane: a scene with its own presence client, plus the status bar and outline. */
export function ExampleFrame({ scene, layout }: { scene: SceneName; layout: Layout }) {
  const channel = useSearchParams().get("channel") ?? `anchor-presence-preview-${scene}`;
  const { Scene, clientOptions } = SCENE_COMPONENTS[scene];

  const client = usePreviewClient(channel, clientOptions);

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
