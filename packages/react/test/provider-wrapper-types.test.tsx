import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PresenceProvider, type PresenceProviderConfig } from "../src";
import { makeFakeClient } from "./test-utils";

function Wrapper(props: PresenceProviderConfig & { label: string }) {
  const { label, ...providerProps } = props;
  return <PresenceProvider {...providerProps}>{label}</PresenceProvider>;
}

describe("PresenceProviderConfig", () => {
  it("lets a wrapper pass the provider props through", () => {
    const { client } = makeFakeClient();
    expect(renderToString(<Wrapper client={client} label="inside" />)).toContain("inside");
    expect(renderToString(<Wrapper factory={() => client} label="inside" />)).toContain("inside");
  });

  it("keeps the client and factory exclusion", () => {
    const { client } = makeFakeClient();
    // @ts-expect-error client and factory exclude each other
    const both = <Wrapper client={client} factory={() => client} label="x" />;
    expect(both).toBeDefined();
  });
});
