export interface ParsePageRangeResult {
  ok: boolean;
  error?: string;
  /** 0-based page indices, in the order the user specified them (never auto-sorted — a range like "3,1" is honored as written). */
  indices?: number[];
  duplicatesRemoved?: number;
}

/**
 * Parses a human page-range string ("1-3", "1,3,5", "1-3,7,10-12") into
 * validated, 0-based page indices — shared by Dividir PDF, Marca de agua
 * (páginas específicas) and Numerar páginas (spec sections 11, 15, 16).
 */
export function parsePageRange(raw: string, pageCount: number, options: { keepDuplicates?: boolean } = {}): ParsePageRangeResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Introduce un rango de páginas, por ejemplo 1-3,7." };
  if (!/^[\d,\- ]+$/.test(trimmed)) return { ok: false, error: "El rango contiene caracteres no válidos. Usa solo números, comas y guiones." };

  const indices: number[] = [];
  const segments = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return { ok: false, error: "Introduce un rango de páginas, por ejemplo 1-3,7." };

  for (const segment of segments) {
    const rangeMatch = /^(\d+)-(\d+)$/.exec(segment);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (start < 1 || end < 1) return { ok: false, error: "Las páginas deben ser números mayores que 0." };
      if (start > end) return { ok: false, error: `El rango "${segment}" es inválido: el inicio es mayor que el final.` };
      if (end > pageCount) return { ok: false, error: `La página ${end} no existe. El documento tiene ${pageCount} páginas.` };
      for (let page = start; page <= end; page++) indices.push(page - 1);
      continue;
    }

    const singleMatch = /^(\d+)$/.exec(segment);
    if (singleMatch) {
      const page = Number(singleMatch[1]);
      if (page < 1) return { ok: false, error: "Las páginas deben ser números mayores que 0." };
      if (page > pageCount) return { ok: false, error: `La página ${page} no existe. El documento tiene ${pageCount} páginas.` };
      indices.push(page - 1);
      continue;
    }

    return { ok: false, error: `"${segment}" no es un número ni un rango válido.` };
  }

  if (options.keepDuplicates) {
    return { ok: true, indices, duplicatesRemoved: 0 };
  }

  const seen = new Set<number>();
  const deduped: number[] = [];
  let duplicatesRemoved = 0;
  for (const index of indices) {
    if (seen.has(index)) {
      duplicatesRemoved++;
      continue;
    }
    seen.add(index);
    deduped.push(index);
  }

  return { ok: true, indices: deduped, duplicatesRemoved };
}

/** The complementary page set — every index NOT selected by the range, in ascending order (used by "eliminar páginas y conservar el resto"). */
export function invertPageSelection(selectedIndices: number[], pageCount: number): number[] {
  const selected = new Set(selectedIndices);
  const kept: number[] = [];
  for (let i = 0; i < pageCount; i++) if (!selected.has(i)) kept.push(i);
  return kept;
}
