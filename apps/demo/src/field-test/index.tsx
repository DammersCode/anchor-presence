import type { ComponentType } from "react";
import { Admin } from "./admin";
import { Article } from "./article";
import { Chat } from "./chat";
import { Dashboard } from "./dashboard";
import { Gallery } from "./gallery";
import { Pricing } from "./pricing";
import { Settings } from "./settings";
import { Shop } from "./shop";
import type { UiProps, Variant } from "./variant";

const uis: Record<string, ComponentType<UiProps>> = {
  dashboard: Dashboard,
  settings: Settings,
  pricing: Pricing,
  article: Article,
  gallery: Gallery,
  chat: Chat,
  shop: Shop,
  admin: Admin,
};

export function FieldTestPage() {
  const params = new URLSearchParams(window.location.search);
  const Ui = uis[params.get("ui") ?? ""];
  const variant: Variant = params.get("variant") === "stable" ? "stable" : "jumpy";
  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      {Ui ? <Ui variant={variant} /> : <p>Unknown ui</p>}
    </main>
  );
}
