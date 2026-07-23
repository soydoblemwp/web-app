"use server";

import { getClientIp } from "@/lib/security/client-ip";
import { generateGuestAIContent } from "@/lib/ai/guest-service";
import { AIProviderError } from "@/lib/ai/types";
import { buildContentGenerationPrompt, buildContentGenerationSystemPrompt } from "@/lib/ai/prompts/content";
import { buildReplyPrompt, buildReplySystemPrompt } from "@/lib/ai/prompts/reply";
import {
  GUEST_CONTEXT_NOTE,
  buildContentAdapterPrompt,
  buildContentAdapterSystemPrompt,
  buildSocialIdeasPrompt,
  buildSocialIdeasSystemPrompt,
} from "@/lib/ai/prompts/guest";
import type { ContentType } from "@/generated/prisma/enums";

export interface GuestToolFormState {
  text?: string;
  title?: string;
  error?: string;
}

function errorState(error: unknown, fallback: string): GuestToolFormState {
  return { error: error instanceof AIProviderError ? error.message : fallback };
}

export async function generateGuestContentAction(
  _prevState: GuestToolFormState,
  formData: FormData
): Promise<GuestToolFormState> {
  const topic = String(formData.get("topic") ?? "").trim();
  if (!topic) return { error: "Describe el tema del contenido." };
  if (topic.length > 2000) return { error: "El tema es demasiado largo." };

  const type = String(formData.get("type") ?? "BLOG_POST") as ContentType;
  const language = String(formData.get("language") ?? "es").trim() || "es";

  const system = buildContentGenerationSystemPrompt(GUEST_CONTEXT_NOTE);
  const prompt = buildContentGenerationPrompt({
    projectId: "guest",
    type,
    topic,
    objective: String(formData.get("objective") ?? ""),
    audience: String(formData.get("audience") ?? ""),
    tone: String(formData.get("tone") ?? ""),
    language,
    keywords: String(formData.get("keywords") ?? ""),
    forbiddenWords: String(formData.get("forbiddenWords") ?? ""),
    cta: String(formData.get("cta") ?? ""),
    useBrandKit: false,
  });

  try {
    const ip = await getClientIp();
    const { text } = await generateGuestAIContent({ clientKey: ip, system, prompt });
    return { text, title: topic };
  } catch (error) {
    return errorState(error, "No se pudo generar el contenido.");
  }
}

export async function generateGuestSocialIdeasAction(
  _prevState: GuestToolFormState,
  formData: FormData
): Promise<GuestToolFormState> {
  const topic = String(formData.get("topic") ?? "").trim();
  if (!topic) return { error: "Describe sobre qué quieres ideas." };
  if (topic.length > 1000) return { error: "El tema es demasiado largo." };

  const countRaw = Number(formData.get("count") ?? 5);
  const count = Number.isFinite(countRaw) ? Math.min(Math.max(Math.round(countRaw), 1), 10) : 5;

  const platform = String(formData.get("platform") ?? "Instagram");
  const system = buildSocialIdeasSystemPrompt();
  const prompt = buildSocialIdeasPrompt({
    topic,
    platform,
    tone: String(formData.get("tone") ?? "Cercano y profesional"),
    language: String(formData.get("language") ?? "es").trim() || "es",
    count,
  });

  try {
    const ip = await getClientIp();
    const { text } = await generateGuestAIContent({ clientKey: ip, system, prompt });
    return { text, title: `Ideas para ${platform}: ${topic}` };
  } catch (error) {
    return errorState(error, "No se pudieron generar ideas.");
  }
}

export async function generateGuestContentAdaptationAction(
  _prevState: GuestToolFormState,
  formData: FormData
): Promise<GuestToolFormState> {
  const originalContent = String(formData.get("originalContent") ?? "").trim();
  if (!originalContent) return { error: "Pega el contenido original a adaptar." };
  if (originalContent.length > 8000) return { error: "El contenido original es demasiado largo." };

  const targetPlatform = String(formData.get("targetPlatform") ?? "Instagram");
  const system = buildContentAdapterSystemPrompt();
  const prompt = buildContentAdapterPrompt({
    originalContent,
    targetPlatform,
    tone: String(formData.get("tone") ?? "Igual que el original"),
    language: String(formData.get("language") ?? "es").trim() || "es",
  });

  try {
    const ip = await getClientIp();
    const { text } = await generateGuestAIContent({ clientKey: ip, system, prompt });
    return { text, title: `Adaptado para ${targetPlatform}` };
  } catch (error) {
    return errorState(error, "No se pudo adaptar el contenido.");
  }
}

export async function generateGuestReplyAction(
  _prevState: GuestToolFormState,
  formData: FormData
): Promise<GuestToolFormState> {
  const context = String(formData.get("context") ?? "").trim();
  if (!context) return { error: "Pega el mensaje al que quieres responder." };
  if (context.length > 4000) return { error: "El mensaje es demasiado largo." };

  const system = buildReplySystemPrompt(GUEST_CONTEXT_NOTE);
  const prompt = buildReplyPrompt({
    context,
    replyType: String(formData.get("replyType") ?? "Comentario positivo"),
    platform: String(formData.get("platform") ?? "Instagram"),
    tone: String(formData.get("tone") ?? "Cercano y profesional"),
    language: String(formData.get("language") ?? "es").trim() || "es",
  });

  try {
    const ip = await getClientIp();
    const { text } = await generateGuestAIContent({ clientKey: ip, system, prompt });
    return { text, title: `Respuesta: ${context.slice(0, 60)}` };
  } catch (error) {
    return errorState(error, "No se pudo generar la respuesta.");
  }
}
