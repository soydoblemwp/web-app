/**
 * Inventory/reorder math core (spec section 13): reorder point, safety
 * stock, EOQ, and coverage/stockout-date estimation. Pure formulas over
 * numbers the visitor types in — never forecasts demand, never connects to
 * real sales data, never persists inventory state (spec: "no realices
 * pronóstico mediante IA... no cree persistencia de inventario").
 */
import { addCalendarTime, type CalendarDate } from "../utilities/dates";

export interface ReorderPointInput {
  averageDailyDemand: number;
  leadTimeDays: number;
  manualSafetyStock: number;
  currentStock: number;
  inTransitUnits: number;
}

export interface ReorderPointResult {
  ok: boolean;
  error?: string;
  reorderPoint?: number;
  inventoryPosition?: number; // current stock + in-transit
  unitsAboveOrBelow?: number; // positive = above the reorder point, negative = below (should reorder)
  shouldReorder?: boolean;
}

export function calculateReorderPoint(input: ReorderPointInput): ReorderPointResult {
  const fields = [input.averageDailyDemand, input.leadTimeDays, input.manualSafetyStock, input.currentStock, input.inTransitUnits];
  if (fields.some((v) => !Number.isFinite(v))) return { ok: false, error: "Introduce solo números finitos." };
  if (input.averageDailyDemand < 0) return { ok: false, error: "La demanda media no puede ser negativa." };
  if (input.leadTimeDays < 0) return { ok: false, error: "El tiempo de entrega no puede ser negativo." };
  if (input.manualSafetyStock < 0) return { ok: false, error: "El stock de seguridad no puede ser negativo." };
  if (input.currentStock < 0) return { ok: false, error: "El stock actual no puede ser negativo." };
  if (input.inTransitUnits < 0) return { ok: false, error: "Las unidades en tránsito no pueden ser negativas." };

  const reorderPoint = input.averageDailyDemand * input.leadTimeDays + input.manualSafetyStock;
  const inventoryPosition = input.currentStock + input.inTransitUnits;
  const unitsAboveOrBelow = inventoryPosition - reorderPoint;

  return { ok: true, reorderPoint, inventoryPosition, unitsAboveOrBelow, shouldReorder: unitsAboveOrBelow < 0 };
}

export type SafetyStockMode = "manual" | "variability" | "service-level";

export interface SafetyStockInput {
  mode: SafetyStockMode;
  manualValue?: number;
  demandStdDev?: number;
  leadTimeStdDev?: number;
  averageDailyDemand?: number;
  averageLeadTimeDays?: number;
  serviceFactorZ?: number; // the visitor supplies the Z factor directly — never invented internally
}

export interface SafetyStockResult {
  ok: boolean;
  error?: string;
  safetyStock?: number;
  assumptionsNote?: string;
}

/**
 * Combines demand variability and lead-time variability into one safety
 * stock (the standard "variable demand and lead time" formula from
 * inventory theory) — never invents its own Z-value table (spec section
 * 13: "no inventes un valor Z; permite introducir directamente el factor").
 */
export function calculateSafetyStock(input: SafetyStockInput): SafetyStockResult {
  if (input.mode === "manual") {
    if (!Number.isFinite(input.manualValue) || (input.manualValue ?? -1) < 0) return { ok: false, error: "El stock de seguridad manual debe ser un número mayor o igual que cero." };
    return { ok: true, safetyStock: input.manualValue };
  }

  const z = input.serviceFactorZ ?? 1;
  if (!Number.isFinite(z) || z < 0) return { ok: false, error: "El factor de seguridad (Z) debe ser un número mayor o igual que cero." };

  if (input.mode === "variability") {
    const demandStdDev = input.demandStdDev ?? 0;
    const leadTime = input.averageLeadTimeDays ?? 0;
    if (!Number.isFinite(demandStdDev) || demandStdDev < 0) return { ok: false, error: "La desviación estándar de la demanda no puede ser negativa." };
    if (!Number.isFinite(leadTime) || leadTime < 0) return { ok: false, error: "El tiempo de entrega medio no puede ser negativo." };
    const safetyStock = z * demandStdDev * Math.sqrt(leadTime);
    return { ok: true, safetyStock, assumptionsNote: "Supone que solo la demanda varía; el tiempo de entrega se trata como fijo." };
  }

  // "service-level" mode: combines demand AND lead-time variability.
  const demandStdDev = input.demandStdDev ?? 0;
  const leadTimeStdDev = input.leadTimeStdDev ?? 0;
  const avgDemand = input.averageDailyDemand ?? 0;
  const avgLeadTime = input.averageLeadTimeDays ?? 0;
  if ([demandStdDev, leadTimeStdDev, avgDemand, avgLeadTime].some((v) => !Number.isFinite(v) || v < 0)) {
    return { ok: false, error: "Todos los valores de variabilidad deben ser números mayores o iguales que cero." };
  }
  const variance = avgLeadTime * demandStdDev ** 2 + avgDemand ** 2 * leadTimeStdDev ** 2;
  const safetyStock = z * Math.sqrt(variance);
  return { ok: true, safetyStock, assumptionsNote: "Combina la variabilidad de la demanda y del tiempo de entrega (fórmula estándar de stock de seguridad)." };
}

export interface EoqInput {
  annualDemand: number;
  orderCostMinor: number;
  annualHoldingCostPerUnitMinor: number;
}

export interface EoqResult {
  ok: boolean;
  error?: string;
  economicOrderQuantity?: number;
  ordersPerYear?: number;
  averageDaysBetweenOrders?: number;
  annualOrderingCostMinor?: number;
  annualHoldingCostMinor?: number;
  totalAnnualCostMinor?: number;
}

export function calculateEoq(input: EoqInput): EoqResult {
  if (![input.annualDemand, input.orderCostMinor, input.annualHoldingCostPerUnitMinor].every(Number.isFinite)) return { ok: false, error: "Introduce solo números finitos." };
  if (input.annualDemand <= 0) return { ok: false, error: "La demanda anual debe ser mayor que cero." };
  if (input.orderCostMinor <= 0) return { ok: false, error: "El coste por pedido debe ser mayor que cero." };
  if (input.annualHoldingCostPerUnitMinor <= 0) return { ok: false, error: "El coste anual de almacenamiento por unidad debe ser mayor que cero." };

  const economicOrderQuantity = Math.sqrt((2 * input.annualDemand * input.orderCostMinor) / input.annualHoldingCostPerUnitMinor);
  const ordersPerYear = input.annualDemand / economicOrderQuantity;
  const averageDaysBetweenOrders = 365 / ordersPerYear;
  const annualOrderingCostMinor = ordersPerYear * input.orderCostMinor;
  const annualHoldingCostMinor = (economicOrderQuantity / 2) * input.annualHoldingCostPerUnitMinor;
  const totalAnnualCostMinor = annualOrderingCostMinor + annualHoldingCostMinor;

  return { ok: true, economicOrderQuantity, ordersPerYear, averageDaysBetweenOrders, annualOrderingCostMinor, annualHoldingCostMinor, totalAnnualCostMinor };
}

export interface CoverageInput {
  availableStock: number;
  averageDailyDemand: number;
  startDate: CalendarDate;
}

/**
 * A discriminated union, never a bare number — coverage with zero demand has
 * no finite "days until stockout", and `Infinity` must never be used to
 * represent that (it isn't valid JSON: `JSON.stringify(Infinity)` produces
 * `null`, silently corrupting exports). "No demand" is its own explicit
 * domain state, not a number.
 */
export type CoverageResult =
  | { ok: true; status: "FINITE"; daysOfCoverage: number; stockoutDate: CalendarDate }
  | { ok: true; status: "NO_DEMAND"; daysOfCoverage: null; stockoutDate: null; message: string }
  | { ok: false; error: string };

export function calculateCoverage(input: CoverageInput): CoverageResult {
  if (!Number.isFinite(input.availableStock) || input.availableStock < 0) return { ok: false, error: "El stock disponible no puede ser negativo." };
  if (!Number.isFinite(input.averageDailyDemand) || input.averageDailyDemand < 0) return { ok: false, error: "La demanda media no puede ser negativa." };

  if (input.averageDailyDemand === 0) {
    return {
      ok: true,
      status: "NO_DEMAND",
      daysOfCoverage: null,
      stockoutDate: null,
      message: "Sin consumo estimado: con una demanda de cero unidades, no existe una fecha calculable de agotamiento.",
    };
  }

  const daysOfCoverage = input.availableStock / input.averageDailyDemand;
  const stockoutDate = addCalendarTime(input.startDate, { days: Math.floor(daysOfCoverage) });
  return { ok: true, status: "FINITE", daysOfCoverage, stockoutDate };
}
