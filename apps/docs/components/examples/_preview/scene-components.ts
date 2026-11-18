import type { PresenceClient, PresenceClientOptions } from "@anchor-presence/core";
import type { ComponentType, ReactNode } from "react";
import { BasicsScene } from "../basics";
import { ChatScene } from "../chat";
import { CustomCursorsScene } from "../custom-cursors";
import { DialogsScene } from "../dialogs";
import { EdgeArrowsScene } from "../edge-arrows";
import { FallbacksScene } from "../fallbacks";
import { FollowScene } from "../follow";
import { InterpolationScene } from "../interpolation";
import { KanbanScene } from "../kanban";
import { PresenceScene, presenceTimeouts } from "../presence";
import { ResponsiveGridScene } from "../responsive-grid";
import { ScrollScene } from "../scroll";
import { TableAndCardsScene } from "../table-and-cards";
import type { Layout, SceneName } from "./scenes";
import type { TourUser } from "./tour";

type SceneProps = {
  client: PresenceClient<unknown, TourUser> | null;
  layout: Layout;
  children?: ReactNode;
};

type SceneEntry = {
  Scene: ComponentType<SceneProps>;
  clientOptions?: Pick<PresenceClientOptions, "heartbeatIntervalMs" | "idleAfterMs" | "staleTimeoutMs">;
};

export const SCENE_COMPONENTS: Record<SceneName, SceneEntry> = {
  basics: { Scene: BasicsScene },
  "responsive-grid": { Scene: ResponsiveGridScene },
  "table-and-cards": { Scene: TableAndCardsScene },
  kanban: { Scene: KanbanScene },
  dialogs: { Scene: DialogsScene },
  fallbacks: { Scene: FallbacksScene },
  scroll: { Scene: ScrollScene },
  presence: { Scene: PresenceScene, clientOptions: presenceTimeouts },
  "custom-cursors": { Scene: CustomCursorsScene },
  interpolation: { Scene: InterpolationScene },
  follow: { Scene: FollowScene },
  "edge-arrows": { Scene: EdgeArrowsScene },
  chat: { Scene: ChatScene },
};
