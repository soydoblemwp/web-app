import { secureRandomChoice, secureRandomInt, secureShuffle } from "./secure-random";
import { UTILITY_LIMITS } from "./limits";

export type PasswordCategory = "uppercase" | "lowercase" | "numbers" | "symbols";

const CATEGORY_CHARS: Record<PasswordCategory, string> = {
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  numbers: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.<>?/",
};

// Characters that are easy to confuse visually (0/O, 1/l/I, etc.).
const AMBIGUOUS_CHARS = new Set("0OoIl1|`'\"".split(""));

const VOWELS = "aeiou";
const CONSONANTS = "bcdfghjklmnpqrstvwxyz";

export interface PasswordGeneratorOptions {
  length: number;
  categories: PasswordCategory[];
  excludeAmbiguous: boolean;
  avoidConsecutiveRepeats: boolean;
  customSymbols: string | null;
  count: number;
  pronounceable: boolean;
}

export interface GeneratedPassword {
  value: string;
  categoriesUsed: PasswordCategory[];
  length: number;
}

export interface PasswordGeneratorResult {
  ok: boolean;
  error?: string;
  passwords: GeneratedPassword[];
}

function buildCharPool(options: PasswordGeneratorOptions): { pool: string; perCategory: Record<PasswordCategory, string> } {
  const perCategory: Partial<Record<PasswordCategory, string>> = {};
  let pool = "";
  for (const category of options.categories) {
    let chars = category === "symbols" && options.customSymbols ? options.customSymbols : CATEGORY_CHARS[category];
    if (options.excludeAmbiguous) {
      chars = Array.from(chars)
        .filter((c) => !AMBIGUOUS_CHARS.has(c))
        .join("");
    }
    // De-duplicate while preserving order (custom symbols may repeat characters).
    chars = Array.from(new Set(chars.split(""))).join("");
    perCategory[category] = chars;
    pool += chars;
  }
  return { pool, perCategory: perCategory as Record<PasswordCategory, string> };
}

/**
 * Generates one random-mode password. Guarantees at least one character
 * from every selected category (when length allows), using unbiased
 * rejection-sampled randomness for every character (spec section 8: "evita
 * sesgo por módulo... garantiza que cada categoría aparezca al menos una
 * vez").
 *
 * The guaranteed-category characters are assigned to random positions
 * FIRST (via an unbiased Fisher-Yates shuffle of the index list), and the
 * remaining "filler" positions are then filled left-to-right, each one
 * checked against BOTH its already-decided neighbors (the previous
 * position, and the next position when it happens to already hold a
 * guaranteed character). Filling positions in one left-to-right pass this
 * way — rather than generating a flat sequence and shuffling it afterward
 * — means "avoid consecutive repeats" never needs a separate repair step:
 * it can't be violated by a later shuffle, because there is no later
 * shuffle.
 */
function generateOneRandom(options: PasswordGeneratorOptions, pool: string, perCategory: Record<PasswordCategory, string>): string {
  const length = options.length;
  const slots: (string | null)[] = new Array(length).fill(null);

  const guaranteedChars = options.categories
    .map((category) => perCategory[category])
    .filter((chars) => chars.length > 0)
    .map((chars) => secureRandomChoice(chars.split("")));

  const positions = secureShuffle(Array.from({ length }, (_, i) => i)).slice(0, guaranteedChars.length);
  positions.forEach((position, index) => {
    slots[position] = guaranteedChars[index];
  });

  const poolChars = pool.split("");
  for (let i = 0; i < length; i++) {
    if (slots[i] !== null) continue;
    const leftNeighbor = i > 0 ? slots[i - 1] : null;
    const rightNeighbor = i + 1 < length ? slots[i + 1] : null; // only set here if it's an already-placed guaranteed char

    const maxAttempts = 200;
    let chosen: string | null = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidate = secureRandomChoice(poolChars);
      const conflictsLeft = options.avoidConsecutiveRepeats && leftNeighbor !== null && candidate === leftNeighbor;
      const conflictsRight = options.avoidConsecutiveRepeats && rightNeighbor !== null && candidate === rightNeighbor;
      if (!conflictsLeft && !conflictsRight) {
        chosen = candidate;
        break;
      }
    }
    // Pool too small/homogeneous to avoid a repeat here — accept the last drawn candidate rather than looping forever.
    slots[i] = chosen ?? secureRandomChoice(poolChars);
  }

  return slots.join("");
}

/**
 * Pronounceable mode: alternates consonant/vowel syllables, still drawn
 * exclusively from `crypto.getRandomValues` via secureRandomChoice — never
 * a weaker RNG. Documented honestly as lower entropy than random mode
 * (roughly log2(21) ≈ 4.4 bits per consonant, log2(5) ≈ 2.3 bits per vowel,
 * vs. ~6.5 bits/char for a full random pool) — the caller surfaces this
 * caveat in the UI rather than presenting it as equally strong.
 */
function generateOnePronounceable(length: number, includeNumbers: boolean): string {
  const chars: string[] = [];
  let useConsonant = true;
  while (chars.length < length) {
    if (includeNumbers && chars.length > 0 && chars.length % 5 === 0 && secureRandomInt(3) === 0) {
      chars.push(secureRandomChoice("0123456789".split("")));
      continue;
    }
    chars.push(secureRandomChoice((useConsonant ? CONSONANTS : VOWELS).split("")));
    useConsonant = !useConsonant;
  }
  return chars.slice(0, length).join("");
}

function detectCategoriesUsed(value: string): PasswordCategory[] {
  const used: PasswordCategory[] = [];
  if (/[A-Z]/.test(value)) used.push("uppercase");
  if (/[a-z]/.test(value)) used.push("lowercase");
  if (/[0-9]/.test(value)) used.push("numbers");
  if (/[^A-Za-z0-9]/.test(value)) used.push("symbols");
  return used;
}

export function generatePasswords(options: PasswordGeneratorOptions): PasswordGeneratorResult {
  const { minLength, maxLength, maxCount } = UTILITY_LIMITS.password;

  if (!Number.isInteger(options.length) || options.length < minLength || options.length > maxLength) {
    return { ok: false, error: `La longitud debe estar entre ${minLength} y ${maxLength} caracteres.`, passwords: [] };
  }
  if (!Number.isInteger(options.count) || options.count < 1 || options.count > maxCount) {
    return { ok: false, error: `La cantidad debe estar entre 1 y ${maxCount} contraseñas.`, passwords: [] };
  }

  if (options.pronounceable) {
    const passwords: GeneratedPassword[] = [];
    for (let i = 0; i < options.count; i++) {
      const value = generateOnePronounceable(options.length, options.categories.includes("numbers"));
      passwords.push({ value, categoriesUsed: detectCategoriesUsed(value), length: value.length });
    }
    return { ok: true, passwords };
  }

  if (options.categories.length === 0) {
    return { ok: false, error: "Selecciona al menos una categoría de caracteres.", passwords: [] };
  }

  const { pool, perCategory } = buildCharPool(options);
  if (pool.length === 0) {
    return { ok: false, error: "Las opciones elegidas no dejan ningún carácter disponible (revisa símbolos personalizados o exclusión de ambiguos).", passwords: [] };
  }
  if (options.categories.length > options.length) {
    return { ok: false, error: "La longitud es menor que la cantidad de categorías seleccionadas; no se puede garantizar una de cada.", passwords: [] };
  }

  const passwords: GeneratedPassword[] = [];
  for (let i = 0; i < options.count; i++) {
    const value = generateOneRandom(options, pool, perCategory);
    passwords.push({ value, categoriesUsed: detectCategoriesUsed(value), length: value.length });
  }
  return { ok: true, passwords };
}

export function passwordsToText(passwords: GeneratedPassword[]): string {
  return passwords.map((p) => p.value).join("\n");
}
