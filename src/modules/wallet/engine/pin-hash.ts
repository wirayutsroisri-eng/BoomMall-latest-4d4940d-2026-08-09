/**
 * Wallet PIN hashing — Preview/Test (portable, no Node crypto dependency).
 * Production: Argon2id / scrypt via Secret Manager. Never store plain PIN.
 */

const ITERATIONS = 12_000;

function xorshift32(seed: number) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return x >>> 0;
  };
}

function mixHex(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i += 1) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c + i), 0x811c9dc5) >>> 0;
  }
  const rnd = xorshift32(h1 ^ h2);
  const parts: string[] = [];
  for (let i = 0; i < 8; i += 1) {
    parts.push((rnd() ^ h1 ^ (h2 + i)).toString(16).padStart(8, '0'));
  }
  return parts.join('');
}

export function generatePinSalt(): string {
  const rnd = xorshift32((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
  return Array.from({ length: 8 }, () => rnd().toString(16).padStart(8, '0')).join('');
}

export function hashWalletPin(pin: string, salt: string): string {
  if (!/^\d{6}$/.test(pin)) {
    throw new Error('WALLET_PIN_MUST_BE_6_DIGITS');
  }
  let digest = `${pin}:${salt}:boommall-wallet-pin-v1`;
  for (let i = 0; i < ITERATIONS; i += 1) {
    digest = mixHex(`${digest}:${i}`);
  }
  return digest;
}

export function verifyWalletPin(pin: string, salt: string, expectedHash: string): boolean {
  try {
    const actual = hashWalletPin(pin, salt);
    if (actual.length !== expectedHash.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i += 1) {
      diff |= actual.charCodeAt(i) ^ expectedHash.charCodeAt(i);
    }
    return diff === 0;
  } catch {
    return false;
  }
}

/** Progressive delay ms after N failures. */
export function pinLockDelayMs(failCount: number): number {
  if (failCount < 3) return 0;
  if (failCount < 5) return 5_000;
  if (failCount < 8) return 30_000;
  return 15 * 60_000;
}
