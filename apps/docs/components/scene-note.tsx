import { Callout } from "fumadocs-ui/components/callout";

export function SceneNote() {
  return (
    <Callout type="warn">
      The scene takes <code>client</code>, <code>layout</code>, and <code>children</code> from the preview. In
      your app, create the client through the provider&apos;s <code>factory</code> with a real transport, and
      render your own status bar as <code>children</code>. The scene also uses docs theme classes such as{" "}
      <code>bg-fd-secondary</code>, <code>text-fd-muted-foreground</code>, and <code>bg-gradient-brand</code>.
      Replace them with your own styles.
    </Callout>
  );
}
