import type { AiToolDefinition } from "@/lib/ai-center/tools/types";
import {
  buildSubjectLineSystemPrompt,
  buildSubjectLinePrompt,
  buildEmailWriterSystemPrompt,
  buildEmailWriterPrompt,
  buildWelcomeEmailSystemPrompt,
  buildWelcomeEmailPrompt,
  buildNewsletterSystemPrompt,
  buildNewsletterPrompt,
  buildPromotionalEmailSystemPrompt,
  buildPromotionalEmailPrompt,
  buildFollowUpEmailSystemPrompt,
  buildFollowUpEmailPrompt,
  buildAbandonedCartEmailSystemPrompt,
  buildAbandonedCartEmailPrompt,
  buildColdEmailSystemPrompt,
  buildColdEmailPrompt,
  buildEmailSequenceSystemPrompt,
  buildEmailSequencePrompt,
  buildCtaEmailOptimizerSystemPrompt,
  buildCtaEmailOptimizerPrompt,
} from "@/lib/ai-center/tools/email-marketing-prompts";

/**
 * Every fully-implemented Email Marketing AI tool, as a declarative
 * definition the generic AiGenerationForm engine can render — same pattern
 * as youtube.ts, instagram.ts, social-media.ts and blog-seo.ts. Registering
 * these in src/lib/ai-center/tools/registry.ts is the only wiring Chat
 * IA's intent router needs to start using them automatically.
 */
export const EMAIL_MARKETING_TOOLS: AiToolDefinition[] = [
  {
    slug: "email-subject-line",
    routeSegment: "subject-line",
    label: "Subject Line Generator",
    description: "Genera asuntos de email que generan curiosidad, sin prometer tasas de apertura.",
    fields: [
      { name: "tema", label: "Tema del email", type: "textarea", required: true, maxLength: 500 },
      { name: "tono", label: "Tono", type: "text", defaultValue: "Cercano y profesional", maxLength: 200, required: true },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
      { name: "cantidad", label: "Cantidad de opciones", type: "number", defaultValue: 5, min: 1, max: 10, required: true },
    ],
    buildSystemPrompt: buildSubjectLineSystemPrompt,
    buildUserPrompt: (v) => buildSubjectLinePrompt({ tema: v.tema, tono: v.tono, idioma: v.idioma, cantidad: v.cantidad }),
    outputMode: "list",
    buildItemTitle: (v) => `Asuntos de email: ${v.tema}`,
    contentType: "TITLE",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "email-writer",
    routeSegment: "writer",
    label: "Email Writer",
    description: "Redacta un email completo con asunto, cuerpo y llamada a la acción.",
    fields: [
      { name: "tema", label: "Tema", type: "textarea", required: true, maxLength: 500 },
      { name: "objetivo", label: "Objetivo del email", type: "text", required: true, maxLength: 300 },
      { name: "tono", label: "Tono", type: "text", defaultValue: "Cercano y profesional", maxLength: 200, required: true },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildEmailWriterSystemPrompt,
    buildUserPrompt: (v) => buildEmailWriterPrompt({ tema: v.tema, objetivo: v.objetivo, tono: v.tono, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: (v) => `Email: ${v.tema}`,
    contentType: "EMAIL",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "email-welcome",
    routeSegment: "welcome",
    label: "Welcome Email Generator",
    description: "Genera un email de bienvenida para nuevos suscriptores o clientes.",
    fields: [
      { name: "marca", label: "Marca o producto", type: "text", required: true, maxLength: 200 },
      { name: "propuestaValor", label: "Propuesta de valor", type: "textarea", required: true, maxLength: 500 },
      { name: "tono", label: "Tono", type: "text", defaultValue: "Cercano y profesional", maxLength: 200, required: true },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildWelcomeEmailSystemPrompt,
    buildUserPrompt: (v) =>
      buildWelcomeEmailPrompt({ marca: v.marca, propuestaValor: v.propuestaValor, tono: v.tono, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: (v) => `Bienvenida: ${v.marca}`,
    contentType: "EMAIL",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "email-newsletter",
    routeSegment: "newsletter",
    label: "Newsletter Generator",
    description: "Genera una newsletter estructurada en secciones a partir de los temas indicados.",
    fields: [
      { name: "tema", label: "Tema general", type: "text", required: true, maxLength: 300 },
      { name: "secciones", label: "Temas o secciones a cubrir", type: "textarea", required: true, maxLength: 1500 },
      { name: "tono", label: "Tono", type: "text", defaultValue: "Cercano y profesional", maxLength: 200, required: true },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildNewsletterSystemPrompt,
    buildUserPrompt: (v) =>
      buildNewsletterPrompt({ tema: v.tema, secciones: v.secciones, tono: v.tono, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: (v) => `Newsletter: ${v.tema}`,
    contentType: "NEWSLETTER",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "email-promotional",
    routeSegment: "promotional",
    label: "Promotional Email Generator",
    description: "Genera un email promocional usando únicamente los datos de la oferta que proporciones.",
    fields: [
      { name: "oferta", label: "Oferta o producto", type: "textarea", required: true, maxLength: 500 },
      { name: "fechaLimite", label: "Fecha límite (opcional)", type: "text", maxLength: 100 },
      { name: "tono", label: "Tono", type: "text", defaultValue: "Cercano y profesional", maxLength: 200, required: true },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildPromotionalEmailSystemPrompt,
    buildUserPrompt: (v) =>
      buildPromotionalEmailPrompt({ oferta: v.oferta, fechaLimite: v.fechaLimite, tono: v.tono, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: (v) => `Promocional: ${v.oferta}`,
    contentType: "EMAIL",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "email-followup",
    routeSegment: "follow-up",
    label: "Follow-Up Email Generator",
    description: "Genera un email de seguimiento respetuoso y útil.",
    fields: [
      { name: "contexto", label: "Contexto de la interacción previa", type: "textarea", required: true, maxLength: 1000 },
      { name: "objetivo", label: "Objetivo del seguimiento", type: "text", required: true, maxLength: 300 },
      { name: "tono", label: "Tono", type: "text", defaultValue: "Cercano y profesional", maxLength: 200, required: true },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildFollowUpEmailSystemPrompt,
    buildUserPrompt: (v) =>
      buildFollowUpEmailPrompt({ contexto: v.contexto, objetivo: v.objetivo, tono: v.tono, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: () => "Email de seguimiento",
    contentType: "EMAIL",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "email-abandoned-cart",
    routeSegment: "abandoned-cart",
    label: "Abandoned Cart Email",
    description: "Genera un email de recuperación de carrito abandonado.",
    fields: [
      { name: "tienda", label: "Tienda", type: "text", required: true, maxLength: 200 },
      { name: "producto", label: "Producto abandonado", type: "text", required: true, maxLength: 300 },
      { name: "incentivo", label: "Incentivo (opcional)", type: "text", maxLength: 200 },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildAbandonedCartEmailSystemPrompt,
    buildUserPrompt: (v) =>
      buildAbandonedCartEmailPrompt({ tienda: v.tienda, producto: v.producto, incentivo: v.incentivo, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: (v) => `Carrito abandonado: ${v.producto}`,
    contentType: "EMAIL",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "email-cold",
    routeSegment: "cold-email",
    label: "Cold Email Generator",
    description: "Genera un email de primer contacto breve, personalizado y sin falsa urgencia.",
    fields: [
      { name: "destinatario", label: "Contexto del destinatario", type: "textarea", required: true, maxLength: 500 },
      { name: "propuestaValor", label: "Propuesta de valor", type: "textarea", required: true, maxLength: 500 },
      { name: "tono", label: "Tono", type: "text", defaultValue: "Directo y respetuoso", maxLength: 200, required: true },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildColdEmailSystemPrompt,
    buildUserPrompt: (v) =>
      buildColdEmailPrompt({ destinatario: v.destinatario, propuestaValor: v.propuestaValor, tono: v.tono, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: () => "Cold email",
    contentType: "EMAIL",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "email-sequence",
    routeSegment: "sequence",
    label: "Email Sequence Generator",
    description: "Diseña una secuencia de varios emails con un propósito claro por cada uno.",
    fields: [
      { name: "objetivo", label: "Objetivo de la secuencia", type: "text", required: true, maxLength: 300 },
      { name: "tema", label: "Tema o producto", type: "textarea", required: true, maxLength: 500 },
      { name: "numeroEmails", label: "Número de emails", type: "number", defaultValue: 4, min: 2, max: 10, required: true },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildEmailSequenceSystemPrompt,
    buildUserPrompt: (v) =>
      buildEmailSequencePrompt({ objetivo: v.objetivo, tema: v.tema, numeroEmails: v.numeroEmails, idioma: v.idioma }),
    outputMode: "list",
    buildItemTitle: (v) => `Secuencia de emails: ${v.objetivo}`,
    contentType: "EMAIL",
    resultKind: "CAMPAIGN_PLAN",
  },
  {
    slug: "email-cta-optimizer",
    routeSegment: "cta-optimizer",
    label: "CTA Email Optimizer",
    description: "Sugiere mejoras a la llamada a la acción de un email, sin prometer aumentos de conversión.",
    fields: [
      { name: "contenidoEmail", label: "Email a optimizar", type: "textarea", required: true, maxLength: 5000 },
      { name: "objetivo", label: "Objetivo del email", type: "text", required: true, maxLength: 300 },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildCtaEmailOptimizerSystemPrompt,
    buildUserPrompt: (v) =>
      buildCtaEmailOptimizerPrompt({ contenidoEmail: v.contenidoEmail, objetivo: v.objetivo, idioma: v.idioma }),
    outputMode: "list",
    buildItemTitle: () => "Optimización de CTA",
    contentType: "CALL_TO_ACTION",
    resultKind: "CONTENT_GENERATION",
  },
];

export function getEmailMarketingTool(routeSegment: string): AiToolDefinition | undefined {
  return EMAIL_MARKETING_TOOLS.find((tool) => tool.routeSegment === routeSegment);
}
