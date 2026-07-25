/**
 * Pure prompt builders for the Video AI tools. Every system prompt takes
 * the project's real brand context (from buildBrandContext) — same rule
 * used by every other authenticated tool in this app: no separate AI
 * system, just a different prompt built on top of the shared local engine.
 *
 * IMPORTANT: these tools never generate a video and never call an external
 * video provider (no Runway, no Veo, no Kling, no Pika, no Luma, no Sora,
 * no Higgsfield) — they use the exact same local text engine as every
 * other tool to produce text: a prompt, a script, a shot list or a
 * production plan the user can take to an external video engine or a real
 * production themselves.
 *
 * None of this text is copied from any other category's prompts. Every
 * tool is explicitly told to only elaborate on what the user describes and
 * never invent characters, brands, locations or products that weren't
 * given.
 */

const NO_INVENTED_ELEMENTS_RULE =
  "No inventes personajes, marcas, ubicaciones, productos ni ningún otro elemento del video que el usuario no te haya dado explícitamente — solo elabora la dirección técnica y narrativa (estructura, ritmo, encuadre, movimiento, tono) sobre lo que sí te proporcionen.";

const NO_VIDEO_GENERATION_NOTE =
  "No generas vídeo — solo escribes texto (guion, prompt, lista de planos o plan) que la persona podrá usar en el motor de generación de video o la producción real de su elección.";

const ENGINE_AGNOSTIC_VIDEO_NOTE =
  "Escribe el resultado en lenguaje descriptivo y estructurado, sin sintaxis de parámetros específica de ningún motor concreto, para que sea igual de útil en Runway, Veo, Kling, Pika, Luma, Sora, Higgsfield o cualquier otro generador de video.";

export function buildVideoPromptGeneratorSystemPrompt(context: string): string {
  return [
    "Eres el generador de prompts de video de AI Content Hub.",
    NO_VIDEO_GENERATION_NOTE,
    NO_INVENTED_ELEMENTS_RULE,
    ENGINE_AGNOSTIC_VIDEO_NOTE,
    "El prompt debe ser extremadamente detallado: acción, estilo visual, iluminación, composición, ritmo y duración sugerida.",
    "Devuelve únicamente el prompt final, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildVideoPromptGeneratorPrompt(values: { descripcion: string; estiloVisual: string; duracion: string; idioma: string }): string {
  return [
    `Describe el video: ${values.descripcion}.`,
    `Estilo visual: ${values.estiloVisual}.`,
    values.duracion ? `Duración aproximada: ${values.duracion}.` : "",
    `Idioma del prompt: ${values.idioma}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildAiVideoScriptGeneratorSystemPrompt(context: string): string {
  return [
    "Eres el generador de guiones de video de AI Content Hub. No generas vídeo — solo escribes el guion completo en texto.",
    NO_INVENTED_ELEMENTS_RULE,
    ENGINE_AGNOSTIC_VIDEO_NOTE,
    "Estructura el guion en introducción, desarrollo y cierre, indicando qué se dice y qué se ve en cada parte, ajustado a la duración objetivo.",
    "Devuelve únicamente el guion, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildAiVideoScriptGeneratorPrompt(values: { tema: string; duracion: string; tono: string; idioma: string }): string {
  return [
    `Tema del video: ${values.tema}.`,
    `Duración objetivo: ${values.duracion}.`,
    `Tono: ${values.tono}.`,
    `Idioma: ${values.idioma}.`,
  ].join("\n");
}

export function buildStoryboardGeneratorSystemPrompt(context: string): string {
  return [
    "Eres el generador de storyboards de AI Content Hub.",
    NO_VIDEO_GENERATION_NOTE,
    NO_INVENTED_ELEMENTS_RULE,
    ENGINE_AGNOSTIC_VIDEO_NOTE,
    "Divide la escena en viñetas numeradas; cada viñeta debe describir en texto lo que se ve en ese cuadro (encuadre, acción, posición) sin dibujar nada — es una descripción textual del storyboard.",
    "Devuelve únicamente la lista de viñetas, una por línea, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildStoryboardGeneratorPrompt(values: { guionOEscena: string; cantidadVinetas: string; idioma: string }): string {
  return [
    `Cantidad de viñetas deseada: ${values.cantidadVinetas}.`,
    `Idioma: ${values.idioma}.`,
    "Guion o descripción de la escena (usa solo este contenido):",
    `"""${values.guionOEscena}"""`,
  ].join("\n");
}

export function buildScenePlannerSystemPrompt(context: string): string {
  return [
    "Eres el planificador de escenas de AI Content Hub. No generas vídeo — solo escribes el plan de la escena en texto.",
    NO_INVENTED_ELEMENTS_RULE,
    ENGINE_AGNOSTIC_VIDEO_NOTE,
    "Organiza la escena en los elementos clave a definir antes de rodar o generar: acción principal, encuadre sugerido, iluminación y ambiente — sin asumir una ubicación, personaje o marca que no se te haya dado.",
    "Devuelve únicamente el plan de la escena, en puntos, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildScenePlannerPrompt(values: { resumenEscena: string; ubicacion: string; idioma: string }): string {
  return [
    values.ubicacion ? `Ubicación ya definida: ${values.ubicacion}.` : "Ubicación: no definida — no la inventes.",
    `Idioma: ${values.idioma}.`,
    "Resumen de la escena a planificar (usa solo este contenido):",
    `"""${values.resumenEscena}"""`,
  ].join("\n");
}

export function buildShotListGeneratorSystemPrompt(context: string): string {
  return [
    "Eres el generador de listas de planos (shot list) de AI Content Hub.",
    NO_VIDEO_GENERATION_NOTE,
    NO_INVENTED_ELEMENTS_RULE,
    ENGINE_AGNOSTIC_VIDEO_NOTE,
    "Genera una lista de planos numerada para la escena: tipo de plano (general, medio, primer plano, etc.), ángulo y qué ocurre en cada uno.",
    "Devuelve únicamente la lista de planos, uno por línea, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildShotListGeneratorPrompt(values: { escena: string; estiloVisual: string; idioma: string }): string {
  return [
    values.estiloVisual ? `Estilo visual: ${values.estiloVisual}.` : "",
    `Idioma: ${values.idioma}.`,
    "Descripción de la escena (usa solo este contenido):",
    `"""${values.escena}"""`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildCameraMovementGeneratorSystemPrompt(context: string): string {
  return [
    "Eres el generador de movimientos de cámara de AI Content Hub. No generas vídeo — solo describes en texto los movimientos de cámara sugeridos.",
    NO_INVENTED_ELEMENTS_RULE,
    ENGINE_AGNOSTIC_VIDEO_NOTE,
    "Sugiere movimientos de cámara concretos (paneo, travelling, dolly, grúa, cámara en mano, zoom, etc.) que refuercen la sensación indicada, justificando brevemente cada elección.",
    "Devuelve únicamente la descripción de los movimientos, sin explicaciones adicionales fuera de ella.",
    "",
    context,
  ].join("\n");
}

export function buildCameraMovementGeneratorPrompt(values: { escena: string; sensacion: string; idioma: string }): string {
  return [
    `Sensación que debe transmitir el movimiento: ${values.sensacion}.`,
    `Idioma: ${values.idioma}.`,
    "Descripción de la escena o toma (usa solo este contenido):",
    `"""${values.escena}"""`,
  ].join("\n");
}

export function buildCinematicPromptGeneratorSystemPrompt(context: string): string {
  return [
    "Eres el generador de prompts cinematográficos de AI Content Hub. No generas vídeo — solo escribes el prompt de texto.",
    NO_INVENTED_ELEMENTS_RULE,
    ENGINE_AGNOSTIC_VIDEO_NOTE,
    "El prompt debe transmitir una dirección cinematográfica clara: paleta de color, iluminación, lente/profundidad de campo sugerida y referencia de estilo o género, sin nombrar obras protegidas por derechos de autor como si el resultado fuera una copia de ellas.",
    "Devuelve únicamente el prompt final, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildCinematicPromptGeneratorPrompt(values: { descripcion: string; estiloCinematografico: string; idioma: string }): string {
  return [
    `Describe la escena: ${values.descripcion}.`,
    `Estilo cinematográfico: ${values.estiloCinematografico}.`,
    `Idioma del prompt: ${values.idioma}.`,
  ].join("\n");
}

export function buildShortVideoGeneratorSystemPrompt(context: string): string {
  return [
    "Eres el generador de video corto de AI Content Hub. No generas ningún archivo de vídeo — produces el guion y el prompt visual que la persona necesita para crear su video corto, ya sea grabándolo o usando un generador de video externo.",
    NO_INVENTED_ELEMENTS_RULE,
    ENGINE_AGNOSTIC_VIDEO_NOTE,
    "Entrega dos partes claramente separadas: 1) el guion breve (hook, desarrollo, cierre) ajustado a la duración objetivo, y 2) un prompt visual agnóstico de motor que describa cómo debería verse el video.",
    "Devuelve únicamente esas dos partes, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildShortVideoGeneratorPrompt(values: { tema: string; plataforma: string; duracion: string; idioma: string }): string {
  return [
    `Tema del video corto: ${values.tema}.`,
    values.plataforma ? `Plataforma de destino: ${values.plataforma}.` : "",
    `Duración objetivo: ${values.duracion}.`,
    `Idioma: ${values.idioma}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildYoutubeVideoOutlineGeneratorSystemPrompt(context: string): string {
  return [
    "Eres el generador de esquemas (outline) de video de YouTube de AI Content Hub.",
    NO_INVENTED_ELEMENTS_RULE,
    "Estructura el esquema en secciones con marcas de tiempo orientativas (introducción, puntos principales, cierre y llamada a la acción), sin escribir el guion palabra por palabra.",
    "Devuelve únicamente el esquema, en puntos, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildYoutubeVideoOutlineGeneratorPrompt(values: { tema: string; duracionAprox: string; idioma: string }): string {
  return [
    `Tema del video de YouTube: ${values.tema}.`,
    values.duracionAprox ? `Duración aproximada: ${values.duracionAprox}.` : "",
    `Idioma: ${values.idioma}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildVideoProductionPlannerSystemPrompt(context: string): string {
  return [
    "Eres el planificador de producción de video de AI Content Hub. No generas vídeo — organizas el plan de producción en texto.",
    NO_INVENTED_ELEMENTS_RULE,
    "Organiza el plan de producción en fases (preproducción, rodaje o generación, postproducción) con las tareas típicas de cada una, adaptándolo a los recursos y restricciones que te indiquen. Si falta información relevante para planificar con precisión, dilo explícitamente en vez de suponerla.",
    "Devuelve únicamente el plan de producción, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildVideoProductionPlannerPrompt(values: { proyecto: string; recursosDisponibles: string; idioma: string }): string {
  return [
    `Idioma: ${values.idioma}.`,
    values.recursosDisponibles ? `Recursos o restricciones disponibles: ${values.recursosDisponibles}.` : "",
    "Descripción del proyecto de video (usa solo este contenido):",
    `"""${values.proyecto}"""`,
  ]
    .filter(Boolean)
    .join("\n");
}
