import type { PublishingProvider, PublishingProviderId } from "@/lib/publishing/providers/types";

/**
 * Every adapter in Fase 29 is one of these — always reports itself as not
 * configured, always refuses to publish. This is intentional and permanent
 * for this phase (no external social/CMS API is connected yet); a future
 * phase replaces individual adapters with real implementations conforming
 * to the exact same PublishingProvider interface, never a different shape.
 */
export function createNotConfiguredAdapter(id: PublishingProviderId, label: string): PublishingProvider {
  const reason = `${label} no está conectado todavía. Esta fase deja la interfaz lista para conectarlo en el futuro.`;

  return {
    id,
    label,
    async validate() {
      return { valid: false, errors: [reason] };
    },
    async publish() {
      return { success: false, errorCode: "not_configured", errorMessage: reason, isRetryable: false };
    },
    async cancel() {
      return { success: false, errorMessage: reason };
    },
    async getStatus() {
      return { configured: false, reason };
    },
    async refreshCredentials() {
      return { success: false, errorMessage: reason };
    },
  };
}
