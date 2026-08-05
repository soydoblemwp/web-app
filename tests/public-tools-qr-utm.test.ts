import { describe, expect, it } from "vitest";
import { buildQrPayload } from "@/lib/public-tools/qr-content";
import { buildUtmUrl, validateBaseUrl, UTM_PRESETS } from "@/lib/public-tools/utm";

// ---------------------------------------------------------------------------
// Generador de códigos QR (spec section 15, section 39 'QR')
// ---------------------------------------------------------------------------
describe("qr-content.ts: buildQrPayload", () => {
  it("accepts a valid https URL", () => {
    const result = buildQrPayload("url", { url: "https://ejemplo.com/pagina" });
    expect(result.ok).toBe(true);
    expect(result.payload).toBe("https://ejemplo.com/pagina");
  });

  it("rejects a javascript: URL", () => {
    const result = buildQrPayload("url", { url: "javascript:alert(1)" });
    expect(result.ok).toBe(false);
  });

  it("rejects a data: URL", () => {
    const result = buildQrPayload("url", { url: "data:text/html,<script>alert(1)</script>" });
    expect(result.ok).toBe(false);
  });

  it("rejects plain text passed as a URL", () => {
    const result = buildQrPayload("url", { url: "no es una url" });
    expect(result.ok).toBe(false);
  });

  it("accepts plain text for the text type", () => {
    const result = buildQrPayload("text", { text: "Hola, este es un mensaje" });
    expect(result.ok).toBe(true);
  });

  it("rejects text beginning with a dangerous scheme even for the text type", () => {
    const result = buildQrPayload("text", { text: "javascript:alert(1)" });
    expect(result.ok).toBe(false);
  });

  it("builds a valid mailto: payload for email", () => {
    const result = buildQrPayload("email", { email: "hola@ejemplo.com", subject: "Asunto", body: "Cuerpo" });
    expect(result.ok).toBe(true);
    expect(result.payload).toMatch(/^mailto:hola@ejemplo\.com\?/);
  });

  it("rejects an invalid email address", () => {
    const result = buildQrPayload("email", { email: "no-es-un-correo" });
    expect(result.ok).toBe(false);
  });

  it("builds a valid tel: payload for phone", () => {
    const result = buildQrPayload("phone", { phone: "+34 600 123 456" });
    expect(result.ok).toBe(true);
    expect(result.payload).toBe("tel:+34600123456");
  });

  it("rejects an invalid phone number", () => {
    const result = buildQrPayload("phone", { phone: "abc" });
    expect(result.ok).toBe(false);
  });

  it("builds a valid sms: payload", () => {
    const result = buildQrPayload("sms", { phone: "600123456", message: "Hola" });
    expect(result.ok).toBe(true);
    expect(result.payload).toMatch(/^sms:600123456\?body=/);
  });

  it("builds a valid WIFI: payload with WPA encryption", () => {
    const result = buildQrPayload("wifi", { ssid: "MiRed", password: "clave1234", encryption: "WPA", hidden: false });
    expect(result.ok).toBe(true);
    expect(result.payload).toMatch(/^WIFI:T:WPA;S:MiRed;P:clave1234;;$/);
  });

  it("builds a WIFI: payload without a password field when encryption is nopass", () => {
    const result = buildQrPayload("wifi", { ssid: "RedAbierta", password: "", encryption: "nopass", hidden: false });
    expect(result.ok).toBe(true);
    expect(result.payload).not.toContain("P:");
  });

  it("rejects wifi input without an SSID", () => {
    const result = buildQrPayload("wifi", { ssid: "", password: "x", encryption: "WPA", hidden: false });
    expect(result.ok).toBe(false);
  });

  it("escapes special characters in the wifi SSID/password", () => {
    const result = buildQrPayload("wifi", { ssid: 'Red;con"caracteres', password: "clave", encryption: "WPA", hidden: false });
    expect(result.ok).toBe(true);
    expect(result.payload).toContain("Red\\;con\\\"caracteres");
  });
});

// ---------------------------------------------------------------------------
// Generador de enlaces UTM (spec section 17, section 39 'UTM')
// ---------------------------------------------------------------------------
describe("utm.ts: validateBaseUrl", () => {
  it("accepts a valid https URL", () => {
    expect(validateBaseUrl("https://ejemplo.com").ok).toBe(true);
  });

  it("rejects a javascript: URL", () => {
    expect(validateBaseUrl("javascript:alert(1)").ok).toBe(false);
  });

  it("rejects a malformed URL", () => {
    expect(validateBaseUrl("no es una url").ok).toBe(false);
  });
});

describe("utm.ts: buildUtmUrl", () => {
  const base = { url: "https://ejemplo.com/pagina", source: "newsletter", medium: "email", campaign: "verano" };

  it("builds a URL with all required UTM parameters", () => {
    const result = buildUtmUrl(base);
    expect(result.ok).toBe(true);
    expect(result.finalUrl).toContain("utm_source=newsletter");
    expect(result.finalUrl).toContain("utm_medium=email");
    expect(result.finalUrl).toContain("utm_campaign=verano");
  });

  it("requires source, medium and campaign", () => {
    expect(buildUtmUrl({ ...base, source: "" }).ok).toBe(false);
    expect(buildUtmUrl({ ...base, medium: "" }).ok).toBe(false);
    expect(buildUtmUrl({ ...base, campaign: "" }).ok).toBe(false);
  });

  it("detects existing UTM parameters on the base URL", () => {
    const result = buildUtmUrl({ ...base, url: "https://ejemplo.com/pagina?utm_source=old" });
    expect(result.ok).toBe(true);
    expect(result.existingUtmParams).toContain("utm_source");
  });

  it("reports no existing UTM parameters for a clean URL", () => {
    const result = buildUtmUrl(base);
    expect(result.existingUtmParams).toEqual([]);
  });

  it("URL-encodes parameter values correctly", () => {
    const result = buildUtmUrl({ ...base, campaign: "verano 2026" });
    expect(result.finalUrl).toContain("utm_campaign=verano+2026");
  });

  it("includes optional term and content only when provided", () => {
    const withOptional = buildUtmUrl({ ...base, term: "zapatos", content: "banner-superior" });
    expect(withOptional.finalUrl).toContain("utm_term=zapatos");
    expect(withOptional.finalUrl).toContain("utm_content=banner-superior");
    const withoutOptional = buildUtmUrl(base);
    expect(withoutOptional.finalUrl).not.toContain("utm_term");
  });

  it("rejects a base URL using a dangerous scheme", () => {
    expect(buildUtmUrl({ ...base, url: "javascript:alert(1)" }).ok).toBe(false);
  });
});

describe("utm.ts: presets", () => {
  it("has a preset for every required platform", () => {
    const ids = UTM_PRESETS.map((p) => p.id);
    for (const expected of ["newsletter", "facebook", "instagram", "tiktok", "linkedin", "youtube", "paid"]) {
      expect(ids).toContain(expected);
    }
  });
});
