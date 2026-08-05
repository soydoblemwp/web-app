import type { ContentType, SocialPlatform } from "@/generated/prisma/enums";

/**
 * The 10 repurposing targets from the Fase 27 spec. Broader than the
 * `SocialPlatform` enum (which only covers actual schedulable social
 * networks) — Email/Blog corto/Newsletter/Guion de video are real
 * repurposing outputs but never become a SocialPost, so `socialPlatform` is
 * optional here and only set for channels the "Publicación" tab can later
 * schedule (see src/lib/editor/repurpose-platforms.ts consumers in
 * src/components/editor/sidebar/tabs/publish-tab.tsx).
 */
export type RepurposeChannelId =
  | "instagram"
  | "facebook"
  | "linkedin"
  | "tiktok"
  | "x"
  | "youtube"
  | "pinterest"
  | "email"
  | "blog-corto"
  | "newsletter"
  | "video-script";

export interface RepurposeChannelDefinition {
  id: RepurposeChannelId;
  label: string;
  contentType: ContentType;
  socialPlatform?: SocialPlatform;
  buildSystemPrompt: (context: string) => string;
  buildUserPrompt: (originalText: string) => string;
}

function baseInstruction(instruction: string, context: string): string {
  return [
    "Eres el asistente de reutilización de contenido de AI Content Hub.",
    instruction,
    "Conserva siempre el mensaje principal y la intención del contenido original — adapta el formato y el tono al canal, nunca inventes información nueva.",
    "Responde ÚNICAMENTE con el texto final para ese canal, sin explicaciones ni comillas.",
    "",
    context,
  ]
    .filter(Boolean)
    .join("\n");
}

function userPrompt(label: string, originalText: string): string {
  return `Reutiliza el siguiente contenido para ${label}:\n\n${originalText}`;
}

export const REPURPOSE_CHANNELS: RepurposeChannelDefinition[] = [
  {
    id: "instagram",
    label: "Instagram",
    contentType: "SOCIAL_TEXT",
    socialPlatform: "INSTAGRAM",
    buildSystemPrompt: (context) =>
      baseInstruction(
        "Convierte el contenido en un caption de Instagram: gancho potente en la primera línea, ritmo natural para móvil, sin hashtags dentro del texto.",
        context
      ),
    buildUserPrompt: (text) => userPrompt("Instagram", text),
  },
  {
    id: "facebook",
    label: "Facebook",
    contentType: "SOCIAL_TEXT",
    socialPlatform: "FACEBOOK",
    buildSystemPrompt: (context) =>
      baseInstruction("Convierte el contenido en una publicación de Facebook: tono cercano, párrafos cortos, invita a comentar o compartir.", context),
    buildUserPrompt: (text) => userPrompt("Facebook", text),
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    contentType: "SOCIAL_TEXT",
    socialPlatform: "LINKEDIN",
    buildSystemPrompt: (context) =>
      baseInstruction(
        "Convierte el contenido en una publicación de LinkedIn: tono profesional, aporta una perspectiva o aprendizaje claro, evita emojis excesivos.",
        context
      ),
    buildUserPrompt: (text) => userPrompt("LinkedIn", text),
  },
  {
    id: "tiktok",
    label: "TikTok",
    contentType: "SOCIAL_TEXT",
    socialPlatform: "TIKTOK",
    buildSystemPrompt: (context) =>
      baseInstruction(
        "Convierte el contenido en un guion corto para TikTok: primeros 2 segundos con gancho fuerte, frases muy cortas, lenguaje hablado.",
        context
      ),
    buildUserPrompt: (text) => userPrompt("TikTok", text),
  },
  {
    id: "x",
    label: "X",
    contentType: "SOCIAL_TEXT",
    socialPlatform: "X",
    buildSystemPrompt: (context) =>
      baseInstruction("Convierte el contenido en un hilo breve para X (Twitter): primer tuit con gancho, máximo 280 caracteres por tuit.", context),
    buildUserPrompt: (text) => userPrompt("X (Twitter)", text),
  },
  {
    id: "youtube",
    label: "YouTube",
    contentType: "SOCIAL_TEXT",
    socialPlatform: "YOUTUBE",
    buildSystemPrompt: (context) =>
      baseInstruction("Convierte el contenido en una descripción de vídeo de YouTube: primeras 2 líneas resumen el valor del vídeo, resto con detalle y CTA.", context),
    buildUserPrompt: (text) => userPrompt("la descripción de un vídeo de YouTube", text),
  },
  {
    id: "pinterest",
    label: "Pinterest",
    contentType: "SOCIAL_TEXT",
    socialPlatform: "PINTEREST",
    buildSystemPrompt: (context) =>
      baseInstruction(
        "Convierte el contenido en una descripción de Pin de Pinterest: breve, orientada a la búsqueda, con palabras clave naturales y una idea clara de qué encontrará el usuario.",
        context
      ),
    buildUserPrompt: (text) => userPrompt("un Pin de Pinterest", text),
  },
  {
    id: "email",
    label: "Email",
    contentType: "EMAIL",
    buildSystemPrompt: (context) =>
      baseInstruction("Convierte el contenido en un correo de email marketing: asunto sugerido en la primera línea, cuerpo breve y escaneable, CTA claro al final.", context),
    buildUserPrompt: (text) => userPrompt("un correo de email marketing", text),
  },
  {
    id: "blog-corto",
    label: "Blog corto",
    contentType: "BLOG_POST",
    buildSystemPrompt: (context) =>
      baseInstruction("Resume el contenido en un artículo de blog corto (300-500 palabras), con un subtítulo y estructura clara.", context),
    buildUserPrompt: (text) => userPrompt("un artículo de blog corto", text),
  },
  {
    id: "newsletter",
    label: "Newsletter",
    contentType: "NEWSLETTER",
    buildSystemPrompt: (context) =>
      baseInstruction("Convierte el contenido en una sección de newsletter: tono personal como si se lo contaras a un suscriptor, cierre con una idea o enlace.", context),
    buildUserPrompt: (text) => userPrompt("una sección de newsletter", text),
  },
  {
    id: "video-script",
    label: "Guion de vídeo",
    contentType: "VIDEO_SCRIPT",
    buildSystemPrompt: (context) =>
      baseInstruction("Convierte el contenido en un guion de vídeo con escenas/beats marcados (ej. [Escena 1], [Escena 2]), narración hablada, natural.", context),
    buildUserPrompt: (text) => userPrompt("un guion de vídeo", text),
  },
];

export function findRepurposeChannel(id: string): RepurposeChannelDefinition | undefined {
  return REPURPOSE_CHANNELS.find((channel) => channel.id === id);
}
