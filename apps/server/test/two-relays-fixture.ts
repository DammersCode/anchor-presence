import { createReferenceRelay } from "../index";

const first = createReferenceRelay(0, { maxRoomSockets: 1, authCheck: () => true });
const second = createReferenceRelay(0, { maxRoomSockets: 1, authCheck: () => true });
const capped = createReferenceRelay(0, { maxTotalSockets: 1, authCheck: () => true });

const sockets: WebSocket[] = [];

function open(relay: { url: string }, room: string): Promise<number | "open"> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${relay.url.replace("http", "ws")}/?room=${room}`);
    sockets.push(ws);
    ws.onclose = (event) => resolve(event.code);
    setTimeout(() => resolve("open"), 500);
  });
}

const results = [
  await open(first, "shared"),
  await open(second, "shared"),
  await open(first, "shared"),
  await open(capped, "one"),
  await open(capped, "two"),
];
for (const ws of sockets) ws.close();
void first.close();
void second.close();
void capped.close();
for (const bad of [{ maxRoomSockets: Number.NaN }, { maxTotalSockets: 0 }]) {
  try {
    createReferenceRelay(0, bad);
    process.exit(1);
  } catch (error) {
    if (!(error instanceof TypeError) || !error.message.startsWith("createReferenceRelay:")) process.exit(1);
  }
}
const expected = ["open", "open", 4001, "open", 4002];
process.exit(results.every((result, index) => result === expected[index]) ? 0 : 1);
