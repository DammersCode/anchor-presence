import { DemoFramePage } from "./demo-frame-page";

// Loaded only inside <Demo>'s iframes: each pane needs its own document and window so its
// anchor registry and pointer listener stay isolated from the other pane.
export default async function Page(props: PageProps<"/demo-frame/[variant]">) {
  const params = await props.params;
  const variant = params.variant === "narrow" ? "narrow" : "wide";
  return <DemoFramePage variant={variant} />;
}
