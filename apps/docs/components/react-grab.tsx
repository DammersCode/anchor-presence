"use client";

import { useEffect } from "react";

/** Loads React Grab in development: hover an element, press Ctrl+C / ⌘C, paste the source context into an agent. */
export function ReactGrab() {
  useEffect(() => {
    void import("react-grab");
  }, []);
  return null;
}
