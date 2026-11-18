import { Callout } from "fumadocs-ui/components/callout";

export function SceneNote() {
  return (
    <Callout type="warn">
      The scene takes `client`, `layout`, and `children` from the preview. In your app, create the client
      through the provider&apos;s `factory` with a real transport, and render your own status bar as
      `children`. The scene also uses docs theme classes such as `bg-fd-secondary`,
      `text-fd-muted-foreground`, and `bg-gradient-brand`. Replace them with your own styles.
    </Callout>
  );
}
