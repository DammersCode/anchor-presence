import { notFound } from "next/navigation";
import { ExampleFrame } from "@/components/examples/_preview/example-frame";
import { isLayout, isSceneName } from "@/components/examples/_preview/scenes";
import { DemoFramePage } from "./demo-frame-page";

// Loaded only inside preview iframes: each pane needs its own document and window so its
// anchor registry and pointer listener stay isolated from the other pane.
export default async function Page(props: PageProps<"/demo-frame/[scene]/[layout]">) {
  const { scene, layout } = await props.params;
  if (!isLayout(layout)) notFound();
  if (scene === "home") return <DemoFramePage variant={layout} />;
  if (!isSceneName(scene)) notFound();
  return <ExampleFrame scene={scene} layout={layout} />;
}
