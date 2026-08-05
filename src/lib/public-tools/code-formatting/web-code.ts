/**
 * HTML/CSS/JavaScript/TypeScript/JSX/TSX formatter core (spec section 18),
 * via Prettier's `standalone` build — a real parser (Babel/TypeScript/
 * PostCSS/Prettier's own HTML parser) that only builds an AST and reprints
 * it. Prettier never evaluates the code: it doesn't run `<script>` tags,
 * event handlers, imports, or CSS; it doesn't touch the DOM. Every plugin
 * is dynamically imported here (never at module scope), so nothing loads
 * until a format actually runs, and only inside the Worker that calls this
 * (spec section 27: "no cargues Prettier... globalmente").
 */
import { DOCUMENT_LIMITS } from "../documents/limits";
import type { WebCodeFormatOptions, WebCodeFormatResult, WebCodeLanguage } from "./formatter-types";

const LIMITS = DOCUMENT_LIMITS.codeFormatting;

async function loadPlugins(language: WebCodeLanguage) {
  const prettier = await import("prettier/standalone");
  switch (language) {
    case "html": {
      const [html, postcss, babel, estree] = await Promise.all([import("prettier/plugins/html"), import("prettier/plugins/postcss"), import("prettier/plugins/babel"), import("prettier/plugins/estree")]);
      return { prettier, parser: "html" as const, plugins: [html.default, postcss.default, babel.default, estree.default] };
    }
    case "css": {
      const postcss = await import("prettier/plugins/postcss");
      return { prettier, parser: "css" as const, plugins: [postcss.default] };
    }
    case "javascript":
    case "jsx": {
      const [babel, estree] = await Promise.all([import("prettier/plugins/babel"), import("prettier/plugins/estree")]);
      return { prettier, parser: "babel" as const, plugins: [babel.default, estree.default] };
    }
    case "typescript":
    case "tsx": {
      const [ts, estree] = await Promise.all([import("prettier/plugins/typescript"), import("prettier/plugins/estree")]);
      return { prettier, parser: "typescript" as const, plugins: [ts.default, estree.default] };
    }
  }
}

function safeErrorSnippet(code: string, line: number | null): string | null {
  if (line === null) return null;
  const lines = code.split("\n");
  const idx = line - 1;
  if (idx < 0 || idx >= lines.length) return null;
  return lines[idx].slice(0, 200);
}

export async function formatWebCode(code: string, options: WebCodeFormatOptions): Promise<WebCodeFormatResult> {
  if (code.length > LIMITS.maxCodeLength) {
    return { ok: false, error: { message: `El código supera el límite de ${LIMITS.maxCodeLength.toLocaleString("es-ES")} caracteres.`, line: null, column: null, snippet: null } };
  }

  const { prettier, parser, plugins } = await loadPlugins(options.language);

  try {
    const formatted = await prettier.format(code, {
      parser,
      plugins,
      printWidth: options.printWidth,
      useTabs: options.useTabs,
      tabWidth: options.tabWidth,
      semi: options.semi,
      singleQuote: options.singleQuote,
    });
    return { ok: true, formatted };
  } catch (err) {
    const loc = (err as { loc?: { start?: { line?: number; column?: number } } }).loc;
    const line = loc?.start?.line ?? null;
    const column = loc?.start?.column ?? null;
    const firstLine = err instanceof Error ? err.message.split("\n")[0] : "No se pudo formatear el código.";
    return {
      ok: false,
      error: { message: firstLine, line, column, snippet: safeErrorSnippet(code, line) },
    };
  }
}
