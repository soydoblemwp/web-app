export type UnitCategoryId =
  | "longitud"
  | "masa"
  | "temperatura"
  | "volumen"
  | "area"
  | "velocidad"
  | "tiempo"
  | "almacenamiento"
  | "presion"
  | "energia"
  | "potencia";

export interface UnitDefinition {
  id: string;
  label: string;
  /** Multiply a value in this unit by `toBase` to get the category's base unit. Unused (null) for temperature, which needs an offset, not a pure factor. */
  toBase: number | null;
}

export interface UnitCategoryDefinition {
  id: UnitCategoryId;
  label: string;
  baseUnitLabel: string;
  units: UnitDefinition[];
  allowsNegative: boolean;
}

/**
 * Single source of factors for every linear (non-temperature) category —
 * the UI never hardcodes a conversion formula itself (spec section 18: "no
 * copies fórmulas en la interfaz").
 */
export const UNIT_CATEGORIES: UnitCategoryDefinition[] = [
  {
    id: "longitud",
    label: "Longitud",
    baseUnitLabel: "metro",
    allowsNegative: false,
    units: [
      { id: "mm", label: "Milímetros (mm)", toBase: 0.001 },
      { id: "cm", label: "Centímetros (cm)", toBase: 0.01 },
      { id: "m", label: "Metros (m)", toBase: 1 },
      { id: "km", label: "Kilómetros (km)", toBase: 1000 },
      { id: "in", label: "Pulgadas (in)", toBase: 0.0254 },
      { id: "ft", label: "Pies (ft)", toBase: 0.3048 },
      { id: "yd", label: "Yardas (yd)", toBase: 0.9144 },
      { id: "mi", label: "Millas (mi)", toBase: 1609.344 },
    ],
  },
  {
    id: "masa",
    label: "Masa",
    baseUnitLabel: "kilogramo",
    allowsNegative: false,
    units: [
      { id: "mg", label: "Miligramos (mg)", toBase: 0.000001 },
      { id: "g", label: "Gramos (g)", toBase: 0.001 },
      { id: "kg", label: "Kilogramos (kg)", toBase: 1 },
      { id: "t", label: "Toneladas métricas (t)", toBase: 1000 },
      { id: "oz", label: "Onzas (oz)", toBase: 0.028349523125 },
      { id: "lb", label: "Libras (lb)", toBase: 0.45359237 },
    ],
  },
  {
    id: "temperatura",
    label: "Temperatura",
    baseUnitLabel: "kelvin",
    allowsNegative: true,
    units: [
      { id: "c", label: "Celsius (°C)", toBase: null },
      { id: "f", label: "Fahrenheit (°F)", toBase: null },
      { id: "k", label: "Kelvin (K)", toBase: null },
    ],
  },
  {
    id: "volumen",
    label: "Volumen",
    baseUnitLabel: "litro",
    allowsNegative: false,
    units: [
      { id: "ml", label: "Mililitros (ml)", toBase: 0.001 },
      { id: "l", label: "Litros (l)", toBase: 1 },
      { id: "m3", label: "Metros cúbicos (m³)", toBase: 1000 },
      { id: "gal-us", label: "Galones US (gal)", toBase: 3.785411784 },
      { id: "gal-uk", label: "Galones UK (gal)", toBase: 4.54609 },
      { id: "cup", label: "Tazas US (cup)", toBase: 0.2365882365 },
    ],
  },
  {
    id: "area",
    label: "Área",
    baseUnitLabel: "metro cuadrado",
    allowsNegative: false,
    units: [
      { id: "mm2", label: "Milímetros cuadrados (mm²)", toBase: 0.000001 },
      { id: "cm2", label: "Centímetros cuadrados (cm²)", toBase: 0.0001 },
      { id: "m2", label: "Metros cuadrados (m²)", toBase: 1 },
      { id: "km2", label: "Kilómetros cuadrados (km²)", toBase: 1000000 },
      { id: "ha", label: "Hectáreas (ha)", toBase: 10000 },
      { id: "acre", label: "Acres", toBase: 4046.8564224 },
      { id: "ft2", label: "Pies cuadrados (ft²)", toBase: 0.09290304 },
      { id: "mi2", label: "Millas cuadradas (mi²)", toBase: 2589988.110336 },
    ],
  },
  {
    id: "velocidad",
    label: "Velocidad",
    baseUnitLabel: "metro por segundo",
    allowsNegative: false,
    units: [
      { id: "mps", label: "Metros/segundo (m/s)", toBase: 1 },
      { id: "kmh", label: "Kilómetros/hora (km/h)", toBase: 1 / 3.6 },
      { id: "mph", label: "Millas/hora (mph)", toBase: 0.44704 },
      { id: "knot", label: "Nudos (kn)", toBase: 0.5144444444444445 },
      { id: "fts", label: "Pies/segundo (ft/s)", toBase: 0.3048 },
    ],
  },
  {
    id: "tiempo",
    label: "Tiempo",
    baseUnitLabel: "segundo",
    allowsNegative: false,
    units: [
      { id: "ms", label: "Milisegundos", toBase: 0.001 },
      { id: "s", label: "Segundos", toBase: 1 },
      { id: "min", label: "Minutos", toBase: 60 },
      { id: "h", label: "Horas", toBase: 3600 },
      { id: "day", label: "Días", toBase: 86400 },
      { id: "week", label: "Semanas", toBase: 604800 },
      { id: "month", label: "Meses (promedio, 30.44 días)", toBase: 2629800 },
      { id: "year", label: "Años (promedio, 365.25 días)", toBase: 31557600 },
    ],
  },
  {
    id: "almacenamiento",
    label: "Almacenamiento digital",
    baseUnitLabel: "byte",
    allowsNegative: false,
    units: [
      { id: "b", label: "Bytes (B)", toBase: 1 },
      { id: "kb", label: "Kilobytes decimales (KB = 1000 B)", toBase: 1000 },
      { id: "mb", label: "Megabytes decimales (MB = 1000² B)", toBase: 1000 ** 2 },
      { id: "gb", label: "Gigabytes decimales (GB = 1000³ B)", toBase: 1000 ** 3 },
      { id: "tb", label: "Terabytes decimales (TB = 1000⁴ B)", toBase: 1000 ** 4 },
      { id: "kib", label: "Kibibytes binarios (KiB = 1024 B)", toBase: 1024 },
      { id: "mib", label: "Mebibytes binarios (MiB = 1024² B)", toBase: 1024 ** 2 },
      { id: "gib", label: "Gibibytes binarios (GiB = 1024³ B)", toBase: 1024 ** 3 },
      { id: "tib", label: "Tebibytes binarios (TiB = 1024⁴ B)", toBase: 1024 ** 4 },
    ],
  },
  {
    id: "presion",
    label: "Presión",
    baseUnitLabel: "pascal",
    allowsNegative: false,
    units: [
      { id: "pa", label: "Pascales (Pa)", toBase: 1 },
      { id: "kpa", label: "Kilopascales (kPa)", toBase: 1000 },
      { id: "bar", label: "Bar", toBase: 100000 },
      { id: "atm", label: "Atmósferas (atm)", toBase: 101325 },
      { id: "psi", label: "Libras por pulgada cuadrada (psi)", toBase: 6894.757293168361 },
      { id: "mmhg", label: "Milímetros de mercurio (mmHg)", toBase: 133.322387415 },
    ],
  },
  {
    id: "energia",
    label: "Energía",
    baseUnitLabel: "julio",
    allowsNegative: false,
    units: [
      { id: "j", label: "Julios (J)", toBase: 1 },
      { id: "kj", label: "Kilojulios (kJ)", toBase: 1000 },
      { id: "cal", label: "Calorías (cal)", toBase: 4.184 },
      { id: "kcal", label: "Kilocalorías (kcal)", toBase: 4184 },
      { id: "wh", label: "Vatios-hora (Wh)", toBase: 3600 },
      { id: "kwh", label: "Kilovatios-hora (kWh)", toBase: 3600000 },
    ],
  },
  {
    id: "potencia",
    label: "Potencia",
    baseUnitLabel: "vatio",
    allowsNegative: false,
    units: [
      { id: "w", label: "Vatios (W)", toBase: 1 },
      { id: "kw", label: "Kilovatios (kW)", toBase: 1000 },
      { id: "mw", label: "Megavatios (MW)", toBase: 1000000 },
      { id: "hp", label: "Caballos de fuerza (hp)", toBase: 745.6998715822702 },
      { id: "btuh", label: "BTU por hora (BTU/h)", toBase: 0.29307107 },
    ],
  },
];

export function getUnitCategory(id: UnitCategoryId): UnitCategoryDefinition | undefined {
  return UNIT_CATEGORIES.find((c) => c.id === id);
}

/** Celsius/Fahrenheit/Kelvin need real offset-aware formulas — a linear factor-from-base approach (like every other category) would silently produce wrong results, which spec section 18 explicitly forbids ("temperatura debe utilizar fórmulas específicas, no factores lineales incorrectos"). */
function temperatureToKelvin(value: number, unit: string): number {
  switch (unit) {
    case "c":
      return value + 273.15;
    case "f":
      return ((value - 32) * 5) / 9 + 273.15;
    case "k":
    default:
      return value;
  }
}

function kelvinToTemperature(kelvin: number, unit: string): number {
  switch (unit) {
    case "c":
      return kelvin - 273.15;
    case "f":
      return ((kelvin - 273.15) * 9) / 5 + 32;
    case "k":
    default:
      return kelvin;
  }
}

export interface ConversionResult {
  ok: boolean;
  error?: string;
  value?: number;
  formula?: string;
}

export function convertUnit(categoryId: UnitCategoryId, fromUnitId: string, toUnitId: string, value: number): ConversionResult {
  if (!Number.isFinite(value)) {
    return { ok: false, error: Number.isNaN(value) ? "El valor introducido no es un número." : "El valor no puede ser infinito." };
  }

  const category = getUnitCategory(categoryId);
  if (!category) return { ok: false, error: "Categoría de conversión desconocida." };
  if (!category.allowsNegative && value < 0) return { ok: false, error: `Esta unidad no admite valores negativos.` };

  if (categoryId === "temperatura") {
    if (fromUnitId === "k" && value < 0) return { ok: false, error: "La temperatura en Kelvin no puede ser negativa (cero absoluto = 0 K)." };
    const kelvin = temperatureToKelvin(value, fromUnitId);
    if (kelvin < 0) return { ok: false, error: "El resultado está por debajo del cero absoluto, lo cual es físicamente imposible." };
    const result = kelvinToTemperature(kelvin, toUnitId);
    return { ok: true, value: result, formula: temperatureFormula(fromUnitId, toUnitId) };
  }

  const fromUnit = category.units.find((u) => u.id === fromUnitId);
  const toUnit = category.units.find((u) => u.id === toUnitId);
  if (!fromUnit || !toUnit || fromUnit.toBase === null || toUnit.toBase === null) {
    return { ok: false, error: "Unidad de origen o destino desconocida." };
  }

  const baseValue = value * fromUnit.toBase;
  const result = baseValue / toUnit.toBase;
  return { ok: true, value: result, formula: `valor × ${fromUnit.toBase} ÷ ${toUnit.toBase} (vía ${category.baseUnitLabel})` };
}

function temperatureFormula(from: string, to: string): string {
  if (from === "c" && to === "f") return "°F = °C × 9/5 + 32";
  if (from === "f" && to === "c") return "°C = (°F − 32) × 5/9";
  if (from === "c" && to === "k") return "K = °C + 273.15";
  if (from === "k" && to === "c") return "°C = K − 273.15";
  if (from === "f" && to === "k") return "K = (°F − 32) × 5/9 + 273.15";
  if (from === "k" && to === "f") return "°F = (K − 273.15) × 9/5 + 32";
  return "Sin conversión (misma unidad)";
}

export function formatUnitValue(value: number, precision: number, scientific: boolean): string {
  if (scientific) return value.toExponential(Math.min(15, Math.max(0, precision)));
  const rounded = Number(value.toFixed(Math.min(15, Math.max(0, precision))));
  return rounded.toLocaleString("es-ES", { maximumFractionDigits: precision, useGrouping: false });
}
