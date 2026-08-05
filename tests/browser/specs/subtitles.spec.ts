import { test, expect } from "@playwright/test";
import { fixture } from "../helpers";

test.describe("editar-subtitulos: real browser interaction (no FFmpeg dependency)", () => {
  test("loads a real .srt file, edits a cue, shifts all times, converts to VTT, and downloads a re-loadable result", async ({ page }) => {
    await page.goto("/herramientas/editar-subtitulos");
    await page.getByLabel("Seleccionar archivo", { exact: true }).setInputFiles(fixture("sample.srt"));

    // Real parse happened — cue text fields are now editable.
    await expect(page.getByLabel("Texto cue 1")).toHaveValue("Primer subtitulo de prueba");

    // Edit cue 1's text directly.
    await page.getByLabel("Texto cue 1").fill("Subtitulo editado");
    await expect(page.locator("textarea[readonly]").first()).toContainText("Subtitulo editado");

    // Shift all times by +1 second and confirm the cue's start time field updates for real.
    await page.getByLabel("Desplazar todos los tiempos").fill("1");
    await page.getByRole("button", { name: "Aplicar desplazamiento" }).click();
    await expect(page.getByLabel("Inicio cue 1")).toHaveValue("00:01.000");

    // Convert: the VTT output pane should reflect the edited text and shifted time.
    const vttText = await page.locator("textarea[readonly]").nth(1).inputValue();
    expect(vttText).toContain("WEBVTT");
    expect(vttText).toContain("Subtitulo editado");
    expect(vttText).toMatch(/00:00:01\.000/);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar .vtt" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("subtitulos.vtt");

    const fs = await import("node:fs");
    const downloadedText = fs.readFileSync((await download.path())!, "utf8");
    expect(downloadedText).toContain("WEBVTT");
    expect(downloadedText).toContain("Subtitulo editado");
  });

  test("detects an overlap between two cues after manual editing, in real time in the browser", async ({ page }) => {
    await page.goto("/herramientas/editar-subtitulos");
    await page.getByLabel("Pega el contenido SRT o WebVTT").fill(
      "1\n00:00:00,000 --> 00:00:03,000\nUno\n\n2\n00:00:01,000 --> 00:00:04,000\nDos\n"
    );
    await page.getByRole("button", { name: "Analizar" }).click();
    await expect(page.getByText("Se solapa con otro cue.")).toHaveCount(2);
  });

  test("never renders a <script> tag typed into cue text as live markup (real DOM check, not just source inspection)", async ({ page }) => {
    await page.goto("/herramientas/editar-subtitulos");
    await page.getByLabel("Pega el contenido SRT o WebVTT").fill("1\n00:00:00,000 --> 00:00:02,000\nHola\n");
    await page.getByRole("button", { name: "Analizar" }).click();
    await page.getByLabel("Texto cue 1").fill("<script>window.__xssFired = true;</script>hola");

    const scriptTagCount = await page.locator("script:has-text('__xssFired')").count();
    expect(scriptTagCount).toBe(0);
    const xssFired = await page.evaluate(() => (window as unknown as { __xssFired?: boolean }).__xssFired);
    expect(xssFired).toBeUndefined();
  });

  test("round-trips a loaded VTT file through the editor without losing cues", async ({ page }) => {
    await page.goto("/herramientas/editar-subtitulos");
    await page.getByText("o carga un archivo .srt/.vtt").locator("..").getByLabel("Seleccionar archivo", { exact: true }).setInputFiles(fixture("sample.vtt"));
    await expect(page.getByLabel("Texto cue 1")).toHaveValue("Primer subtitulo de prueba");
    await expect(page.getByLabel("Texto cue 2")).toHaveValue("Segundo subtitulo de prueba");
  });
});
