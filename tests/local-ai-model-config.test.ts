import { describe, expect, it } from "vitest";
import { prebuiltAppConfig } from "@mlc-ai/web-llm";
import { LOCAL_MODEL_ID, LOCAL_MODEL_APPROX_SIZE_LABEL } from "@/lib/ai/local/model-config";

describe("local model selection", () => {
  it("picks a model id that actually exists in webllm.prebuiltAppConfig.model_list", () => {
    const record = prebuiltAppConfig.model_list.find((m) => m.model_id === LOCAL_MODEL_ID);
    expect(record).toBeDefined();
  });

  it("picks a Qwen Instruct model, per the project's model-selection policy", () => {
    expect(LOCAL_MODEL_ID).toMatch(/^Qwen/i);
    expect(LOCAL_MODEL_ID).toMatch(/Instruct/i);
  });

  it("picks a model in the 1B-3B parameter range", () => {
    const paramsMatch = LOCAL_MODEL_ID.match(/(\d+(?:\.\d+)?)B/i);
    expect(paramsMatch).not.toBeNull();
    const params = Number(paramsMatch?.[1]);
    expect(params).toBeGreaterThanOrEqual(1);
    expect(params).toBeLessThanOrEqual(3);
  });

  it("exposes an approximate download size derived from the real model record", () => {
    expect(LOCAL_MODEL_APPROX_SIZE_LABEL).toMatch(/^~[\d.]+ GB$/);
  });
});
