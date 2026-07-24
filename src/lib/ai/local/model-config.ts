import { prebuiltAppConfig } from "@mlc-ai/web-llm";

/**
 * The single source of truth for which local model the app downloads and
 * runs. Every other module must import this constant instead of hardcoding
 * a model id.
 *
 * Picked from the real `webllm.prebuiltAppConfig.model_list` (never a
 * guessed identifier): a Qwen Instruct model in the 1B-3B range, per the
 * project's model-selection policy. Qwen2.5-1.5B was chosen over the 3B
 * variant as the best size/quality balance for a first download on
 * low-resource devices (`low_resource_required: true`, ~1.6GB).
 */
export const LOCAL_MODEL_ID = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";

const modelRecord = prebuiltAppConfig.model_list.find((model) => model.model_id === LOCAL_MODEL_ID);

if (!modelRecord) {
  throw new Error(
    `El modelo local "${LOCAL_MODEL_ID}" ya no está disponible en @mlc-ai/web-llm. Actualiza LOCAL_MODEL_ID en src/lib/ai/local/model-config.ts con un identificador real de prebuiltAppConfig.model_list.`
  );
}

/** VRAM requirement reported by web-llm for the selected model — the closest real figure we have to a download size. */
export const LOCAL_MODEL_VRAM_MB = modelRecord.vram_required_MB ?? null;

export const LOCAL_MODEL_APPROX_SIZE_LABEL =
  LOCAL_MODEL_VRAM_MB != null ? `~${(LOCAL_MODEL_VRAM_MB / 1024).toFixed(1)} GB` : null;

export const LOCAL_MODEL_LOW_RESOURCE = modelRecord.low_resource_required ?? false;
