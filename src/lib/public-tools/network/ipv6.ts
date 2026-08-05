/**
 * IPv6 core (spec section 24). Every address is a `BigInt` in [0, 2^128) —
 * `number` cannot represent the full 128-bit range without losing
 * precision, so this module never converts an address to `number` (only
 * small, bounded quantities like a division count go through `number`).
 * IPv6 has no broadcast address concept at all (unlike IPv4) — this module
 * never computes or exposes one. Classification/embedded-IPv4 detection are
 * static local range checks; never geolocation, never a network call.
 */
import { ipv4ToString, parseIpv4 } from "./ipv4";

const GROUP_MAX = BigInt(0xffff);
const TOTAL_BITS = BigInt(128);

export interface Ipv6ParseResult {
  ok: boolean;
  error?: string;
  value?: bigint;
  hadEmbeddedIpv4?: boolean;
}

function isHexGroup(s: string): boolean {
  return /^[0-9a-fA-F]{1,4}$/.test(s);
}

export function parseIpv6(input: string): Ipv6ParseResult {
  let text = input.trim();
  if (text.length === 0) return { ok: false, error: "Introduce una dirección IPv6." };
  if ((text.match(/::/g) ?? []).length > 1) return { ok: false, error: 'La abreviatura "::" solo puede aparecer una vez.' };

  let hadEmbeddedIpv4 = false;
  const ipv4Match = /(?:^|:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(text);
  if (ipv4Match) {
    const embedded = parseIpv4(ipv4Match[1]);
    if (!embedded.ok || embedded.value === undefined) return { ok: false, error: `La parte IPv4 embebida "${ipv4Match[1]}" no es válida.` };
    hadEmbeddedIpv4 = true;
    const hi = ((embedded.value >>> 16) & 0xffff).toString(16);
    const lo = (embedded.value & 0xffff).toString(16);
    text = text.slice(0, text.length - ipv4Match[1].length) + `${hi}:${lo}`;
  }

  const hasDoubleColon = text.includes("::");
  let leftPart = text;
  let rightPart = "";
  if (hasDoubleColon) {
    const idx = text.indexOf("::");
    leftPart = text.slice(0, idx);
    rightPart = text.slice(idx + 2);
  }

  const leftGroups = leftPart.length > 0 ? leftPart.split(":") : [];
  const rightGroups = rightPart.length > 0 ? rightPart.split(":") : [];

  for (const g of [...leftGroups, ...rightGroups]) {
    if (!isHexGroup(g)) return { ok: false, error: `"${g}" no es un grupo hexadecimal válido (1-4 dígitos hexadecimales).` };
  }

  let allGroups: string[];
  if (hasDoubleColon) {
    const missing = 8 - (leftGroups.length + rightGroups.length);
    if (missing < 1) return { ok: false, error: 'La dirección tiene demasiados grupos para usar "::" (que debe representar al menos un grupo de ceros).' };
    allGroups = [...leftGroups, ...Array(missing).fill("0"), ...rightGroups];
  } else {
    if (leftGroups.length !== 8) return { ok: false, error: `Se esperaban 8 grupos separados por ":" (o "::" para abreviar ceros); se encontraron ${leftGroups.length}.` };
    allGroups = leftGroups;
  }

  let value = BigInt(0);
  for (const g of allGroups) {
    value = (value << BigInt(16)) | BigInt(parseInt(g, 16));
  }

  return { ok: true, value, hadEmbeddedIpv4 };
}

export function ipv6ToExpanded(value: bigint): string {
  const groups: string[] = [];
  for (let i = 7; i >= 0; i--) {
    const shift = BigInt(i * 16);
    const group = (value >> shift) & GROUP_MAX;
    groups.push(group.toString(16).padStart(4, "0"));
  }
  return groups.join(":");
}

export function ipv6ToCompressed(value: bigint): string {
  const groups: string[] = [];
  for (let i = 7; i >= 0; i--) {
    const shift = BigInt(i * 16);
    const group = (value >> shift) & GROUP_MAX;
    groups.push(group.toString(16));
  }

  // Find the longest run of consecutive "0" groups to replace with "::" (RFC 5952: longest run wins;
  // on a tie, the first run wins; a run of length 1 is never compressed).
  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  let curLen = 0;
  for (let i = 0; i < groups.length; i++) {
    if (groups[i] === "0") {
      if (curStart === -1) curStart = i;
      curLen++;
      if (curLen > bestLen) {
        bestLen = curLen;
        bestStart = curStart;
      }
    } else {
      curStart = -1;
      curLen = 0;
    }
  }

  if (bestLen < 2) return groups.join(":");

  const before = groups.slice(0, bestStart);
  const after = groups.slice(bestStart + bestLen);
  const beforeStr = before.join(":");
  const afterStr = after.join(":");
  if (before.length === 0 && after.length === 0) return "::";
  if (before.length === 0) return `::${afterStr}`;
  if (after.length === 0) return `${beforeStr}::`;
  return `${beforeStr}::${afterStr}`;
}

export function parsePrefixLength128(input: string): { ok: boolean; error?: string; prefix?: number } {
  if (!/^\d{1,3}$/.test(input.trim())) return { ok: false, error: "El prefijo debe ser un número entre 0 y 128." };
  const prefix = Number(input.trim());
  if (prefix < 0 || prefix > 128) return { ok: false, error: "El prefijo debe estar entre 0 y 128." };
  return { ok: true, prefix };
}

function maskFromPrefix128(prefix: number): bigint {
  if (prefix <= 0) return BigInt(0);
  if (prefix >= 128) return (BigInt(1) << TOTAL_BITS) - BigInt(1);
  const hostBits = BigInt(128 - prefix);
  return ((BigInt(1) << TOTAL_BITS) - BigInt(1)) ^ ((BigInt(1) << hostBits) - BigInt(1));
}

export type Ipv6Classification = "loopback" | "unspecified" | "link-local" | "unique-local" | "multicast" | "documentation" | "ipv4-mapped" | "global-unicast" | "other";

export function classifyIpv6(value: bigint): Ipv6Classification {
  if (value === BigInt(0)) return "unspecified";
  if (value === BigInt(1)) return "loopback";
  if ((value >> BigInt(64)) === BigInt(0) && (value >> BigInt(32)) === BigInt(0xffff)) return "ipv4-mapped"; // ::ffff:0:0/96
  if ((value >> (TOTAL_BITS - BigInt(10))) === (BigInt(0xfe80) >> BigInt(6))) return "link-local"; // fe80::/10
  if ((value >> (TOTAL_BITS - BigInt(7))) === (BigInt(0xfc))) return "unique-local"; // fc00::/7
  if ((value >> (TOTAL_BITS - BigInt(8))) === BigInt(0xff)) return "multicast"; // ff00::/8
  if ((value >> (TOTAL_BITS - BigInt(32))) === BigInt(0x20010db8)) return "documentation"; // 2001:db8::/32
  if ((value >> (TOTAL_BITS - BigInt(3))) === BigInt(0b001)) return "global-unicast"; // 2000::/3
  return "other";
}

export interface Ipv6PrefixInfo {
  expanded: string;
  compressed: string;
  prefix: number;
  networkStart: string; // expanded form of the first address in the prefix
  networkEnd: string; // expanded form of the last address in the prefix
  totalAddresses: string; // decimal string — 2^(128-prefix) can vastly exceed Number.MAX_SAFE_INTEGER
  classification: Ipv6Classification;
  hadEmbeddedIpv4: boolean;
}

export function computeIpv6Prefix(ipString: string, prefix: number): { ok: boolean; error?: string; info?: Ipv6PrefixInfo } {
  const parsed = parseIpv6(ipString);
  if (!parsed.ok || parsed.value === undefined) return { ok: false, error: parsed.error };

  const mask = maskFromPrefix128(prefix);
  const networkStart = parsed.value & mask;
  const hostBits = BigInt(128 - prefix);
  const networkEnd = networkStart | ((BigInt(1) << hostBits) - BigInt(1));
  const totalAddresses = BigInt(1) << hostBits;

  const info: Ipv6PrefixInfo = {
    expanded: ipv6ToExpanded(parsed.value),
    compressed: ipv6ToCompressed(parsed.value),
    prefix,
    networkStart: ipv6ToExpanded(networkStart),
    networkEnd: ipv6ToExpanded(networkEnd),
    totalAddresses: totalAddresses.toString(10),
    classification: classifyIpv6(parsed.value),
    hadEmbeddedIpv4: parsed.hadEmbeddedIpv4 ?? false,
  };
  return { ok: true, info };
}

export function ipv6InPrefix(candidate: bigint, networkValue: bigint, prefix: number): boolean {
  const mask = maskFromPrefix128(prefix);
  return (candidate & mask) === (networkValue & mask);
}

/** Renders the embedded IPv4 tail of an IPv4-mapped (::ffff:0:0/96) address, for display only. */
export function extractEmbeddedIpv4(value: bigint): string | null {
  if ((value >> BigInt(32)) !== BigInt(0xffff)) return null;
  const low32 = Number(value & BigInt(0xffffffff));
  return ipv4ToString(low32 >>> 0);
}
