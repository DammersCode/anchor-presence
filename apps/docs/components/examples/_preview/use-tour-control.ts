import { useEffect } from "react";
import { openControlChannel, readControlMessage, RESUME_AFTER_MS, type ControlMessage } from "./control";
import { startTour, type TourTrack } from "./tour";

const INPUT_EVENTS = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"] as const;
const INPUT_THROTTLE_MS = 200;

/** Reports reader input from this pane, and runs the tour when `tracks` is not empty. */
export function useTourControl(channel: string, tracks: readonly TourTrack[]): void {
  useEffect(() => {
    // BroadcastChannel never delivers to the posting object, so this pane talks to itself through a second one.
    const inbox = openControlChannel(channel);
    const outbox = openControlChannel(channel);
    const post = (message: ControlMessage) => outbox.postMessage(message);

    let lastInputAt = Number.NEGATIVE_INFINITY;
    const onInput = () => {
      const now = performance.now();
      if (now - lastInputAt < INPUT_THROTTLE_MS) return;
      lastInputAt = now;
      post({ kind: "input" });
    };
    for (const type of INPUT_EVENTS) window.addEventListener(type, onInput, { passive: true });
    const removeInputListeners = () => {
      for (const type of INPUT_EVENTS) window.removeEventListener(type, onInput);
    };

    if (tracks.length === 0) {
      return () => {
        removeInputListeners();
        inbox.close();
        outbox.close();
      };
    }

    const tour = startTour({
      channel,
      tracks,
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      onChange: (state) => post({ kind: "tour", state }),
    });

    let resumeTimer: ReturnType<typeof setTimeout> | undefined;
    inbox.addEventListener("message", (event: MessageEvent<unknown>) => {
      const message = readControlMessage(event);
      switch (message?.kind) {
        case "input":
          tour.pause("input");
          clearTimeout(resumeTimer);
          resumeTimer = setTimeout(() => tour.resume("input"), RESUME_AFTER_MS);
          break;
        case "visible":
          if (message.visible) tour.resume("offscreen");
          else tour.pause("offscreen");
          break;
        case "toggle":
          if (tour.isPaused("user")) {
            tour.resume("user");
            clearTimeout(resumeTimer);
            tour.resume("input");
          } else {
            tour.pause("user");
          }
          break;
        default:
          break;
      }
    });

    const onVisibility = () => {
      if (document.visibilityState === "hidden") tour.pause("hidden");
      else tour.resume("hidden");
    };
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();

    post({ kind: "hello" });
    post({ kind: "tour", state: tour.state() });

    return () => {
      clearTimeout(resumeTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      removeInputListeners();
      tour.dispose();
      inbox.close();
      outbox.close();
    };
  }, [channel, tracks]);
}
