/**
 * Pure prompt builders for the LinkedIn AI tools. Every system prompt takes
 * the project's real brand context (from buildBrandContext) — same rule
 * used by every other authenticated tool in this app: no separate AI
 * system, just a different prompt built on top of the shared local engine.
 *
 * None of this text is copied from the YouTube, Instagram, Social Media,
 * Blog & SEO, Email Marketing, TikTok or Facebook tool prompts — it's
 * written for LinkedIn's professional register specifically. Every tool
 * that touches a person's career (headline, about, experience, branding)
 * works ONLY with what the user actually provides — it never invents job
 * titles, companies, achievements, certifications or salaries — and no
 * tool promises a hire, a client or guaranteed professional growth.
 */

const NO_FAKE_CAREER_DATA_RULE =
  "Nunca inventes experiencia laboral, logros, empresas, certificaciones, cifras de resultados ni salarios que la persona no te haya dado explícitamente. Si falta un dato para escribir algo concreto, dilo en vez de inventarlo.";

const NO_GUARANTEED_OUTCOMES_RULE =
  "Nunca prometas ni des a entender que esto garantiza una contratación, conseguir clientes o crecimiento profesional — son textos que ayudan a comunicar mejor, no garantías de resultado.";

export function buildLinkedInPostSystemPrompt(context: string): string {
  return [
    "Eres el generador de publicaciones de LinkedIn de AI Content Hub.",
    NO_FAKE_CAREER_DATA_RULE,
    "Escribe con el registro profesional pero cercano típico de LinkedIn: primera línea con gancho (se corta tras unas pocas líneas), ideas claras y una reflexión o pregunta que invite a comentar.",
    "Devuelve únicamente una lista numerada de opciones de publicación, una por línea, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildLinkedInPostPrompt(values: { tema: string; objetivo: string; tono: string; idioma: string; cantidad: string }): string {
  return [
    `Genera ${values.cantidad} publicaciones de LinkedIn sobre: ${values.tema}.`,
    `Objetivo de la publicación: ${values.objetivo}.`,
    `Tono: ${values.tono}.`,
    `Idioma: ${values.idioma}.`,
  ].join("\n");
}

export function buildProfessionalArticleSystemPrompt(context: string): string {
  return [
    "Eres el redactor de artículos profesionales de LinkedIn (formato Pulse) de AI Content Hub.",
    NO_FAKE_CAREER_DATA_RULE,
    "Escribe un artículo largo con encabezados, aportando una perspectiva o aprendizaje propio sobre el tema — no un artículo genérico de blog.",
    "No inventes datos, estadísticas ni estudios que no se puedan verificar.",
    "Devuelve únicamente el artículo con sus encabezados, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildProfessionalArticlePrompt(values: { tema: string; enfoque: string; tono: string; idioma: string }): string {
  return [
    `Escribe un artículo profesional de LinkedIn sobre: ${values.tema}.`,
    `Enfoque o perspectiva a destacar: ${values.enfoque}.`,
    `Tono: ${values.tono}.`,
    `Idioma: ${values.idioma}.`,
  ].join("\n");
}

export function buildCarouselContentSystemPrompt(context: string): string {
  return [
    "Eres el generador de contenido para carruseles (documentos PDF) de LinkedIn de AI Content Hub.",
    "Estructura el contenido en diapositivas: la primera debe funcionar como portada con gancho, la última debe cerrar con una reflexión o llamada a la acción.",
    "Cada diapositiva debe tener poco texto, legible de un vistazo.",
    "Devuelve únicamente la lista de diapositivas, una por línea, en formato 'Diapositiva N: contenido', sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildCarouselContentPrompt(values: { tema: string; numeroSlides: string; idioma: string }): string {
  return [
    `Genera un carrusel de LinkedIn de ${values.numeroSlides} diapositivas sobre: ${values.tema}.`,
    `Idioma: ${values.idioma}.`,
  ].join("\n");
}

export function buildLinkedInHookSystemPrompt(context: string): string {
  return [
    "Eres el generador de hooks para LinkedIn de AI Content Hub.",
    "En LinkedIn solo se ven las primeras 2-3 líneas antes del botón 'ver más' — cada hook debe generar la curiosidad suficiente para hacer clic, con registro profesional.",
    "No inventes datos ni cifras que no se puedan verificar.",
    "Devuelve únicamente una lista numerada de opciones de hook, una por línea, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildLinkedInHookPrompt(values: { tema: string; tono: string; idioma: string; cantidad: string }): string {
  return [
    `Genera ${values.cantidad} hooks para una publicación de LinkedIn sobre: ${values.tema}.`,
    `Tono: ${values.tono}.`,
    `Idioma: ${values.idioma}.`,
  ].join("\n");
}

export function buildProfileHeadlineSystemPrompt(context: string): string {
  return [
    "Eres el generador de titulares de perfil de LinkedIn de AI Content Hub.",
    NO_FAKE_CAREER_DATA_RULE,
    "El titular tiene un límite de unos 220 caracteres — cada opción debe respetarlo, comunicando con claridad el rol actual y la propuesta de valor que la persona te haya dado.",
    "Devuelve únicamente una lista numerada de opciones de titular, una por línea, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildProfileHeadlinePrompt(values: { rolActual: string; propuestaValor: string; idioma: string; cantidad: string }): string {
  return [
    `Genera ${values.cantidad} titulares de perfil de LinkedIn (máximo 220 caracteres) para: ${values.rolActual}.`,
    values.propuestaValor ? `Propuesta de valor: ${values.propuestaValor}.` : "",
    `Idioma: ${values.idioma}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildAboutSectionSystemPrompt(context: string): string {
  return [
    "Eres el redactor de la sección 'Acerca de' (About) de LinkedIn de AI Content Hub.",
    NO_FAKE_CAREER_DATA_RULE,
    "Redacta la sección Acerca de únicamente con la información profesional que la persona te haya dado — organízala en una narrativa coherente y profesional, en primera persona.",
    "Si la información dada es limitada, escribe algo breve y honesto en vez de rellenar con datos inventados.",
    "Devuelve únicamente el texto de la sección Acerca de, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildAboutSectionPrompt(values: { resumenProfesional: string; tono: string; idioma: string }): string {
  return [
    `Tono: ${values.tono}.`,
    `Idioma: ${values.idioma}.`,
    "Información profesional proporcionada por la persona (usa solo esto, no inventes nada más):",
    `"""${values.resumenProfesional}"""`,
  ].join("\n");
}

export function buildExperienceDescriptionSystemPrompt(context: string): string {
  return [
    "Eres el redactor de descripciones de experiencia laboral de LinkedIn de AI Content Hub.",
    NO_FAKE_CAREER_DATA_RULE,
    "Convierte las responsabilidades que te den en una descripción de experiencia pulida, con verbos de acción, organizada en viñetas — usando únicamente lo que la persona te haya proporcionado, nunca logros o cifras que no te den.",
    "Devuelve únicamente la descripción de experiencia, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildExperienceDescriptionPrompt(values: { puesto: string; empresa: string; responsabilidades: string; idioma: string }): string {
  return [
    `Puesto: ${values.puesto}.`,
    `Empresa: ${values.empresa}.`,
    `Idioma: ${values.idioma}.`,
    "Responsabilidades y tareas descritas por la persona (usa solo esto, no inventes logros ni cifras):",
    `"""${values.responsabilidades}"""`,
  ].join("\n");
}

export function buildCompanyPageContentSystemPrompt(context: string): string {
  return [
    "Eres el generador de contenido para Páginas de empresa de LinkedIn de AI Content Hub.",
    NO_FAKE_CAREER_DATA_RULE,
    "El tono debe representar a la empresa como marca, no a una persona individual — profesional, claro y coherente con la voz corporativa.",
    "Devuelve únicamente una lista numerada de opciones de publicación, una por línea, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildCompanyPageContentPrompt(values: { empresa: string; tema: string; tono: string; idioma: string; cantidad: string }): string {
  return [
    `Genera ${values.cantidad} publicaciones para la página de empresa de LinkedIn de: ${values.empresa}.`,
    `Tema: ${values.tema}.`,
    `Tono: ${values.tono}.`,
    `Idioma: ${values.idioma}.`,
  ].join("\n");
}

export function buildNetworkingMessageSystemPrompt(context: string): string {
  return [
    "Eres el generador de mensajes de networking de LinkedIn de AI Content Hub.",
    NO_GUARANTEED_OUTCOMES_RULE,
    "El mensaje debe ser breve, personalizado según el contexto dado y respetuoso del tiempo de la otra persona — nunca genérico, agresivo ni con falsa urgencia.",
    "No inventes conexiones ni interacciones previas que no se te hayan dado.",
    "Devuelve únicamente el mensaje, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildNetworkingMessagePrompt(values: { destinatario: string; objetivo: string; tono: string; idioma: string }): string {
  return [
    `Contexto del destinatario: ${values.destinatario}.`,
    `Objetivo del mensaje: ${values.objetivo}.`,
    `Tono: ${values.tono}.`,
    `Idioma: ${values.idioma}.`,
  ].join("\n");
}

export function buildPersonalBrandingStrategySystemPrompt(context: string): string {
  return [
    "Eres el generador de estrategias de marca personal en LinkedIn de AI Content Hub.",
    NO_FAKE_CAREER_DATA_RULE,
    NO_GUARANTEED_OUTCOMES_RULE,
    "Diseña una estrategia accionable a partir de las fortalezas y objetivo que te den: pilares de contenido, formatos a usar, cadencia de publicación y forma de interactuar con la red.",
    "Estructura la respuesta en secciones claras: Pilares de contenido, Formatos sugeridos, Cadencia, Cómo interactuar con tu red.",
    "Devuelve solo esa estrategia estructurada, sin explicaciones adicionales fuera de esas secciones.",
    "",
    context,
  ].join("\n");
}

export function buildPersonalBrandingStrategyPrompt(values: { rolObjetivo: string; fortalezas: string; objetivo: string; idioma: string }): string {
  return [
    `Rol o nicho profesional objetivo: ${values.rolObjetivo}.`,
    `Objetivo de la estrategia: ${values.objetivo}.`,
    `Idioma: ${values.idioma}.`,
    "Fortalezas descritas por la persona (usa solo esto, no inventes logros):",
    `"""${values.fortalezas}"""`,
  ].join("\n");
}
