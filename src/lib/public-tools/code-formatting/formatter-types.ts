export type WebCodeLanguage = "html" | "css" | "javascript" | "typescript" | "jsx" | "tsx";

export const WEB_CODE_LANGUAGES: { id: WebCodeLanguage; label: string; extension: string }[] = [
  { id: "html", label: "HTML", extension: "html" },
  { id: "css", label: "CSS", extension: "css" },
  { id: "javascript", label: "JavaScript", extension: "js" },
  { id: "typescript", label: "TypeScript", extension: "ts" },
  { id: "jsx", label: "JSX", extension: "jsx" },
  { id: "tsx", label: "TSX", extension: "tsx" },
];

export interface WebCodeFormatOptions {
  language: WebCodeLanguage;
  printWidth: number;
  useTabs: boolean;
  tabWidth: number;
  semi: boolean;
  singleQuote: boolean;
}

export interface CodeDiagnostic {
  message: string;
  line: number | null;
  column: number | null;
  snippet: string | null;
}

export interface WebCodeFormatResult {
  ok: boolean;
  error?: CodeDiagnostic;
  formatted?: string;
}

/** A crude, display-only heuristic — never a replacement for actually selecting the language, only a starting suggestion the visitor can override (spec: "detectar lenguaje de forma orientativa"). */
export function guessWebCodeLanguage(code: string): WebCodeLanguage {
  const trimmed = code.trim();
  if (/^</.test(trimmed) && /<\/?(html|div|span|body|head|!doctype)/i.test(trimmed)) return "html";
  if (/^[.#@]|\{[\s\S]*:[\s\S]*;/.test(trimmed) && !/function|const |let |import /.test(trimmed)) return "css";
  if (/:\s*(string|number|boolean|void|unknown|any)\b|interface\s+\w+|<\w+>\(/.test(trimmed)) {
    return /<[A-Z]\w*[\s>]/.test(trimmed) ? "tsx" : "typescript";
  }
  if (/<[A-Z]\w*[\s>]/.test(trimmed)) return "jsx";
  return "javascript";
}
