/**
 * Fuel/trip cost core (spec section 19). Distance and fuel-efficiency are
 * always manually entered — never geolocation, never a map/route API, never
 * a live fuel price (spec: "no consulte precios actuales... no acceda a
 * geolocalización"). Efficiency is normalized to a single internal unit
 * (liters per 100 km) so every input system can be compared/mixed
 * correctly, then converted back to the visitor's preferred display unit.
 */

export type EfficiencyUnit = "l-100km" | "km-l" | "mpg-us" | "mpg-imperial";

const KM_PER_MILE = 1.609344;
const LITERS_PER_US_GALLON = 3.785411784;
const LITERS_PER_IMPERIAL_GALLON = 4.54609;

/** Normalizes any efficiency input to liters-per-100km — the single internal unit every calculation uses. */
export function toLitersPer100Km(value: number, unit: EfficiencyUnit): number {
  switch (unit) {
    case "l-100km":
      return value;
    case "km-l":
      return 100 / value;
    case "mpg-us": {
      const kmPerGallon = value * KM_PER_MILE;
      return (LITERS_PER_US_GALLON / kmPerGallon) * 100;
    }
    case "mpg-imperial": {
      const kmPerGallon = value * KM_PER_MILE;
      return (LITERS_PER_IMPERIAL_GALLON / kmPerGallon) * 100;
    }
  }
}

export function fromLitersPer100Km(litersPer100Km: number, unit: EfficiencyUnit): number {
  switch (unit) {
    case "l-100km":
      return litersPer100Km;
    case "km-l":
      return 100 / litersPer100Km;
    case "mpg-us": {
      const kmPerGallon = (LITERS_PER_US_GALLON / litersPer100Km) * 100;
      return kmPerGallon / KM_PER_MILE;
    }
    case "mpg-imperial": {
      const kmPerGallon = (LITERS_PER_IMPERIAL_GALLON / litersPer100Km) * 100;
      return kmPerGallon / KM_PER_MILE;
    }
  }
}

export type DistanceUnit = "km" | "mi";

export function distanceToKm(value: number, unit: DistanceUnit): number {
  return unit === "km" ? value : value * KM_PER_MILE;
}

export interface TripLeg {
  id: string;
  label: string;
  distance: number;
  distanceUnit: DistanceUnit;
}

export interface FuelTripInput {
  legs: TripLeg[];
  roundTrip: boolean;
  efficiencyValue: number;
  efficiencyUnit: EfficiencyUnit;
  fuelPricePerLiterMinor: number; // always normalized to price-per-liter internally regardless of distance unit
  tollsMinor: number;
  parkingMinor: number;
  otherCostsMinor: number;
  passengers: number;
  maintenancePerKmMinor?: number;
  depreciationPerKmMinor?: number;
}

export interface FuelTripResult {
  ok: boolean;
  error?: string;
  totalDistanceKm?: number;
  fuelNeededLiters?: number;
  fuelCostMinor?: number;
  extraCostsMinor?: number;
  totalCostMinor?: number;
  costPerKmMinor?: number;
  costPerPassengerMinor?: number;
  maintenanceCostMinor?: number;
  depreciationCostMinor?: number;
}

export function calculateFuelTrip(input: FuelTripInput): FuelTripResult {
  if (input.legs.length === 0) return { ok: false, error: "Añade al menos una etapa del viaje." };
  if (!Number.isFinite(input.efficiencyValue) || input.efficiencyValue <= 0) return { ok: false, error: "El rendimiento debe ser un número mayor que cero." };
  if (!Number.isFinite(input.fuelPricePerLiterMinor) || input.fuelPricePerLiterMinor < 0) return { ok: false, error: "El precio del combustible no puede ser negativo." };
  if (!Number.isFinite(input.passengers) || input.passengers < 1) return { ok: false, error: "Debe haber al menos 1 pasajero." };

  let totalDistanceKm = 0;
  for (const leg of input.legs) {
    if (!Number.isFinite(leg.distance) || leg.distance < 0) return { ok: false, error: `La distancia de la etapa "${leg.label || "sin nombre"}" no puede ser negativa.` };
    totalDistanceKm += distanceToKm(leg.distance, leg.distanceUnit);
  }
  if (input.roundTrip) totalDistanceKm *= 2;

  const litersPer100Km = toLitersPer100Km(input.efficiencyValue, input.efficiencyUnit);
  const fuelNeededLiters = (totalDistanceKm / 100) * litersPer100Km;
  const fuelCostMinor = fuelNeededLiters * input.fuelPricePerLiterMinor;

  const tolls = input.tollsMinor || 0;
  const parking = input.parkingMinor || 0;
  const other = input.otherCostsMinor || 0;
  if (tolls < 0 || parking < 0 || other < 0) return { ok: false, error: "Los costes adicionales no pueden ser negativos." };
  const extraCostsMinor = tolls + parking + other;

  const maintenanceCostMinor = input.maintenancePerKmMinor ? input.maintenancePerKmMinor * totalDistanceKm : 0;
  const depreciationCostMinor = input.depreciationPerKmMinor ? input.depreciationPerKmMinor * totalDistanceKm : 0;

  const totalCostMinor = fuelCostMinor + extraCostsMinor + maintenanceCostMinor + depreciationCostMinor;
  const costPerKmMinor = totalDistanceKm > 0 ? totalCostMinor / totalDistanceKm : 0;
  const costPerPassengerMinor = totalCostMinor / input.passengers;

  return { ok: true, totalDistanceKm, fuelNeededLiters, fuelCostMinor, extraCostsMinor, totalCostMinor, costPerKmMinor, costPerPassengerMinor, maintenanceCostMinor, depreciationCostMinor };
}

export function compareVehicles(inputs: FuelTripInput[]): { results: FuelTripResult[]; cheapestIndex: number | null; savingsVsCheapestMinor: (number | null)[] } {
  const results = inputs.map(calculateFuelTrip);
  const validResults = results.map((r, i) => (r.ok ? { i, cost: r.totalCostMinor! } : null)).filter((r): r is { i: number; cost: number } => r !== null);
  if (validResults.length === 0) return { results, cheapestIndex: null, savingsVsCheapestMinor: results.map(() => null) };

  const cheapest = validResults.reduce((min, cur) => (cur.cost < min.cost ? cur : min));
  const savingsVsCheapestMinor = results.map((r) => (r.ok ? r.totalCostMinor! - cheapest.cost : null));

  return { results, cheapestIndex: cheapest.i, savingsVsCheapestMinor };
}
