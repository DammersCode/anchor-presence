const NAMES = ["River", "Sage", "Rowan", "Quinn", "Ember", "Ash", "Wren", "Kai"];

export function randomName(): string {
  return NAMES[Math.floor(Math.random() * NAMES.length)]!;
}
