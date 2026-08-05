export type QrContentType = "url" | "text" | "email" | "phone" | "sms" | "wifi";

export interface QrWifiInput {
  ssid: string;
  password: string;
  encryption: "WPA" | "WEP" | "nopass";
  hidden: boolean;
}

export interface QrBuildResult {
  ok: boolean;
  error?: string;
  payload?: string;
}

function escapeWifiValue(value: string): string {
  return value.replace(/([\\;,:"])/g, "\\$1");
}

/**
 * Builds the exact string encoded into the QR code for each content type.
 * Never accepts a raw user-supplied scheme for the "url" type — only
 * http/https are allowed, closing off javascript:/data:/vbscript: and any
 * other executable-scheme injection into the QR payload.
 */
export function buildQrPayload(type: QrContentType, input: Record<string, string> | QrWifiInput): QrBuildResult {
  if (type === "url") {
    const raw = (input as Record<string, string>).url?.trim() ?? "";
    if (!raw) return { ok: false, error: "Introduce una URL." };
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return { ok: false, error: "La URL no es válida. Incluye el protocolo, por ejemplo https://ejemplo.com." };
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { ok: false, error: "Solo se permiten URLs http:// o https://." };
    }
    return { ok: true, payload: url.toString() };
  }

  if (type === "text") {
    const text = (input as Record<string, string>).text?.trim() ?? "";
    if (!text) return { ok: false, error: "Introduce un texto." };
    if (/^(javascript|data|vbscript):/i.test(text)) {
      return { ok: false, error: "El contenido no puede comenzar con un esquema ejecutable." };
    }
    return { ok: true, payload: text };
  }

  if (type === "email") {
    const email = (input as Record<string, string>).email?.trim() ?? "";
    const subject = (input as Record<string, string>).subject?.trim() ?? "";
    const body = (input as Record<string, string>).body?.trim() ?? "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Introduce un correo electrónico válido." };
    const params = new URLSearchParams();
    if (subject) params.set("subject", subject);
    if (body) params.set("body", body);
    const query = params.toString();
    return { ok: true, payload: `mailto:${email}${query ? `?${query}` : ""}` };
  }

  if (type === "phone") {
    const phone = (input as Record<string, string>).phone?.trim() ?? "";
    if (!/^\+?[0-9\s()-]{5,20}$/.test(phone)) return { ok: false, error: "Introduce un número de teléfono válido." };
    return { ok: true, payload: `tel:${phone.replace(/[\s()-]/g, "")}` };
  }

  if (type === "sms") {
    const phone = (input as Record<string, string>).phone?.trim() ?? "";
    const message = (input as Record<string, string>).message?.trim() ?? "";
    if (!/^\+?[0-9\s()-]{5,20}$/.test(phone)) return { ok: false, error: "Introduce un número de teléfono válido." };
    const cleanPhone = phone.replace(/[\s()-]/g, "");
    return { ok: true, payload: message ? `sms:${cleanPhone}?body=${encodeURIComponent(message)}` : `sms:${cleanPhone}` };
  }

  if (type === "wifi") {
    const wifi = input as QrWifiInput;
    if (!wifi.ssid?.trim()) return { ok: false, error: "Introduce el nombre de la red (SSID)." };
    if (wifi.encryption !== "nopass" && !wifi.password?.trim()) return { ok: false, error: "Introduce la contraseña de la red." };
    const payload = `WIFI:T:${wifi.encryption};S:${escapeWifiValue(wifi.ssid)};${
      wifi.encryption === "nopass" ? "" : `P:${escapeWifiValue(wifi.password)};`
    }${wifi.hidden ? "H:true;" : ""};`;
    return { ok: true, payload };
  }

  return { ok: false, error: "Tipo de contenido no reconocido." };
}
