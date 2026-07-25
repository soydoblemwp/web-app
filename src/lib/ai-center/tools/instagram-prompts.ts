/**
 * Pure prompt builders for the Instagram AI tools. Every system prompt
 * takes the project's real brand context (from buildBrandContext) — same
 * rule used by every other authenticated tool in this app: no separate AI
 * system, just a different prompt built on top of the shared local engine.
 * Written specifically for Instagram's formats and conventions — none of
 * this is copied from the YouTube prompts.
 */

export function buildInstagramCaptionSystemPrompt(context: string): string {
  return [
    "Eres el generador de captions de Instagram de AI Content Hub.",
    "Redacta captions que enganchen en la primera línea (es lo único visible antes de \"más\"), con ritmo natural para lectura en móvil.",
    "Usa saltos de línea entre ideas cuando ayude a la legibilidad. No añadas hashtags dentro del caption — eso lo genera otra herramienta.",
    "No inventes datos, cifras ni promesas que no se puedan verificar.",
    "Devuelve únicamente una lista numerada de opciones de caption, una por línea, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildInstagramCaptionPrompt(values: {
  tema: string;
  objetivo: string;
  tono: string;
  idioma: string;
  cantidad: string;
}): string {
  return [
    `Genera ${values.cantidad} opciones de caption de Instagram sobre: ${values.tema}.`,
    values.objetivo ? `Objetivo de la publicación: ${values.objetivo}.` : "",
    `Tono: ${values.tono}.`,
    `Idioma: ${values.idioma}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildInstagramHashtagsSystemPrompt(context: string): string {
  return [
    "Eres el generador de hashtags de Instagram de AI Content Hub.",
    "Combina hashtags de alto volumen, de nicho y de marca — evita hashtags baneados o genéricos que no aporten descubribilidad real.",
    "Devuelve únicamente una lista de hashtags, uno por línea, cada uno empezando por #, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildInstagramHashtagsPrompt(values: { tema: string; nicho: string; idioma: string }): string {
  return [
    `Genera hashtags de Instagram para una publicación sobre: ${values.tema}.`,
    values.nicho ? `Nicho de la cuenta: ${values.nicho}.` : "",
    `Idioma: ${values.idioma}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildInstagramReelIdeasSystemPrompt(context: string): string {
  return [
    "Eres el generador de ideas de Reels de Instagram de AI Content Hub.",
    "Genera ideas pensadas para vídeo corto vertical: con potencial de retención desde el primer segundo y de compartirse.",
    "Organiza las ideas agrupadas por categoría, con un encabezado de categoría seguido de sus ideas.",
    "Formato: 'Categoría:' en su propia línea, seguida de las ideas de esa categoría cada una en su línea empezando por '- '.",
    "No añadas explicaciones adicionales fuera de ese formato.",
    "",
    context,
  ].join("\n");
}

export function buildInstagramReelIdeasPrompt(values: { nicho: string; idioma: string; cantidad: string }): string {
  return [
    `Genera ${values.cantidad} ideas de Reels para una cuenta de Instagram del nicho: ${values.nicho}.`,
    `Idioma: ${values.idioma}.`,
  ].join("\n");
}

export function buildInstagramReelScriptSystemPrompt(context: string): string {
  return [
    "Eres el generador de guiones de Reels de Instagram de AI Content Hub.",
    "Genera un guion breve pensado para vídeo vertical de menos de un minuto, con cuatro partes tituladas: Hook, Desarrollo, Llamado a la acción y Texto en pantalla sugerido.",
    "El hook debe enganchar en los primeros 1-2 segundos. No inventes datos ni cifras que no se puedan verificar.",
    "Devuelve únicamente el guion con esas cuatro secciones tituladas, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildInstagramReelScriptPrompt(values: { tema: string; duracion: string; tono: string; idioma: string }): string {
  return [
    `Genera el guion de un Reel de Instagram sobre: ${values.tema}.`,
    `Duración aproximada: ${values.duracion} segundos.`,
    `Tono: ${values.tono}.`,
    `Idioma: ${values.idioma}.`,
  ].join("\n");
}

export function buildInstagramHookSystemPrompt(context: string): string {
  return [
    "Eres el generador de hooks (primera línea o primer segundo) para Instagram de AI Content Hub.",
    "Cada opción debe detener el scroll: pregunta directa, dato sorprendente, tensión o promesa concreta — nunca genérico.",
    "No inventes datos ni cifras que no se puedan verificar.",
    "Devuelve únicamente una lista numerada de opciones de hook, una por línea, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildInstagramHookPrompt(values: { tema: string; tono: string; idioma: string; cantidad: string }): string {
  return [
    `Genera ${values.cantidad} hooks para una publicación o Reel de Instagram sobre: ${values.tema}.`,
    `Tono: ${values.tono}.`,
    `Idioma: ${values.idioma}.`,
  ].join("\n");
}

export function buildInstagramCarouselSystemPrompt(context: string): string {
  return [
    "Eres el generador de carruseles de Instagram de AI Content Hub.",
    "Estructura el contenido en diapositivas: la primera debe funcionar como portada con gancho, la última debe cerrar con una llamada a la acción.",
    "Cada diapositiva debe tener poco texto (legible en móvil de un vistazo).",
    "Devuelve únicamente la lista de diapositivas, una por línea, en formato 'Diapositiva N: contenido', sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildInstagramCarouselPrompt(values: { tema: string; diapositivas: string; idioma: string }): string {
  return [
    `Genera un carrusel de Instagram de ${values.diapositivas} diapositivas sobre: ${values.tema}.`,
    `Idioma: ${values.idioma}.`,
  ].join("\n");
}

export function buildInstagramStoryIdeasSystemPrompt(context: string): string {
  return [
    "Eres el generador de ideas para Stories de Instagram de AI Content Hub.",
    "Prioriza formatos interactivos propios de Stories: encuestas, preguntas, cuentas atrás, deslizadores, detrás de cámaras.",
    "Organiza las ideas agrupadas por categoría, con un encabezado de categoría seguido de sus ideas.",
    "Formato: 'Categoría:' en su propia línea, seguida de las ideas de esa categoría cada una en su línea empezando por '- '.",
    "No añadas explicaciones adicionales fuera de ese formato.",
    "",
    context,
  ].join("\n");
}

export function buildInstagramStoryIdeasPrompt(values: { tema: string; idioma: string; cantidad: string }): string {
  return [
    `Genera ${values.cantidad} ideas de Stories de Instagram sobre: ${values.tema}.`,
    `Idioma: ${values.idioma}.`,
  ].join("\n");
}

export function buildInstagramBioSystemPrompt(context: string): string {
  return [
    "Eres el generador de biografías de Instagram de AI Content Hub.",
    "La biografía de Instagram tiene un límite estricto de 150 caracteres — cada opción generada debe respetar ese límite.",
    "Comunica con claridad quién eres/qué ofreces y por qué seguir la cuenta, en un tono directo.",
    "No inventes cifras, logros ni datos que no se puedan verificar.",
    "Devuelve únicamente una lista numerada de opciones de biografía, una por línea, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildInstagramBioPrompt(values: {
  tema: string;
  propuestaValor: string;
  tono: string;
  idioma: string;
  cantidad: string;
}): string {
  return [
    `Genera ${values.cantidad} opciones de biografía de Instagram (máximo 150 caracteres cada una) para una cuenta sobre: ${values.tema}.`,
    values.propuestaValor ? `Propuesta de valor a comunicar: ${values.propuestaValor}.` : "",
    `Tono: ${values.tono}.`,
    `Idioma: ${values.idioma}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildInstagramCtaSystemPrompt(context: string): string {
  return [
    "Eres el generador de llamadas a la acción (CTA) para Instagram de AI Content Hub.",
    "Cada CTA debe ser breve, directa y accionable en el contexto de Instagram (comentar, guardar, compartir, ir al enlace de la bio, enviar mensaje).",
    "No inventes ofertas, plazos ni cifras que no se puedan verificar.",
    "Devuelve únicamente una lista numerada de opciones de CTA, una por línea, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildInstagramCtaPrompt(values: { objetivo: string; tono: string; idioma: string; cantidad: string }): string {
  return [
    `Genera ${values.cantidad} llamadas a la acción para Instagram con este objetivo: ${values.objetivo}.`,
    `Tono: ${values.tono}.`,
    `Idioma: ${values.idioma}.`,
  ].join("\n");
}

export function buildInstagramCalendarSystemPrompt(context: string): string {
  return [
    "Eres el generador de calendarios de contenido de Instagram de AI Content Hub.",
    "Distribuye publicaciones a lo largo del periodo indicado, variando el formato (post, Reel, carrusel, Story) y el tipo de contenido para mantener el interés.",
    "No inventes fechas concretas ni datos de rendimiento — usa 'Día 1', 'Día 2', etc.",
    "Devuelve únicamente el calendario, una línea por publicación, en formato 'Día N (Formato): idea de contenido', sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildInstagramCalendarPrompt(values: { nicho: string; dias: string; frecuencia: string; idioma: string }): string {
  return [
    `Genera un calendario de contenido de Instagram de ${values.dias} días para una cuenta del nicho: ${values.nicho}.`,
    `Frecuencia deseada: ${values.frecuencia} publicaciones por semana.`,
    `Idioma: ${values.idioma}.`,
  ].join("\n");
}
