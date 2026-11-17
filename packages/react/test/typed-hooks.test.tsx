import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { createPresenceHooks } from "../src/typed-hooks";
import { makeFakeBinding, makeFakeClient } from "./test-utils";

type TestUser = { name: string };
type TestContext = { route: string };

const { LiveCursorProvider, useRemoteUsers, useCursorClient } = createPresenceHooks<TestContext, TestUser>();

describe("createPresenceHooks", () => {
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    container?.remove();
    container = null;
  });

  it("types users and the client without a generic or a cast", () => {
    const { client } = makeFakeClient<TestContext, TestUser>();
    let names = "";
    function Probe() {
      const users = useRemoteUsers();
      const typedClient = useCursorClient();
      // @ts-expect-error a wrong user shape must not compile
      const wrong: string = users[0]?.user?.age;
      names = `${users.map((u) => u.user?.name ?? "").join(",")}${wrong ?? ""}${typedClient === null ? "" : "!"}`;
      return null;
    }
    container = document.createElement("div");
    document.body.append(container);
    act(() => {
      createRoot(container!).render(
        <LiveCursorProvider client={client} binding={makeFakeBinding<TestContext, TestUser>().binding}>
          <Probe />
        </LiveCursorProvider>,
      );
    });
    expect(names).toBe("!");
  });
});
