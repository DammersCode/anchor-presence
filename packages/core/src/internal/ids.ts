type CryptoLike = { getRandomValues?: (array: Uint8Array) => Uint8Array };

/**
 * Returns a new random ID for `clientId` and `session`.
 * It has 72 random bits in 12 URL-safe characters, short because every message carries two IDs.
 */
export function defaultIdFactory(): string {
  const cryptoObj = (globalThis as { crypto?: CryptoLike }).crypto;
  if (typeof cryptoObj?.getRandomValues === "function") {
    const bytes = cryptoObj.getRandomValues(new Uint8Array(9));
    return btoa(String.fromCodePoint(...bytes))
      .replaceAll("+", "-")
      .replaceAll("/", "_");
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
