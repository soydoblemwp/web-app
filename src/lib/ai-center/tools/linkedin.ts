import type { AiToolDefinition } from "@/lib/ai-center/tools/types";
import {
  buildLinkedInPostSystemPrompt,
  buildLinkedInPostPrompt,
  buildProfessionalArticleSystemPrompt,
  buildProfessionalArticlePrompt,
  buildCarouselContentSystemPrompt,
  buildCarouselContentPrompt,
  buildLinkedInHookSystemPrompt,
  buildLinkedInHookPrompt,
  buildProfileHeadlineSystemPrompt,
  buildProfileHeadlinePrompt,
  buildAboutSectionSystemPrompt,
  buildAboutSectionPrompt,
  buildExperienceDescriptionSystemPrompt,
  buildExperienceDescriptionPrompt,
  buildCompanyPageContentSystemPrompt,
  buildCompanyPageContentPrompt,
  buildNetworkingMessageSystemPrompt,
  buildNetworkingMessagePrompt,
  buildPersonalBrandingStrategySystemPrompt,
  buildPersonalBrandingStrategyPrompt,
} from "@/lib/ai-center/tools/linkedin-prompts";

/**
 * Every fully-implemented LinkedIn AI tool, as a declarative definition the
 * generic AiGenerationForm engine can render — same pattern as youtube.ts,
 * instagram.ts, social-media.ts, blog-seo.ts, email-marketing.ts, tiktok.ts
 * and facebook.ts. Registering these in
 * src/lib/ai-center/tools/registry.ts is the only wiring Chat IA's intent
 * router needs to start using them automatically.
 */
export const LINKEDIN_AI_TOOLS: AiToolDefinition[] = [
  {
    slug: "linkedin-post",
    routeSegment: "post",
    label: "LinkedIn Post Generator",
    description: "Genera publicaciones de LinkedIn con registro profesional y gancho inicial.",
    fields: [
      { name: "tema", label: "Tema", type: "textarea", required: true, maxLength: 500 },
      { name: "objetivo", label: "Objetivo de la publicación", type: "text", required: true, maxLength: 300 },
      { name: "tono", label: "Tono", type: "text", defaultValue: "Profesional y cercano", maxLength: 200, required: true },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
      { name: "cantidad", label: "Cantidad de opciones", type: "number", defaultValue: 3, min: 1, max: 10, required: true },
    ],
    buildSystemPrompt: buildLinkedInPostSystemPrompt,
    buildUserPrompt: (v) =>
      buildLinkedInPostPrompt({ tema: v.tema, objetivo: v.objetivo, tono: v.tono, idioma: v.idioma, cantidad: v.cantidad }),
    outputMode: "list",
    buildItemTitle: (v) => `Post LinkedIn: ${v.tema}`,
    contentType: "SOCIAL_TEXT",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "linkedin-article",
    routeSegment: "article",
    label: "Professional Article Generator",
    description: "Redacta un artículo profesional largo para LinkedIn (formato Pulse).",
    fields: [
      { name: "tema", label: "Tema", type: "textarea", required: true, maxLength: 500 },
      { name: "enfoque", label: "Enfoque o perspectiva a destacar", type: "textarea", required: true, maxLength: 500 },
      { name: "tono", label: "Tono", type: "text", defaultValue: "Profesional y cercano", maxLength: 200, required: true },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildProfessionalArticleSystemPrompt,
    buildUserPrompt: (v) =>
      buildProfessionalArticlePrompt({ tema: v.tema, enfoque: v.enfoque, tono: v.tono, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: (v) => `Artículo LinkedIn: ${v.tema}`,
    contentType: "ARTICLE",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "linkedin-carousel",
    routeSegment: "carousel",
    label: "Carousel Content Generator",
    description: "Estructura el contenido de un carrusel (documento PDF) de LinkedIn diapositiva por diapositiva.",
    fields: [
      { name: "tema", label: "Tema", type: "textarea", required: true, maxLength: 500 },
      { name: "numeroSlides", label: "Número de diapositivas", type: "number", defaultValue: 8, min: 3, max: 15, required: true },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildCarouselContentSystemPrompt,
    buildUserPrompt: (v) => buildCarouselContentPrompt({ tema: v.tema, numeroSlides: v.numeroSlides, idioma: v.idioma }),
    outputMode: "list",
    buildItemTitle: (v) => `Carrusel LinkedIn: ${v.tema}`,
    contentType: "OTHER",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "linkedin-hooks",
    routeSegment: "hooks",
    label: "LinkedIn Hook Generator",
    description: "Genera las primeras líneas de una publicación para maximizar el clic en 'ver más'.",
    fields: [
      { name: "tema", label: "Tema", type: "textarea", required: true, maxLength: 500 },
      { name: "tono", label: "Tono", type: "text", defaultValue: "Profesional y cercano", maxLength: 200, required: true },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
      { name: "cantidad", label: "Cantidad de opciones", type: "number", defaultValue: 5, min: 1, max: 10, required: true },
    ],
    buildSystemPrompt: buildLinkedInHookSystemPrompt,
    buildUserPrompt: (v) => buildLinkedInHookPrompt({ tema: v.tema, tono: v.tono, idioma: v.idioma, cantidad: v.cantidad }),
    outputMode: "list",
    buildItemTitle: (v) => `Hooks LinkedIn: ${v.tema}`,
    contentType: "INTRO",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "linkedin-headline",
    routeSegment: "headline",
    label: "Profile Headline Generator",
    description: "Genera titulares de perfil de LinkedIn dentro del límite de 220 caracteres.",
    fields: [
      { name: "rolActual", label: "Rol actual", type: "text", required: true, maxLength: 200 },
      { name: "propuestaValor", label: "Propuesta de valor (opcional)", type: "text", maxLength: 300 },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
      { name: "cantidad", label: "Cantidad de opciones", type: "number", defaultValue: 3, min: 1, max: 10, required: true },
    ],
    buildSystemPrompt: buildProfileHeadlineSystemPrompt,
    buildUserPrompt: (v) =>
      buildProfileHeadlinePrompt({ rolActual: v.rolActual, propuestaValor: v.propuestaValor, idioma: v.idioma, cantidad: v.cantidad }),
    outputMode: "list",
    buildItemTitle: (v) => `Titular LinkedIn: ${v.rolActual}`,
    contentType: "OTHER",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "linkedin-about-section",
    routeSegment: "about-section",
    label: "About Section Generator",
    description: "Redacta la sección 'Acerca de' de LinkedIn usando únicamente la información profesional que proporciones.",
    fields: [
      { name: "resumenProfesional", label: "Tu información profesional", type: "textarea", required: true, maxLength: 3000 },
      { name: "tono", label: "Tono", type: "text", defaultValue: "Profesional y cercano", maxLength: 200, required: true },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildAboutSectionSystemPrompt,
    buildUserPrompt: (v) =>
      buildAboutSectionPrompt({ resumenProfesional: v.resumenProfesional, tono: v.tono, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: () => "Sección Acerca de",
    contentType: "OTHER",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "linkedin-experience-description",
    routeSegment: "experience-description",
    label: "Experience Description Generator",
    description: "Convierte tus responsabilidades reales en una descripción de experiencia pulida, sin inventar logros.",
    fields: [
      { name: "puesto", label: "Puesto", type: "text", required: true, maxLength: 200 },
      { name: "empresa", label: "Empresa", type: "text", required: true, maxLength: 200 },
      { name: "responsabilidades", label: "Responsabilidades y tareas", type: "textarea", required: true, maxLength: 2000 },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildExperienceDescriptionSystemPrompt,
    buildUserPrompt: (v) =>
      buildExperienceDescriptionPrompt({
        puesto: v.puesto,
        empresa: v.empresa,
        responsabilidades: v.responsabilidades,
        idioma: v.idioma,
      }),
    outputMode: "text",
    buildItemTitle: (v) => `Experiencia: ${v.puesto} en ${v.empresa}`,
    contentType: "OTHER",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "linkedin-company-page",
    routeSegment: "company-page",
    label: "Company Page Content Generator",
    description: "Genera contenido para la Página de empresa de LinkedIn con voz corporativa.",
    fields: [
      { name: "empresa", label: "Empresa", type: "text", required: true, maxLength: 200 },
      { name: "tema", label: "Tema", type: "textarea", required: true, maxLength: 500 },
      { name: "tono", label: "Tono", type: "text", defaultValue: "Profesional y cercano", maxLength: 200, required: true },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
      { name: "cantidad", label: "Cantidad de opciones", type: "number", defaultValue: 3, min: 1, max: 10, required: true },
    ],
    buildSystemPrompt: buildCompanyPageContentSystemPrompt,
    buildUserPrompt: (v) =>
      buildCompanyPageContentPrompt({ empresa: v.empresa, tema: v.tema, tono: v.tono, idioma: v.idioma, cantidad: v.cantidad }),
    outputMode: "list",
    buildItemTitle: (v) => `Página de empresa: ${v.empresa}`,
    contentType: "SOCIAL_TEXT",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "linkedin-networking-message",
    routeSegment: "networking-message",
    label: "Networking Message Generator",
    description: "Genera un mensaje de networking breve y respetuoso, sin prometer resultados.",
    fields: [
      { name: "destinatario", label: "Contexto del destinatario", type: "textarea", required: true, maxLength: 500 },
      { name: "objetivo", label: "Objetivo del mensaje", type: "text", required: true, maxLength: 300 },
      { name: "tono", label: "Tono", type: "text", defaultValue: "Profesional y cercano", maxLength: 200, required: true },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildNetworkingMessageSystemPrompt,
    buildUserPrompt: (v) =>
      buildNetworkingMessagePrompt({ destinatario: v.destinatario, objetivo: v.objetivo, tono: v.tono, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: () => "Mensaje de networking",
    contentType: "OTHER",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "linkedin-branding-strategy",
    routeSegment: "branding-strategy",
    label: "Personal Branding Strategy Generator",
    description: "Genera una estrategia de marca personal en LinkedIn, sin prometer resultados garantizados.",
    fields: [
      { name: "rolObjetivo", label: "Rol o nicho profesional objetivo", type: "text", required: true, maxLength: 300 },
      { name: "fortalezas", label: "Tus fortalezas", type: "textarea", required: true, maxLength: 1500 },
      { name: "objetivo", label: "Objetivo de la estrategia", type: "text", required: true, maxLength: 300 },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildPersonalBrandingStrategySystemPrompt,
    buildUserPrompt: (v) =>
      buildPersonalBrandingStrategyPrompt({
        rolObjetivo: v.rolObjetivo,
        fortalezas: v.fortalezas,
        objetivo: v.objetivo,
        idioma: v.idioma,
      }),
    outputMode: "text",
    buildItemTitle: (v) => `Estrategia de marca personal: ${v.rolObjetivo}`,
    contentType: "OTHER",
    resultKind: "CAMPAIGN_PLAN",
  },
];

export function getLinkedInTool(routeSegment: string): AiToolDefinition | undefined {
  return LINKEDIN_AI_TOOLS.find((tool) => tool.routeSegment === routeSegment);
}
