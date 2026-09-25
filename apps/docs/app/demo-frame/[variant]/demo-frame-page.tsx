"use client";

import { useSearchParams } from "next/navigation";
import "../../global.css";
import { DemoScene, type DemoVariant } from "@/components/demo/demo-scene";

export function DemoFramePage({ variant }: { variant: DemoVariant }) {
  const params = useSearchParams();
  const channel = params.get("channel") ?? "anchor-presence-demo";
  const name = variant === "wide" ? "alice" : "bob";

  return (
    <div className="bg-fd-background p-2">
      <DemoScene variant={variant} channel={channel} name={name} />
    </div>
  );
}
