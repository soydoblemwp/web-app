/**
 * Independent check-digit implementation (never delegated to the rendering
 * library) for every fixed-length numeric format — EAN-13, EAN-8, UPC-A,
 * ITF-14. All four use the same canonical GS1 GTIN algorithm: starting from
 * the rightmost DATA digit (i.e. excluding the check digit) and moving
 * left, weights alternate 3, 1, 3, 1... Verified against the real published
 * GS1 example "400638133393" → check digit 1 (EAN-13 "4006381333931").
 */
function gs1CheckDigit(dataDigits: string): number {
  let sum = 0;
  let weight = 3;
  for (let i = dataDigits.length - 1; i >= 0; i--) {
    sum += Number(dataDigits[i]) * weight;
    weight = weight === 3 ? 1 : 3;
  }
  return (10 - (sum % 10)) % 10;
}

export interface CheckDigitResult {
  ok: boolean;
  error?: string;
  dataDigits?: string;
  checkDigit?: number;
  fullValue?: string;
}

function validateFixedLengthNumeric(value: string, totalLength: number, label: string): CheckDigitResult {
  if (!/^\d+$/.test(value)) return { ok: false, error: `${label} solo admite dígitos numéricos.` };
  if (value.length === totalLength) {
    const dataDigits = value.slice(0, -1);
    const providedCheck = Number(value[value.length - 1]);
    const realCheck = gs1CheckDigit(dataDigits);
    if (providedCheck !== realCheck) {
      return { ok: false, error: `Dígito de control incorrecto: se esperaba ${realCheck}, se recibió ${providedCheck}.` };
    }
    return { ok: true, dataDigits, checkDigit: realCheck, fullValue: value };
  }
  if (value.length === totalLength - 1) {
    const checkDigit = gs1CheckDigit(value);
    return { ok: true, dataDigits: value, checkDigit, fullValue: value + String(checkDigit) };
  }
  return { ok: false, error: `${label} requiere ${totalLength - 1} dígitos de datos (con dígito de control: ${totalLength}).` };
}

export function validateEan13(value: string): CheckDigitResult {
  return validateFixedLengthNumeric(value, 13, "EAN-13");
}
export function validateEan8(value: string): CheckDigitResult {
  return validateFixedLengthNumeric(value, 8, "EAN-8");
}
export function validateUpcA(value: string): CheckDigitResult {
  return validateFixedLengthNumeric(value, 12, "UPC-A");
}
export function validateItf14(value: string): CheckDigitResult {
  return validateFixedLengthNumeric(value, 14, "ITF-14");
}

export { gs1CheckDigit };
