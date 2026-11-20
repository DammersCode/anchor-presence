import { describe, expect, it } from "vitest";
import { createInMemoryPair, createPresenceClient } from "@dammers/anchor-presence-core";
import type { PresenceMessage } from "@dammers/anchor-presence-core";
import { createDomBinding } from "../src/index";
import type { VisibilityPolicy } from "../src/index";

// visibility-policy.mdx: Writing a custom policy
const hideStaffCursors: VisibilityPolicy<{ role: string }> = ({ presence }) =>
  presence.context?.role === "staff" ? "hide" : "show";

function presenceWith(role: string): PresenceMessage<{ role: string }> {
  return { version: 1, clientId: "a", session: "s", sequence: 0, cursor: null, context: { role } };
}

const resolution = { tier: "anchor" as const, anchorId: "card", pointVisible: true };

describe("extra dom docs samples", () => {
  it("visibility-policy.mdx: hideStaffCursors hides staff and shows everyone else", () => {
    expect(hideStaffCursors({ presence: presenceWith("staff"), resolution })).toBe("hide");
    expect(hideStaffCursors({ presence: presenceWith("guest"), resolution })).toBe("show");
  });

  it("visibility-policy.mdx: a client with the policy's context type accepts the policy", () => {
    const { a: transport } = createInMemoryPair();
    const client = createPresenceClient({
      transport,
      parseContext: (value) => value as { role: string } | undefined,
    });
    const binding = createDomBinding(client, {
      resolution: { visibilityPolicy: hideStaffCursors },
    });
    expect(binding.getSnapshot()).toEqual([]);
    binding.dispose();
    client.dispose();
  });

  it("anchor-registration.mdx: an invalid anchorAttribute throws a TypeError", () => {
    const { a: transport } = createInMemoryPair();
    const client = createPresenceClient({ transport });
    expect(() => createDomBinding(client, { anchorAttribute: "data_anchor" })).toThrow(TypeError);
    expect(() => createDomBinding(client, { anchorAttribute: "1anchor" })).toThrow(TypeError);
    createDomBinding(client, { anchorAttribute: "data-presence-anchor" }).dispose();
    client.dispose();
  });
});
