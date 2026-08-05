/**
 * IPv4 core (spec section 24). Every address is represented as a plain,
 * unsigned 32-bit `number` (0..4294967295, well within
 * `Number.MAX_SAFE_INTEGER`) — bitwise mask math always goes through
 * `>>> 0` to coerce back to unsigned, and `prefix === 0` / `prefix === 32`
 * are handled as explicit special cases, because `<<` in JS takes its
 * shift amount modulo 32 (`x << 32` is actually `x << 0`, NOT zero — a
 * classic 32-bit-shift bug this module deliberately avoids). Never
 * performs geolocation, ISP/ASN/reputation lookups, or any network access
 * — classification (private/loopback/etc.) is a purely local, static table
 * lookup (RFC 1918/5735/etc. ranges).
 */

export interface Ipv4ParseResult {
  ok: boolean;
  error?: string;
  value?: number; // unsigned 32-bit
  octets?: [number, number, number, number];
}

export function parseIpv4(input: string): Ipv4ParseResult {
  const trimmed = input.trim();
  const parts = trimmed.split(".");
  if (parts.length !== 4) return { ok: false, error: "Una dirección IPv4 debe tener exactamente 4 octetos separados por puntos." };
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return { ok: false, error: `"${part}" no es un octeto numérico válido.` };
    if (part.length > 1 && part[0] === "0") return { ok: false, error: `"${part}" tiene ceros a la izquierda ambiguos.` };
    const value = Number(part);
    if (value < 0 || value > 255) return { ok: false, error: `"${part}" está fuera del rango 0-255.` };
    octets.push(value);
  }
  const [a, b, c, d] = octets as [number, number, number, number];
  const value = ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
  return { ok: true, value, octets: [a, b, c, d] };
}

export function ipv4ToString(value: number): string {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff].join(".");
}

export function parsePrefixLength(input: string): { ok: boolean; error?: string; prefix?: number } {
  if (!/^\d{1,2}$/.test(input.trim())) return { ok: false, error: "El prefijo debe ser un número entre 0 y 32." };
  const prefix = Number(input.trim());
  if (prefix < 0 || prefix > 32) return { ok: false, error: "El prefijo debe estar entre 0 y 32." };
  return { ok: true, prefix };
}

export function maskFromPrefix(prefix: number): number {
  if (prefix <= 0) return 0;
  if (prefix >= 32) return 0xffffffff >>> 0;
  return (0xffffffff << (32 - prefix)) >>> 0;
}

export function prefixFromMask(mask: number): { ok: boolean; error?: string; prefix?: number } {
  // A valid subnet mask is a contiguous run of 1s followed by 0s (from the MSB). Reject anything else
  // (e.g. 255.0.255.0) rather than silently computing a nonsensical prefix (spec: "máscara no contigua").
  let prefix = 0;
  let sawZero = false;
  for (let bit = 31; bit >= 0; bit--) {
    const isSet = ((mask >>> bit) & 1) === 1;
    if (isSet) {
      if (sawZero) return { ok: false, error: "La máscara no es contigua (mezcla bits de red y de host)." };
      prefix++;
    } else {
      sawZero = true;
    }
  }
  return { ok: true, prefix };
}

export function wildcardFromMask(mask: number): number {
  return (~mask) >>> 0;
}

export interface Ipv4SubnetInfo {
  ipString: string;
  prefix: number;
  maskString: string;
  wildcardString: string;
  networkAddress: string;
  broadcastAddress: string | null; // null only when prefix is 31 or 32 (no distinct broadcast)
  firstUsable: string | null;
  lastUsable: string | null;
  totalAddresses: number;
  usableAddresses: number;
  binary: string;
  hex: string;
  classification: Ipv4Classification;
  historicalClass: string;
}

export type Ipv4Classification = "private" | "loopback" | "link-local" | "multicast" | "broadcast-reserved" | "documentation" | "public";

const RESERVED_RANGES: { test: (v: number) => boolean; classification: Ipv4Classification }[] = [
  { test: (v) => v >= ipv4ToUint("10.0.0.0") && v <= ipv4ToUint("10.255.255.255"), classification: "private" },
  { test: (v) => v >= ipv4ToUint("172.16.0.0") && v <= ipv4ToUint("172.31.255.255"), classification: "private" },
  { test: (v) => v >= ipv4ToUint("192.168.0.0") && v <= ipv4ToUint("192.168.255.255"), classification: "private" },
  { test: (v) => v >= ipv4ToUint("127.0.0.0") && v <= ipv4ToUint("127.255.255.255"), classification: "loopback" },
  { test: (v) => v >= ipv4ToUint("169.254.0.0") && v <= ipv4ToUint("169.254.255.255"), classification: "link-local" },
  { test: (v) => v >= ipv4ToUint("224.0.0.0") && v <= ipv4ToUint("239.255.255.255"), classification: "multicast" },
  { test: (v) => v >= ipv4ToUint("240.0.0.0") && v <= ipv4ToUint("255.255.255.255"), classification: "broadcast-reserved" },
  { test: (v) => v >= ipv4ToUint("192.0.2.0") && v <= ipv4ToUint("192.0.2.255"), classification: "documentation" },
  { test: (v) => v >= ipv4ToUint("198.51.100.0") && v <= ipv4ToUint("198.51.100.255"), classification: "documentation" },
  { test: (v) => v >= ipv4ToUint("203.0.113.0") && v <= ipv4ToUint("203.0.113.255"), classification: "documentation" },
];

function ipv4ToUint(dotted: string): number {
  const parsed = parseIpv4(dotted);
  return parsed.value!;
}

export function classifyIpv4(value: number): Ipv4Classification {
  for (const range of RESERVED_RANGES) {
    if (range.test(value)) return range.classification;
  }
  return "public";
}

/** Legacy classful designation (A/B/C/D/E) — explicitly labeled historical; classless (CIDR) addressing has been the real standard since 1993 (RFC 1518/1519). */
export function historicalClassOf(value: number): string {
  const firstOctet = (value >>> 24) & 0xff;
  if (firstOctet < 128) return "A (histórica)";
  if (firstOctet < 192) return "B (histórica)";
  if (firstOctet < 224) return "C (histórica)";
  if (firstOctet < 240) return "D / multicast (histórica)";
  return "E / reservada (histórica)";
}

export function computeIpv4Subnet(ipString: string, prefix: number): { ok: boolean; error?: string; info?: Ipv4SubnetInfo } {
  const parsed = parseIpv4(ipString);
  if (!parsed.ok || parsed.value === undefined) return { ok: false, error: parsed.error };

  const mask = maskFromPrefix(prefix);
  const wildcard = wildcardFromMask(mask);
  const network = (parsed.value & mask) >>> 0;
  const broadcast = (network | wildcard) >>> 0;
  const totalAddresses = Math.pow(2, 32 - prefix);

  const hasDistinctBroadcast = prefix <= 30;
  const firstUsable = hasDistinctBroadcast ? ((network + 1) >>> 0) : prefix === 31 ? network : network;
  const lastUsable = hasDistinctBroadcast ? ((broadcast - 1) >>> 0) : prefix === 31 ? broadcast : network;
  const usableAddresses = prefix >= 31 ? totalAddresses : Math.max(0, totalAddresses - 2);

  const info: Ipv4SubnetInfo = {
    ipString: ipv4ToString(parsed.value),
    prefix,
    maskString: ipv4ToString(mask),
    wildcardString: ipv4ToString(wildcard),
    networkAddress: ipv4ToString(network),
    broadcastAddress: prefix <= 30 ? ipv4ToString(broadcast) : null,
    firstUsable: prefix <= 32 ? ipv4ToString(firstUsable) : null,
    lastUsable: prefix <= 32 ? ipv4ToString(lastUsable) : null,
    totalAddresses,
    usableAddresses,
    binary: parsed.value.toString(2).padStart(32, "0").match(/.{1,8}/g)!.join("."),
    hex: `0x${parsed.value.toString(16).padStart(8, "0")}`,
    classification: classifyIpv4(parsed.value),
    historicalClass: historicalClassOf(parsed.value),
  };
  return { ok: true, info };
}

export function ipv4InSubnet(candidate: number, networkValue: number, prefix: number): boolean {
  const mask = maskFromPrefix(prefix);
  return ((candidate & mask) >>> 0) === ((networkValue & mask) >>> 0);
}

export interface Ipv4CompareResult {
  relationship: "equal" | "a-contains-b" | "b-contains-a" | "disjoint" | "overlap-partial";
}

export function compareIpv4Networks(aValue: number, aPrefix: number, bValue: number, bPrefix: number): Ipv4CompareResult {
  const aMask = maskFromPrefix(aPrefix);
  const bMask = maskFromPrefix(bPrefix);
  const aNet = (aValue & aMask) >>> 0;
  const bNet = (bValue & bMask) >>> 0;
  if (aPrefix === bPrefix && aNet === bNet) return { relationship: "equal" };
  if (aPrefix < bPrefix && ((bNet & aMask) >>> 0) === aNet) return { relationship: "a-contains-b" };
  if (bPrefix < aPrefix && ((aNet & bMask) >>> 0) === bNet) return { relationship: "b-contains-a" };
  return { relationship: "disjoint" };
}
