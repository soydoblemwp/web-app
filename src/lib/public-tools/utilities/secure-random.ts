/**
 * The single source of cryptographic randomness for every security tool in
 * this suite (password generator, UUID v4/v7). Every caller MUST go through
 * this module instead of `Math.random()` — spec section 8 explicitly
 * forbids `Math.random()` for password generation, and the same rule is
 * applied to UUID v4 for consistency (`crypto.randomUUID` isn't used
 * directly so that bit-level construction stays explicit and testable).
 */

function getCrypto(): Crypto {
  if (typeof crypto === "undefined" || typeof crypto.getRandomValues !== "function") {
    throw new Error("Este navegador no soporta crypto.getRandomValues(), necesario para generar valores aleatorios seguros.");
  }
  return crypto;
}

/** Raw cryptographically secure random bytes. */
export function secureRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  getCrypto().getRandomValues(bytes);
  return bytes;
}

/**
 * A uniformly-distributed random integer in [0, exclusiveMax) using
 * rejection sampling — never `value % max`, which biases low values
 * whenever `max` doesn't evenly divide 256 (spec section 8: "utiliza
 * rechazo de valores cuando el tamaño del conjunto no divida exactamente
 * el rango aleatorio").
 */
export function secureRandomInt(exclusiveMax: number): number {
  if (!Number.isInteger(exclusiveMax) || exclusiveMax <= 0) {
    throw new Error("exclusiveMax debe ser un entero positivo.");
  }
  if (exclusiveMax === 1) return 0;
  if (exclusiveMax > 2 ** 32) {
    throw new Error("exclusiveMax es demasiado grande para generar un valor aleatorio seguro.");
  }

  const cryptoObj = getCrypto();
  // Real bug found by its own test: a fixed single-byte draw (range 0-255) made the
  // rejection threshold collapse to 0 -- and the loop spin forever -- for any
  // exclusiveMax > 256 (e.g. the random picker's weighted draw, which scales its bound
  // by 1000). Draw exactly as many bytes as `exclusiveMax` needs so the threshold is
  // always a real, reachable value, however large the bound.
  const bytesNeeded = Math.max(1, Math.ceil(Math.ceil(Math.log2(exclusiveMax)) / 8));
  const range = 256 ** bytesNeeded;
  const rejectionThreshold = range - (range % exclusiveMax);
  const buffer = new Uint8Array(bytesNeeded);

  for (;;) {
    cryptoObj.getRandomValues(buffer);
    let value = 0;
    for (let i = 0; i < bytesNeeded; i++) value = value * 256 + buffer[i];
    if (value < rejectionThreshold) return value % exclusiveMax;
  }
}

/** Picks one element from `items` using unbiased secure randomness. */
export function secureRandomChoice<T>(items: readonly T[]): T {
  if (items.length === 0) throw new Error("No se puede elegir un elemento de una lista vacía.");
  return items[secureRandomInt(items.length)];
}

/**
 * Fisher-Yates shuffle driven by `secureRandomInt` — used so that
 * "guaranteed one character per selected category" placements land in
 * unbiased random positions rather than always at the start of the string.
 */
export function secureShuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
