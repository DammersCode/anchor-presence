const original = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].startsWith("[anchor-presence]")) return;
  original(...args);
};
