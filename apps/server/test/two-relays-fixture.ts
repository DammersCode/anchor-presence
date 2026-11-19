import { createReferenceRelay } from "../index";

const first = createReferenceRelay(0, { maxRoomSockets: 1, authCheck: () => true });
const second = createReferenceRelay(0, { maxRoomSockets: 1, authCheck: () => true });

function open(relay: { url: string }): Promise<number | "open"> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${relay.url.replace("http", "ws")}/?room=shared`);
    ws.onclose = (event) => resolve(event.code);
    setTimeout(() => resolve("open"), 500);
  });
}

const results = [await open(first), await open(second)];
await Promise.all([first.close(), second.close()]);
process.exit(results.every((result) => result === "open") ? 0 : 1);
