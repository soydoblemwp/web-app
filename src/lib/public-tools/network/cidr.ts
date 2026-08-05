/**
 * Subnet division shared by IPv4 and IPv6 (spec section 24). Bounded by
 * `DOCUMENT_LIMITS.network.maxSubnetDivisions` — this module refuses to
 * even attempt enumerating a division that would produce more child
 * subnets than that ceiling, rather than looping until memory/time runs
 * out (spec: "la división en subredes debe tener límites estrictos...
 * bucles que intenten enumerar redes enormes").
 */
import { DOCUMENT_LIMITS } from "../documents/limits";
import { ipv4ToString } from "./ipv4";
import { ipv6ToExpanded } from "./ipv6";

const LIMITS = DOCUMENT_LIMITS.network;

export interface DivideResult<TAddr> {
  ok: boolean;
  error?: string;
  subnets?: { network: TAddr; prefix: number }[];
}

export function divideIpv4Subnet(networkValue: number, currentPrefix: number, newPrefix: number): DivideResult<string> {
  if (newPrefix <= currentPrefix) return { ok: false, error: "El nuevo prefijo debe ser mayor (una subred más pequeña) que el prefijo actual." };
  if (newPrefix > 32) return { ok: false, error: "El prefijo no puede superar /32." };
  const count = Math.pow(2, newPrefix - currentPrefix);
  if (count > LIMITS.maxSubnetDivisions) {
    return { ok: false, error: `Esta división generaría ${count.toLocaleString("es-ES")} subredes, por encima del límite de ${LIMITS.maxSubnetDivisions.toLocaleString("es-ES")}.` };
  }
  const blockSize = Math.pow(2, 32 - newPrefix);
  const subnets: { network: string; prefix: number }[] = [];
  for (let i = 0; i < count; i++) {
    subnets.push({ network: ipv4ToString((networkValue + i * blockSize) >>> 0), prefix: newPrefix });
  }
  return { ok: true, subnets };
}

export function divideIpv6Prefix(networkValue: bigint, currentPrefix: number, newPrefix: number): DivideResult<string> {
  if (newPrefix <= currentPrefix) return { ok: false, error: "El nuevo prefijo debe ser mayor (una subred más pequeña) que el prefijo actual." };
  if (newPrefix > 128) return { ok: false, error: "El prefijo no puede superar /128." };
  const countBig = BigInt(1) << BigInt(newPrefix - currentPrefix);
  if (countBig > BigInt(LIMITS.maxSubnetDivisions)) {
    return { ok: false, error: `Esta división generaría ${countBig.toString(10)} subredes, por encima del límite de ${LIMITS.maxSubnetDivisions.toLocaleString("es-ES")}.` };
  }
  const count = Number(countBig);
  const blockSize = BigInt(1) << BigInt(128 - newPrefix);
  const subnets: { network: string; prefix: number }[] = [];
  for (let i = 0; i < count; i++) {
    subnets.push({ network: ipv6ToExpanded(networkValue + BigInt(i) * blockSize), prefix: newPrefix });
  }
  return { ok: true, subnets };
}
