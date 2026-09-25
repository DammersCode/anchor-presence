import type { Browser, Page, WebSocketRoute } from "@playwright/test";
import { expect } from "@playwright/test";

const BASE_URL = `http://localhost:${process.env.E2E_DEMO_PORT ?? 5917}/`;

export type Viewport = { width: number; height: number };

export type Pair = {
  sender: Page;
  receiver: Page;
  senderName: string;
  receiverName: string;
  room: string;
};

/** Unique room per test so parallel runs never cross-talk over the shared relay. */
export function uniqueRoom(label: string): string {
  return `${label}-${crypto.randomUUID()}`;
}

export type OpenPairOptions = {
  senderViewport: Viewport;
  receiverViewport: Viewport;
  room: string;
  senderName?: string;
  receiverName?: string;
  receiverExtraQuery?: string;
  /** Runs right after the sender's page is created, before it navigates (e.g. to install a WS route). */
  beforeSenderGoto?: (sender: Page) => Promise<void>;
};

export async function openPair(browser: Browser, options: OpenPairOptions): Promise<Pair> {
  const room = options.room;
  const senderName = options.senderName ?? "Sender";
  const receiverName = options.receiverName ?? "Receiver";
  const receiverExtraQuery = options.receiverExtraQuery ? `&${options.receiverExtraQuery}` : "";

  const senderContext = await browser.newContext({ viewport: options.senderViewport });
  const receiverContext = await browser.newContext({ viewport: options.receiverViewport });

  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();

  if (options.beforeSenderGoto) await options.beforeSenderGoto(sender);

  await Promise.all([
    sender.goto(`${BASE_URL}?name=${encodeURIComponent(senderName)}&room=${encodeURIComponent(room)}`),
    receiver.goto(
      `${BASE_URL}?name=${encodeURIComponent(receiverName)}&room=${encodeURIComponent(room)}${receiverExtraQuery}`,
    ),
  ]);

  // Wait for both sides to see each other before driving the cursor.
  await waitForPeer(sender);
  await waitForPeer(receiver);

  return { sender, receiver, senderName, receiverName, room };
}

export type SocketDropController = {
  /** Closes the page's current live WebSocket, as a real network drop would, without reloading the page. */
  dropOnce(): Promise<void>;
};

/**
 * Transparently proxies the page's relay WebSocket (real bytes flow both ways via `connectToServer`)
 * while keeping a handle on the current client-side route, so a test can sever just that one connection
 * and let the page's own transport reconnect through the real backoff path with a fresh socket.
 */
export async function installSocketDropController(page: Page, wsUrlPattern: RegExp): Promise<SocketDropController> {
  let current: WebSocketRoute | null = null;

  await page.routeWebSocket(wsUrlPattern, (ws) => {
    current = ws;
    ws.connectToServer();
    ws.onClose(() => {
      if (current === ws) current = null;
    });
  });

  return {
    async dropOnce() {
      if (current === null) throw new Error("no live WebSocket to drop");
      await current.close();
    },
  };
}

/** Presence pill shows peer count independent of cursor movement, so this works before any mouse.move. */
async function waitForPeer(page: Page): Promise<void> {
  await expect(page.locator('[data-testid="presence-count"]')).toHaveText(/[1-9]\d* online/, {
    timeout: 15_000,
  });
}

/** Locates the DOM element an anchor id was registered on via its data-testid. */
export function anchorLocator(page: Page, anchorId: string) {
  return page.locator(`[data-testid="anchor-${anchorId}"]`);
}

/** Moves the sender's real mouse onto a normalized u/v point inside the given anchor element. */
export async function moveToAnchor(page: Page, anchorId: string, u = 0.5, v = 0.5): Promise<void> {
  const box = await anchorLocator(page, anchorId).boundingBox();
  if (!box) throw new Error(`anchor not found or not visible: ${anchorId}`);
  const x = box.x + box.width * u;
  const y = box.y + box.height * v;
  await page.mouse.move(x, y);
}

export type RemoteCursorPos = { x: number; y: number; visible: boolean; anchorId: string | null };

/** Reads a remote cursor's resolved viewport position from the CursorLayer's translate3d transform. */
export async function getRemoteCursorPos(page: Page, clientName: string): Promise<RemoteCursorPos> {
  const locator = page.locator(`[data-testid="remote-cursor"][data-cursor-name="${clientName}"]`);
  const count = await locator.count();
  if (count === 0) return { x: NaN, y: NaN, visible: false, anchorId: null };

  const el = locator.first();
  const transform = await el.evaluate((node) => (node as HTMLElement).style.transform);
  const anchorId = await el.getAttribute("data-cursor-anchor");
  const match = /translate3d\(([-\d.]+)px,\s*([-\d.]+)px/.exec(transform);
  if (!match) return { x: NaN, y: NaN, visible: false, anchorId: null };
  return { x: Number(match[1]), y: Number(match[2]), visible: true, anchorId: anchorId || null };
}

/** Polls until the remote cursor position stabilizes near (expectedX, expectedY) within tolerance. */
export async function expectRemoteCursorNear(
  page: Page,
  clientName: string,
  expectedX: number,
  expectedY: number,
  tolerance = 3,
): Promise<void> {
  await expect(async () => {
    const pos = await getRemoteCursorPos(page, clientName);
    expect(pos.visible).toBe(true);
    expect(Math.abs(pos.x - expectedX)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(pos.y - expectedY)).toBeLessThanOrEqual(tolerance);
  }).toPass({ timeout: 5_000, intervals: [50, 100, 200] });
}

export async function expectAnchorNear(
  page: Page,
  clientName: string,
  anchorId: string,
  u: number,
  v: number,
  tolerance = 3,
): Promise<void> {
  await expect(async () => {
    const box = await anchorLocator(page, anchorId).boundingBox();
    if (!box) throw new Error(`anchor not found or not visible: ${anchorId}`);
    const expectedX = box.x + box.width * u;
    const expectedY = box.y + box.height * v;
    const pos = await getRemoteCursorPos(page, clientName);
    expect(pos.visible).toBe(true);
    expect(Math.abs(pos.x - expectedX)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(pos.y - expectedY)).toBeLessThanOrEqual(tolerance);
  }).toPass({ timeout: 5_000, intervals: [50, 100, 200] });
}
