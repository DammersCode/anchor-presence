import type { ReactNode } from "react";
import type { Metadata } from "next";
import { RootProvider } from "fumadocs-ui/provider/next";
import { Sora, Inter } from "next/font/google";
import "./global.css";
import { appName, siteUrl } from "@/lib/shared";
import { ReactGrab } from "@/components/react-grab";

const sora = Sora({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-sora" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

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
        {process.env.NODE_ENV === "development" && <ReactGrab />}
      </body>
    </html>
  );
}
