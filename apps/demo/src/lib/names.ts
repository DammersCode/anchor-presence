const NAMES = ["River", "Sage", "Rowan", "Quinn", "Ember", "Ash", "Wren", "Kai"];

export function randomName(): string {
  return NAMES[Math.floor(Math.random() * NAMES.length)]!;
}

/** A random default room so two unrelated visitors never land in the same one by default. */
export function randomRoom(): string {
  return `room-${crypto.randomUUID().slice(0, 8)}`;
}
