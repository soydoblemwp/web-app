/**
 * A small, local, deliberately non-exhaustive list of extremely common
 * passwords/words used only as a weak-pattern signal for the strength
 * analyzer. This is NOT a breach-database lookup (spec section 10 forbids
 * that in this phase) — it is a static, offline heuristic list.
 */
export const COMMON_PASSWORDS: readonly string[] = [
  "password", "123456", "123456789", "12345678", "12345", "qwerty", "abc123",
  "111111", "123123", "1234567", "iloveyou", "admin", "welcome", "monkey",
  "login", "princess", "dragon", "letmein", "football", "sunshine",
  "master", "hello", "freedom", "whatever", "trustno1", "shadow",
  "contraseña", "contrasena", "clave", "usuario", "administrador",
  "password1", "qwerty123", "1q2w3e4r", "000000", "1234", "passw0rd",
];

export const SPANISH_MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
  "septiembre", "octubre", "noviembre", "diciembre",
];

export const ENGLISH_MONTHS = [
  "january", "february", "march", "april", "may", "june", "july", "august",
  "september", "october", "november", "december",
];

/** Rows of a standard QWERTY keyboard, used to detect adjacent-key runs (e.g. "qwerty", "asdfgh"). */
export const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890"];
