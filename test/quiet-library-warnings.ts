for (const method of ["warn", "error"] as const) {
  const original = console[method].bind(console);
  console[method] = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].startsWith("[anchor-presence]")) return;
    original(...args);
  };
}
