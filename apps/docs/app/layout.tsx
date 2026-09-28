import type { ReactNode } from "react";
import type { Metadata } from "next";
import { RootProvider } from "fumadocs-ui/provider/next";
import localFont from "next/font/local";
import "./global.css";
import { appName, siteUrl } from "@/lib/shared";

// Google Fonts intermittently serves extensionless /l/font?kit= URLs that break next/font/google builds (vercel/next.js#99114).
const sora = localFont({ src: "../fonts/sora.woff2", weight: "500 800", variable: "--font-sora" });
const inter = localFont({ src: "../fonts/inter.woff2", weight: "400 600" });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: `${appName} · Live cursors that stay on the element`, template: `%s - ${appName}` },
  description:
    "Anchor Presence is a live-cursor layer for web apps. Show where teammates are looking and clicking, and keep every cursor on the right element, even across different layouts.",
  icons: { icon: "/icon.svg" },
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.className} ${sora.variable}`} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
