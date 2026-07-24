import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createLocalAIWorker = vi.fn();
const createLocalAIEngine = vi.fn();

vi.mock("@/lib/ai/local/worker-client", () => ({
  createLocalAIWorker: (...args: unknown[]) => createLocalAIWorker(...args),
  createLocalAIEngine: (...args: unknown[]) => createLocalAIEngine(...args),
}));

function makeFakeWorker() {
  return { terminate: vi.fn(), onerror: null as null | (() => void) };
}

function makeFakeEngine() {
  return {
    interruptGenerate: vi.fn(),
    chat: { completions: { create: vi.fn() } },
  };
}

describe("local AI engine (src/lib/ai/local/engine.ts)", () => {
  beforeEach(() => {
    vi.resetModules();
    createLocalAIWorker.mockReset();
    createLocalAIEngine.mockReset();
    vi.stubGlobal("navigator", { gpu: {} });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports WebGPU as unsupported when navigator.gpu is absent", async () => {
    vi.stubGlobal("navigator", {});
    const { isWebGPUSupported } = await import("@/lib/ai/local/engine");
    expect(isWebGPUSupported()).toBe(false);
  });

  it("reports WebGPU as unsupported when there is no navigator at all", async () => {
    vi.stubGlobal("navigator", undefined);
    const { isWebGPUSupported } = await import("@/lib/ai/local/engine");
    expect(isWebGPUSupported()).toBe(false);
  });

  it("reports WebGPU as supported when navigator.gpu exists", async () => {
    const { isWebGPUSupported } = await import("@/lib/ai/local/engine");
    expect(isWebGPUSupported()).toBe(true);
  });

  it("throws a non-retryable, exact-copy error when WebGPU is unsupported", async () => {
    vi.stubGlobal("navigator", {});
    const { getLocalEngine } = await import("@/lib/ai/local/engine");
    const { LocalAIError } = await import("@/lib/ai/local/types");

    await expect(getLocalEngine()).rejects.toMatchObject({
      message:
        "Este dispositivo o navegador no admite la IA local. Utiliza una versión reciente de Chrome o Edge en un equipo compatible.",
      retryable: false,
    });
    await expect(getLocalEngine()).rejects.toBeInstanceOf(LocalAIError);
    expect(createLocalAIEngine).not.toHaveBeenCalled();
  });

  it("initializes the engine only once, even under concurrent/repeated calls", async () => {
    const worker = makeFakeWorker();
    const engine = makeFakeEngine();
    createLocalAIWorker.mockReturnValue(worker);
    createLocalAIEngine.mockResolvedValue(engine);

    const { getLocalEngine } = await import("@/lib/ai/local/engine");

    const [a, b] = await Promise.all([getLocalEngine(), getLocalEngine()]);
    const c = await getLocalEngine();

    expect(a).toBe(engine);
    expect(b).toBe(engine);
    expect(c).toBe(engine);
    expect(createLocalAIWorker).toHaveBeenCalledTimes(1);
    expect(createLocalAIEngine).toHaveBeenCalledTimes(1);
  });

  it("forwards model download/init progress to subscribed listeners", async () => {
    const worker = makeFakeWorker();
    const engine = makeFakeEngine();
    createLocalAIWorker.mockReturnValue(worker);

    let capturedCallback: ((report: { progress: number; text: string }) => void) | undefined;
    createLocalAIEngine.mockImplementation(async (_worker: unknown, config: { initProgressCallback?: typeof capturedCallback }) => {
      capturedCallback = config.initProgressCallback;
      return engine;
    });

    const { getLocalEngine, onEngineProgress } = await import("@/lib/ai/local/engine");

    const received: Array<{ progress: number; text: string }> = [];
    const unsubscribe = onEngineProgress((report) => received.push(report));

    await getLocalEngine();
    capturedCallback?.({ progress: 0.42, text: "Descargando pesos..." });

    expect(received).toEqual([{ progress: 0.42, text: "Descargando pesos..." }]);
    unsubscribe();
  });

  it("resets state and lets a later call retry after a load failure", async () => {
    const worker1 = makeFakeWorker();
    const worker2 = makeFakeWorker();
    const engine = makeFakeEngine();
    createLocalAIWorker.mockReturnValueOnce(worker1).mockReturnValueOnce(worker2);
    createLocalAIEngine.mockRejectedValueOnce(new Error("no adapter")).mockResolvedValueOnce(engine);

    const { getLocalEngine } = await import("@/lib/ai/local/engine");
    const { LocalAIError } = await import("@/lib/ai/local/types");

    await expect(getLocalEngine()).rejects.toBeInstanceOf(LocalAIError);
    expect(worker1.terminate).toHaveBeenCalledTimes(1);

    const result = await getLocalEngine();
    expect(result).toBe(engine);
    expect(createLocalAIWorker).toHaveBeenCalledTimes(2);
  });

  it("discards the engine and worker after the worker crashes, so the next call starts fresh", async () => {
    const worker1 = makeFakeWorker();
    const worker2 = makeFakeWorker();
    const engine1 = makeFakeEngine();
    const engine2 = makeFakeEngine();
    createLocalAIWorker.mockReturnValueOnce(worker1).mockReturnValueOnce(worker2);
    createLocalAIEngine.mockResolvedValueOnce(engine1).mockResolvedValueOnce(engine2);

    const { getLocalEngine } = await import("@/lib/ai/local/engine");

    const first = await getLocalEngine();
    expect(first).toBe(engine1);

    // Simulate the worker unexpectedly dying (e.g. lost GPU device).
    worker1.onerror?.();

    const second = await getLocalEngine();
    expect(second).toBe(engine2);
    expect(createLocalAIWorker).toHaveBeenCalledTimes(2);
  });

  it("generates text locally without ever calling fetch/XHR", async () => {
    const worker = makeFakeWorker();
    const engine = makeFakeEngine();
    (engine.chat.completions.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      choices: [{ message: { content: "Hola desde la IA local" } }],
    });
    createLocalAIWorker.mockReturnValue(worker);
    createLocalAIEngine.mockResolvedValue(engine);

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { generateLocalText } = await import("@/lib/ai/local/engine");
    const text = await generateLocalText({ system: "sys", prompt: "hola" });

    expect(text).toBe("Hola desde la IA local");
    expect(fetchSpy).not.toHaveBeenCalled();

    const request = (engine.chat.completions.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(request.messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "hola" },
    ]);
  });

  it("cancels an in-flight generation by interrupting the engine, without calling the network", async () => {
    const worker = makeFakeWorker();
    const engine = makeFakeEngine();
    let resolveCreate!: (value: { choices: Array<{ message: { content: string } }> }) => void;
    (engine.chat.completions.create as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((resolve) => (resolveCreate = resolve))
    );
    createLocalAIWorker.mockReturnValue(worker);
    createLocalAIEngine.mockResolvedValue(engine);

    const { generateLocalText } = await import("@/lib/ai/local/engine");
    const { LocalAIError } = await import("@/lib/ai/local/types");

    const controller = new AbortController();
    const pending = generateLocalText({ prompt: "hola" }, { signal: controller.signal });

    // Only abort once generation has actually started (create() was called) —
    // aborting before that would just short-circuit before any network/engine call.
    await vi.waitFor(() => expect(engine.chat.completions.create).toHaveBeenCalled());
    controller.abort();
    resolveCreate({ choices: [{ message: { content: "demasiado tarde" } }] });

    await expect(pending).rejects.toBeInstanceOf(LocalAIError);
    expect(engine.interruptGenerate).toHaveBeenCalledTimes(1);
  });
});
