/**
 * CSP heuristic analyzer (spec section 22). Every finding is a static,
 * local judgement about the policy text itself — this module never loads
 * a URL, never tests the policy against a real page, and never claims a
 * policy blocks "all XSS" (spec: "CSP es una capa adicional y no
 * sustituye el escape, la validación y el saneamiento del contenido").
 */
import { parseCsp, isKnownCspDirective, type ParsedCsp } from "./csp-parser";

export type CspFindingSeverity = "error" | "warning" | "info";

export interface CspFinding {
  severity: CspFindingSeverity;
  directive?: string;
  message: string;
}

const CSP_KEYWORDS_NEEDING_QUOTES = ["self", "none", "unsafe-inline", "unsafe-eval", "unsafe-hashes", "strict-dynamic", "wasm-unsafe-eval", "report-sample"];
const FETCH_DIRECTIVES = new Set(["default-src", "script-src", "style-src", "img-src", "font-src", "connect-src", "media-src", "worker-src", "frame-src", "child-src", "manifest-src", "object-src"]);

function looksLikeUnknownSource(token: string): boolean {
  if (token.startsWith("'") && token.endsWith("'")) return false; // a keyword/nonce/hash, quoted
  if (["*", "data:", "blob:", "filesystem:", "mediastream:", "https:", "http:", "ws:", "wss:"].includes(token)) return false;
  if (/^[a-z][a-z0-9+.-]*:$/i.test(token)) return false; // any scheme:
  if (/^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)*(:[0-9*]+)?(\/.*)?$/i.test(token)) return false; // a plausible host[:port][/path], with optional leading wildcard subdomain
  if (/^https?:\/\//i.test(token)) return false; // a full origin
  return true;
}

export function analyzeCsp(policyText: string): CspFinding[] {
  const findings: CspFinding[] = [];
  const trimmed = policyText.trim();
  if (trimmed.length === 0) {
    return [{ severity: "error", message: "La política está vacía." }];
  }

  const parsed = parseCsp(trimmed);

  for (const name of parsed.duplicateDirectiveNames) {
    findings.push({ severity: "warning", directive: name, message: `La directiva "${name}" aparece más de una vez. Los navegadores solo aplican la primera aparición; las siguientes se ignoran.` });
  }

  for (const occurrence of parsed.directives) {
    if (!isKnownCspDirective(occurrence.name)) {
      findings.push({ severity: "warning", directive: occurrence.name, message: `"${occurrence.name}" no es una directiva CSP reconocida por esta herramienta; revisa si está bien escrita.` });
      continue;
    }
    for (const source of occurrence.sources) {
      const bare = source.toLowerCase();
      if (CSP_KEYWORDS_NEEDING_QUOTES.includes(bare)) {
        findings.push({ severity: "error", directive: occurrence.name, message: `"${source}" aparece sin comillas simples. Sin comillas, CSP lo interpreta como un nombre de host literal (por ejemplo, un sitio llamado "${source}"), no como la palabra clave '${source}'. Probablemente quisiste escribir '${source}'.` });
      }
    }
    if (FETCH_DIRECTIVES.has(occurrence.name)) {
      if (occurrence.sources.some((s) => s === "*" || s === "http://*" || s === "https://*")) {
        findings.push({ severity: "warning", directive: occurrence.name, message: `"${occurrence.name}" permite cualquier origen (comodín amplio). Considera restringirlo a los orígenes que realmente necesitas.` });
      }
      if (occurrence.sources.map((s) => s.toLowerCase()).includes("'unsafe-inline'")) {
        findings.push({ severity: "warning", directive: occurrence.name, message: `"${occurrence.name}" incluye 'unsafe-inline', que permite scripts/estilos en línea y reduce buena parte de la protección de CSP frente a XSS.` });
      }
      if (occurrence.name === "script-src" && occurrence.sources.map((s) => s.toLowerCase()).includes("'unsafe-eval'")) {
        findings.push({ severity: "warning", directive: occurrence.name, message: `"script-src" incluye 'unsafe-eval', que permite eval()/new Function() y construcciones equivalentes.` });
      }
      if ((occurrence.name === "script-src" || occurrence.name === "object-src" || occurrence.name === "default-src") && occurrence.sources.includes("data:")) {
        findings.push({ severity: "warning", directive: occurrence.name, message: `"${occurrence.name}" permite el esquema data:, que puede usarse para incrustar scripts u objetos sin pasar por la red.` });
      }
      const hasNonceOrHash = occurrence.sources.some((s) => /^'nonce-/.test(s) || /^'sha(256|384|512)-/.test(s));
      const hasStrictDynamic = occurrence.sources.map((s) => s.toLowerCase()).includes("'strict-dynamic'");
      if (hasStrictDynamic && occurrence.sources.some((s) => !s.startsWith("'") && s !== "*")) {
        findings.push({ severity: "info", directive: occurrence.name, message: `"${occurrence.name}" combina 'strict-dynamic' con hosts explícitos. En navegadores que soportan 'strict-dynamic', esos hosts se ignoran para scripts cargados dinámicamente; solo cuentan el nonce/hash.` });
      }
      if (hasNonceOrHash && occurrence.sources.map((s) => s.toLowerCase()).includes("'unsafe-inline'")) {
        findings.push({ severity: "info", directive: occurrence.name, message: `"${occurrence.name}" combina un nonce/hash con 'unsafe-inline'. Esto es una práctica de compatibilidad válida: los navegadores modernos ignoran 'unsafe-inline' cuando hay un nonce/hash, y los antiguos (que no soportan nonces) usan 'unsafe-inline' en su lugar.` });
      }
      for (const source of occurrence.sources) {
        if (source.startsWith("http://")) findings.push({ severity: "warning", directive: occurrence.name, message: `"${occurrence.name}" incluye una fuente http:// (${source}) sin cifrar; en un sitio HTTPS esto puede degradar la seguridad del recurso cargado.` });
        else if (looksLikeUnknownSource(source)) findings.push({ severity: "info", directive: occurrence.name, message: `"${source}" en "${occurrence.name}" no coincide con ningún patrón reconocido de host, esquema, nonce o hash; revisa que esté bien escrito.` });
      }
    }
  }

  const hasDefaultSrc = parsed.byName.has("default-src");
  if (!hasDefaultSrc) {
    findings.push({ severity: "warning", message: "No hay \"default-src\". Cualquier directiva de recursos (fetch) que no se especifique explícitamente queda sin restringir por CSP." });
  }
  if (!parsed.byName.has("object-src") && !(hasDefaultSrc && parsed.byName.get("default-src")?.[0]?.sources.includes("'none'"))) {
    findings.push({ severity: "warning", message: "No hay \"object-src\". Se recomienda \"object-src 'none'\" salvo que necesites <object>/<embed>/<applet>." });
  }
  if (!parsed.byName.has("base-uri")) {
    findings.push({ severity: "warning", message: "No hay \"base-uri\". Sin restringirla, una inyección podría cambiar la URL base del documento (<base href>) y redirigir recursos relativos." });
  }
  if (!parsed.byName.has("frame-ancestors")) {
    findings.push({ severity: "info", message: "No hay \"frame-ancestors\". Sin ella, CSP no restringe quién puede incrustar esta página en un <iframe> (esto lo controla X-Frame-Options si se usa aparte)." });
  }
  if (!parsed.byName.has("form-action")) {
    findings.push({ severity: "info", message: "No hay \"form-action\". Sin ella, CSP no restringe a dónde pueden enviarse los formularios." });
  }

  return findings;
}

export interface CspAnalysisSummary {
  findings: CspFinding[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  parsed: ParsedCsp;
}

export function analyzeCspWithSummary(policyText: string): CspAnalysisSummary {
  const findings = analyzeCsp(policyText);
  const parsed = parseCsp(policyText);
  return {
    findings,
    errorCount: findings.filter((f) => f.severity === "error").length,
    warningCount: findings.filter((f) => f.severity === "warning").length,
    infoCount: findings.filter((f) => f.severity === "info").length,
    parsed,
  };
}
