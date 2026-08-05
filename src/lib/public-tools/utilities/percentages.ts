export type PercentageMode =
  | "percent-of"
  | "what-percent"
  | "increase"
  | "decrease"
  | "change"
  | "add-percent"
  | "subtract-percent"
  | "discount"
  | "margin"
  | "markup";

export interface PercentageResult {
  ok: boolean;
  error?: string;
  result?: number;
  formula: string;
  substitution: string;
  extra?: Record<string, number>;
}

function validateNumber(value: number, label: string): string | null {
  if (Number.isNaN(value)) return `${label} no es un número válido.`;
  if (!Number.isFinite(value)) return `${label} no puede ser infinito.`;
  return null;
}

/**
 * Every mode returns both the general formula and the specific substitution
 * with the caller's own numbers (spec section 19: "mostrar sustitución").
 * Never rounds intermediate values — only the final displayed result is
 * ever rounded, and that rounding happens in the UI layer, not here.
 */
export function calculatePercentage(mode: PercentageMode, a: number, b: number): PercentageResult {
  const errA = validateNumber(a, "El primer valor");
  if (errA) return { ok: false, error: errA, formula: "", substitution: "" };
  const errB = validateNumber(b, "El segundo valor");
  if (errB) return { ok: false, error: errB, formula: "", substitution: "" };

  switch (mode) {
    case "percent-of": {
      // ¿Cuánto es X% de Y?  a = X (percent), b = Y
      const result = (a / 100) * b;
      return { ok: true, result, formula: "resultado = (X ÷ 100) × Y", substitution: `(${a} ÷ 100) × ${b} = ${result}` };
    }
    case "what-percent": {
      // X es qué % de Y  a = X, b = Y
      if (b === 0) return { ok: false, error: "No se puede dividir por cero (Y = 0).", formula: "", substitution: "" };
      const result = (a / b) * 100;
      return { ok: true, result, formula: "resultado = (X ÷ Y) × 100", substitution: `(${a} ÷ ${b}) × 100 = ${result}` };
    }
    case "increase": {
      // aumento porcentual de a a b
      if (a === 0) return { ok: false, error: "No se puede calcular un aumento porcentual desde un valor inicial de 0.", formula: "", substitution: "" };
      const result = ((b - a) / a) * 100;
      return { ok: true, result, formula: "aumento % = ((final − inicial) ÷ inicial) × 100", substitution: `((${b} − ${a}) ÷ ${a}) × 100 = ${result}` };
    }
    case "decrease": {
      if (a === 0) return { ok: false, error: "No se puede calcular una disminución porcentual desde un valor inicial de 0.", formula: "", substitution: "" };
      const result = ((a - b) / a) * 100;
      return { ok: true, result, formula: "disminución % = ((inicial − final) ÷ inicial) × 100", substitution: `((${a} − ${b}) ÷ ${a}) × 100 = ${result}` };
    }
    case "change": {
      // cambio porcentual firmado entre dos valores
      if (a === 0) return { ok: false, error: "No se puede calcular un cambio porcentual desde un valor inicial de 0.", formula: "", substitution: "" };
      const result = ((b - a) / Math.abs(a)) * 100;
      return { ok: true, result, formula: "cambio % = ((nuevo − anterior) ÷ |anterior|) × 100", substitution: `((${b} − ${a}) ÷ |${a}|) × 100 = ${result}` };
    }
    case "add-percent": {
      // a = valor base, b = porcentaje a añadir
      const result = a * (1 + b / 100);
      return { ok: true, result, formula: "resultado = base × (1 + P ÷ 100)", substitution: `${a} × (1 + ${b} ÷ 100) = ${result}` };
    }
    case "subtract-percent": {
      const result = a * (1 - b / 100);
      return { ok: true, result, formula: "resultado = base × (1 − P ÷ 100)", substitution: `${a} × (1 − ${b} ÷ 100) = ${result}` };
    }
    case "discount": {
      // a = precio original, b = % de descuento
      const finalPrice = a * (1 - b / 100);
      const savings = a - finalPrice;
      return {
        ok: true,
        result: finalPrice,
        formula: "precio final = precio × (1 − descuento ÷ 100)",
        substitution: `${a} × (1 − ${b} ÷ 100) = ${finalPrice}`,
        extra: { savings },
      };
    }
    case "margin": {
      // margen = (precio - costo) / precio × 100.  a = precio, b = costo
      if (a === 0) return { ok: false, error: "No se puede calcular el margen con un precio de venta de 0.", formula: "", substitution: "" };
      const result = ((a - b) / a) * 100;
      return { ok: true, result, formula: "margen % = ((precio − costo) ÷ precio) × 100", substitution: `((${a} − ${b}) ÷ ${a}) × 100 = ${result}` };
    }
    case "markup": {
      // markup = (precio - costo) / costo × 100. a = precio, b = costo
      if (b === 0) return { ok: false, error: "No se puede calcular el markup con un costo de 0.", formula: "", substitution: "" };
      const result = ((a - b) / b) * 100;
      return { ok: true, result, formula: "markup % = ((precio − costo) ÷ costo) × 100", substitution: `((${a} − ${b}) ÷ ${b}) × 100 = ${result}` };
    }
    default:
      return { ok: false, error: "Modo desconocido.", formula: "", substitution: "" };
  }
}
