import { rgb } from "pdf-lib";
import { createPdfKit, drawLine, drawParagraph, drawHorizontalRule, drawRect, ensureSpace, embedImageAuto, finalizePdf, type RgbColor, type FontFamily } from "@/lib/public-tools/documents/pdf-kit";
import { PAGE_SIZES_PT } from "@/lib/public-tools/documents/measurements";
import { hexToRgb } from "@/lib/public-tools/color-contrast";
import { RESUME_SECTION_LABELS, type ResumeData, type ResumeTemplateId } from "./resume";

/**
 * Five genuinely distinct, single-column, text-based templates (never
 * rasterized full pages — spec section 11: "prioriza texto real... evita
 * rasterizar toda la página"). Each differs by real structural properties
 * (font family, margin, header treatment, heading case/rule style, type
 * scale) — never only by accent color, per the Fase 47 correction ("no
 * dupliques la misma estructura cambiando únicamente el color"). All five
 * keep a strict logical reading order (name → contact → summary → sections
 * in order) so the underlying PDF text layer reads sensibly top-to-bottom.
 */
interface TemplateConfig {
  fontFamily: FontFamily;
  margin: number;
  nameSize: number;
  bodySize: number;
  headingSize: number;
  headerStyle: "plain" | "accent-rule" | "banner";
  headingCase: "normal" | "upper";
  headingRule: "none" | "line" | "underline";
  entrySpacing: number;
}

const TEMPLATE_CONFIG: Record<ResumeTemplateId, TemplateConfig> = {
  simple: { fontFamily: "helvetica", margin: 44, nameSize: 20, bodySize: 9.5, headingSize: 11.5, headerStyle: "plain", headingCase: "normal", headingRule: "line", entrySpacing: 5 },
  professional: { fontFamily: "helvetica", margin: 44, nameSize: 22, bodySize: 9.5, headingSize: 11.5, headerStyle: "accent-rule", headingCase: "normal", headingRule: "line", entrySpacing: 5 },
  modern: { fontFamily: "helvetica", margin: 36, nameSize: 22, bodySize: 9.5, headingSize: 10.5, headerStyle: "banner", headingCase: "upper", headingRule: "none", entrySpacing: 5 },
  compact: { fontFamily: "helvetica", margin: 32, nameSize: 18, bodySize: 8.5, headingSize: 10, headerStyle: "plain", headingCase: "normal", headingRule: "none", entrySpacing: 2 },
  academic: { fontFamily: "times", margin: 50, nameSize: 20, bodySize: 10, headingSize: 11, headerStyle: "plain", headingCase: "upper", headingRule: "underline", entrySpacing: 6 },
};

function accentRgb(hex: string): RgbColor {
  const rgbTuple = hexToRgb(hex);
  return rgbTuple ? [rgbTuple[0] / 255, rgbTuple[1] / 255, rgbTuple[2] / 255] : [0.15, 0.39, 0.92];
}

function headingText(text: string, config: TemplateConfig): string {
  return config.headingCase === "upper" ? text.toLocaleUpperCase("es-ES") : text;
}

export async function buildResumePdf(data: ResumeData): Promise<Uint8Array> {
  const config = TEMPLATE_CONFIG[data.template];
  const accent = accentRgb(data.accentColorHex);
  const ctx = await createPdfKit(PAGE_SIZES_PT.LETTER, config.margin, config.fontFamily);
  const c = data.contact;

  if (config.headerStyle === "banner") {
    const bannerHeight = 70;
    drawRect(ctx, 0, ctx.pageHeight - bannerHeight, ctx.pageWidth, bannerHeight, { color: accent });
    ctx.y = ctx.pageHeight - 30;
    drawLine(ctx, c.fullName || "Nombre completo", { size: config.nameSize, font: ctx.bold, color: [1, 1, 1] });
    if (c.jobTitle) drawLine(ctx, c.jobTitle, { size: config.bodySize + 2, color: [1, 1, 1] });
    ctx.y = ctx.pageHeight - bannerHeight - 16;
  } else {
    if (data.photoEnabled && data.photoPngBytes && data.photoPngBytes.length > 0) {
      const image = await embedImageAuto(ctx, new Uint8Array(data.photoPngBytes), "image/png");
      if (image) {
        const size = 60;
        const scale = Math.min(1, size / Math.max(image.width, image.height));
        ctx.page.drawImage(image, { x: ctx.pageWidth - ctx.margin - image.width * scale, y: ctx.pageHeight - ctx.margin - image.height * scale, width: image.width * scale, height: image.height * scale });
      }
    }
    drawLine(ctx, c.fullName || "Nombre completo", { size: config.nameSize, font: ctx.bold, color: config.headerStyle === "accent-rule" ? accent : undefined });
    if (c.jobTitle) drawLine(ctx, c.jobTitle, { size: config.bodySize + 2, color: [0.35, 0.35, 0.35] });
  }

  const contactLine = [c.city && c.region ? `${c.city}, ${c.region}` : c.city || c.region, c.phone, c.email, c.website, c.linkedin, c.portfolio].filter(Boolean).join("   ·   ");
  if (contactLine) drawLine(ctx, contactLine, { size: config.bodySize - 0.5, color: config.headerStyle === "banner" ? [0.3, 0.3, 0.3] : [0.4, 0.4, 0.4] });

  if (config.headerStyle === "accent-rule") {
    ctx.y -= 2;
    ctx.page.drawLine({ start: { x: ctx.margin, y: ctx.y }, end: { x: ctx.pageWidth - ctx.margin, y: ctx.y }, thickness: 2, color: rgb(...accent) });
    ctx.y -= 12;
  } else if (config.headerStyle === "plain") {
    drawHorizontalRule(ctx, { gapAfter: 10 });
  } else {
    ctx.y -= 6;
  }

  if (c.summary) {
    drawParagraph(ctx, c.summary, { size: config.bodySize });
    ctx.y -= 6;
  }

  for (const section of data.sections) {
    if (section.hidden) continue;
    const visibleEntries = section.entries.filter((e) => !e.hidden);
    if (visibleEntries.length === 0) continue;

    ensureSpace(ctx, config.headingSize + 10);
    const title = headingText(section.title || RESUME_SECTION_LABELS[section.kind], config);
    drawLine(ctx, title, { size: config.headingSize, font: ctx.bold, color: config.headerStyle === "accent-rule" || config.headerStyle === "banner" ? accent : undefined });
    if (config.headingRule === "line") drawHorizontalRule(ctx, { gapAfter: 4, thickness: 0.5 });
    else if (config.headingRule === "underline") {
      ctx.y += config.headingSize - 2;
      const width = ctx.bold.widthOfTextAtSize(title, config.headingSize);
      ctx.page.drawLine({ start: { x: ctx.margin, y: ctx.y }, end: { x: ctx.margin + width, y: ctx.y }, thickness: 0.75, color: rgb(0.2, 0.2, 0.2) });
      ctx.y -= config.headingSize + 2;
    }

    for (const entry of visibleEntries) {
      const header = [entry.title, entry.organization].filter(Boolean).join(", ");
      const dateRange = entry.current ? `${entry.startDate} — Actualidad` : [entry.startDate, entry.endDate].filter(Boolean).join(" — ");
      ensureSpace(ctx, config.bodySize + 4);
      if (header) ctx.page.drawText(header, { x: ctx.margin, y: ctx.y, size: config.bodySize, font: ctx.bold });
      if (dateRange) {
        const w = ctx.font.widthOfTextAtSize(dateRange, config.bodySize - 0.5);
        ctx.page.drawText(dateRange, { x: ctx.pageWidth - ctx.margin - w, y: ctx.y, size: config.bodySize - 0.5, font: ctx.font, color: rgb(0.4, 0.4, 0.4) });
      }
      ctx.y -= config.bodySize + 3;
      if (entry.location) drawLine(ctx, entry.location, { size: config.bodySize - 1, color: [0.45, 0.45, 0.45] });
      if (entry.description) drawParagraph(ctx, entry.description, { size: config.bodySize });
      for (const bullet of entry.bullets) {
        if (!bullet.trim()) continue;
        drawParagraph(ctx, `•  ${bullet}`, { size: config.bodySize, maxWidth: ctx.pageWidth - ctx.margin * 2 - 10, x: ctx.margin + 4 });
      }
      ctx.y -= config.entrySpacing;
    }
    ctx.y -= config.entrySpacing < 4 ? 2 : 4;
  }

  return finalizePdf(ctx);
}
