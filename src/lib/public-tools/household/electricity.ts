/**
 * Appliance electricity-consumption core (spec section 22). Power is always
 * entered by the visitor from the appliance's own nameplate/manual — never
 * auto-detected, never read from a smart meter or home-automation system
 * (spec: "no detecte dispositivos automáticamente... no se conecte a
 * medidores o sistemas domésticos"). W/kW/Wh/kWh are never confused: power
 * (W/kW) is instantaneous draw, energy (Wh/kWh) is power integrated over
 * time — every function name says explicitly which one it returns.
 */

export type PowerUnit = "w" | "kw";

export function powerToWatts(value: number, unit: PowerUnit): number {
  return unit === "w" ? value : value * 1000;
}

export interface TariffBand {
  id: string;
  label: string;
  hoursPerDay: number; // how many of the appliance's daily usage hours fall in this band
  pricePerKwhMinor: number;
}

export interface ApplianceInput {
  id: string;
  name: string;
  powerValue: number;
  powerUnit: PowerUnit;
  quantity: number;
  hoursPerDay: number;
  daysPerUse: number; // days per month/period the appliance is actually used
  standbyEnabled: boolean;
  standbyPowerW: number;
  cyclesEnabled: boolean;
  energyPerCycleWh: number;
  cyclesPerDay: number;
}

export function createAppliance(): ApplianceInput {
  return { id: `appliance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: "", powerValue: 0, powerUnit: "w", quantity: 1, hoursPerDay: 0, daysPerUse: 30, standbyEnabled: false, standbyPowerW: 0, cyclesEnabled: false, energyPerCycleWh: 0, cyclesPerDay: 0 };
}

export interface ApplianceEnergyResult {
  ok: boolean;
  error?: string;
  dailyActiveKwh?: number;
  dailyStandbyKwh?: number;
  dailyTotalKwh?: number;
  monthlyKwh?: number;
  annualKwh?: number;
}

function validateAppliance(a: ApplianceInput): string | null {
  if (a.powerValue < 0) return `La potencia de "${a.name || "un aparato"}" no puede ser negativa.`;
  if (a.quantity < 1) return `La cantidad de "${a.name || "un aparato"}" debe ser al menos 1.`;
  if (a.hoursPerDay < 0 || a.hoursPerDay > 24) return `Las horas diarias de "${a.name || "un aparato"}" deben estar entre 0 y 24.`;
  if (a.daysPerUse < 0 || a.daysPerUse > 366) return `Los días de uso de "${a.name || "un aparato"}" no son válidos.`;
  if (a.standbyEnabled && a.standbyPowerW < 0) return `La potencia en espera de "${a.name || "un aparato"}" no puede ser negativa.`;
  if (a.cyclesEnabled && (a.energyPerCycleWh < 0 || a.cyclesPerDay < 0)) return `Los datos por ciclo de "${a.name || "un aparato"}" no pueden ser negativos.`;
  return null;
}

export function calculateApplianceEnergy(a: ApplianceInput): ApplianceEnergyResult {
  const error = validateAppliance(a);
  if (error) return { ok: false, error };

  let dailyActiveWh: number;
  if (a.cyclesEnabled) {
    dailyActiveWh = a.energyPerCycleWh * a.cyclesPerDay * a.quantity;
  } else {
    const watts = powerToWatts(a.powerValue, a.powerUnit);
    dailyActiveWh = watts * a.hoursPerDay * a.quantity;
  }

  const standbyHoursPerDay = a.standbyEnabled ? Math.max(0, 24 - (a.cyclesEnabled ? 0 : a.hoursPerDay)) : 0;
  const dailyStandbyWh = a.standbyEnabled ? a.standbyPowerW * standbyHoursPerDay * a.quantity : 0;

  const dailyActiveKwh = dailyActiveWh / 1000;
  const dailyStandbyKwh = dailyStandbyWh / 1000;
  const dailyTotalKwh = dailyActiveKwh + dailyStandbyKwh;
  const monthlyKwh = dailyTotalKwh * a.daysPerUse;
  const annualKwh = dailyTotalKwh * 365;

  return { ok: true, dailyActiveKwh, dailyStandbyKwh, dailyTotalKwh, monthlyKwh, annualKwh };
}

export interface TariffInput {
  mode: "flat" | "bands";
  flatPricePerKwhMinor?: number;
  bands?: TariffBand[];
  fixedChargeMinor?: number; // optional fixed monthly charge, independent of consumption
}

export interface CostResult {
  ok: boolean;
  error?: string;
  energyCostMinor?: number;
  fixedChargeMinor?: number;
  totalCostMinor?: number;
}

/** Applies a tariff to a daily kWh figure and a usage-hours breakdown across bands, or a flat rate — never fetches a real utility tariff. */
export function applyTariff(dailyKwh: number, hoursPerDay: number, tariff: TariffInput): CostResult {
  const fixedChargeMinor = tariff.fixedChargeMinor ?? 0;
  if (fixedChargeMinor < 0) return { ok: false, error: "El cargo fijo no puede ser negativo." };

  if (tariff.mode === "flat") {
    const price = tariff.flatPricePerKwhMinor ?? 0;
    if (price < 0) return { ok: false, error: "La tarifa no puede ser negativa." };
    const energyCostMinor = dailyKwh * price;
    return { ok: true, energyCostMinor, fixedChargeMinor, totalCostMinor: energyCostMinor + fixedChargeMinor };
  }

  const bands = tariff.bands ?? [];
  if (bands.length === 0) return { ok: false, error: "Añade al menos una franja horaria con su tarifa." };
  const totalBandHours = bands.reduce((sum, b) => sum + b.hoursPerDay, 0);
  if (totalBandHours <= 0) return { ok: false, error: "Las franjas deben cubrir al menos 1 hora en total." };
  if (bands.some((b) => b.pricePerKwhMinor < 0 || b.hoursPerDay < 0)) return { ok: false, error: "Las franjas no pueden tener horas o precios negativos." };

  const kwhPerHour = hoursPerDay > 0 ? dailyKwh / hoursPerDay : 0;
  const energyCostMinor = bands.reduce((sum, b) => sum + kwhPerHour * b.hoursPerDay * b.pricePerKwhMinor, 0);
  return { ok: true, energyCostMinor, fixedChargeMinor, totalCostMinor: energyCostMinor + fixedChargeMinor };
}

export interface MaxHoursForTargetInput {
  appliance: ApplianceInput;
  tariff: TariffInput;
  targetMonthlyCostMinor: number;
}

/** Solves for the maximum daily usage hours that keep monthly cost at or below a target — a direct inversion, never a search/approximation. */
export function calculateMaxHoursForTarget(input: MaxHoursForTargetInput): { ok: boolean; error?: string; maxHoursPerDay?: number } {
  if (input.appliance.cyclesEnabled) return { ok: false, error: "Este cálculo solo aplica a aparatos con horas de uso diarias, no a modo por ciclo." };
  if (!Number.isFinite(input.appliance.quantity) || input.appliance.quantity < 1) return { ok: false, error: "La cantidad de aparatos debe ser al menos 1." };
  const watts = powerToWatts(input.appliance.powerValue, input.appliance.powerUnit);
  if (watts <= 0) return { ok: false, error: "La potencia debe ser mayor que cero." };

  const pricePerKwh = input.tariff.mode === "flat" ? (input.tariff.flatPricePerKwhMinor ?? 0) : (input.tariff.bands ?? []).reduce((sum, b) => sum + b.pricePerKwhMinor * b.hoursPerDay, 0) / Math.max(1, (input.tariff.bands ?? []).reduce((s, b) => s + b.hoursPerDay, 0));
  if (pricePerKwh <= 0) return { ok: false, error: "La tarifa debe ser mayor que cero para calcular un límite de horas." };

  const fixedCharge = input.tariff.fixedChargeMinor ?? 0;
  const availableForEnergy = input.targetMonthlyCostMinor - fixedCharge;
  if (availableForEnergy <= 0) return { ok: false, error: "El cargo fijo ya supera el objetivo de coste mensual." };

  const daysPerUse = input.appliance.daysPerUse || 30;
  const maxDailyKwh = availableForEnergy / pricePerKwh / daysPerUse;
  const maxHoursPerDay = (maxDailyKwh * 1000) / (watts * input.appliance.quantity);
  return { ok: true, maxHoursPerDay: Math.min(24, Math.max(0, maxHoursPerDay)) };
}
