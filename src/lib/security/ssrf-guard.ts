import { isIP } from "node:net";
import dns from "node:dns/promises";

/**
 * Validates a user-supplied URL before the server fetches it (page monitor,
 * link checker). Blocks non-http(s) schemes, credentials in the URL, and any
 * hostname that resolves to a private/loopback/link-local/reserved address —
 * this is the primary defense against SSRF against internal infrastructure.
 */

const BLOCKED_HOSTNAMES = new Set(["localhost", "0.0.0.0", "metadata.google.internal"]);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 0) return true;
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1") return true; // loopback
  if (normalized.startsWith("fe80:")) return true; // link-local
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique local
  if (normalized.startsWith("::ffff:")) {
    return isPrivateIPv4(normalized.replace("::ffff:", ""));
  }
  return false;
}

export class UnsafeUrlError extends Error {}

export interface SafeUrlCheckResult {
  url: URL;
  resolvedIp: string;
}

export async function assertSafeExternalUrl(rawUrl: string): Promise<SafeUrlCheckResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError("URL no válida.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Solo se permiten URLs http o https.");
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("No se permiten credenciales en la URL.");
  }
  if (BLOCKED_HOSTNAMES.has(url.hostname.toLowerCase())) {
    throw new UnsafeUrlError("Este host no está permitido.");
  }

  const ipVersion = isIP(url.hostname);
  const candidateIps: string[] = [];

  if (ipVersion) {
    candidateIps.push(url.hostname);
  } else {
    try {
      const records = await dns.lookup(url.hostname, { all: true });
      candidateIps.push(...records.map((r) => r.address));
    } catch {
      throw new UnsafeUrlError("No se pudo resolver el dominio.");
    }
  }

  if (candidateIps.length === 0) {
    throw new UnsafeUrlError("No se pudo resolver el dominio.");
  }

  for (const ip of candidateIps) {
    const isBlocked = isIP(ip) === 6 ? isPrivateIPv6(ip) : isPrivateIPv4(ip);
    if (isBlocked) {
      throw new UnsafeUrlError(
        "Esta URL apunta a una dirección privada o interna y no puede comprobarse."
      );
    }
  }

  return { url, resolvedIp: candidateIps[0] };
}
