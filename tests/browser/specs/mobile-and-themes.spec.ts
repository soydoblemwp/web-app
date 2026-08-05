import { test, expect } from "@playwright/test";
import { fixture } from "../helpers";

const PAGES = [
  "/herramientas",
  "/herramientas/recortar-audio",
  "/herramientas/comprimir-video",
  "/herramientas/editar-subtitulos",
  "/herramientas/grabador-de-voz",
  "/herramientas/grabador-de-pantalla",
  // Fase 46 — spec section 43 explicitly calls out these tool shapes for mobile review:
  // scientific calculator, amortization table, meeting planner, timesheet, stopwatch,
  // Pomodoro, typing test, comparator.
  "/herramientas/calculadora-cientifica",
  "/herramientas/calculadora-prestamos",
  "/herramientas/planificador-reuniones-zonas-horarias",
  "/herramientas/calculadora-horas-trabajadas",
  "/herramientas/cronometro-temporizador",
  "/herramientas/temporizador-pomodoro",
  "/herramientas/prueba-velocidad-escritura",
  "/herramientas/comparar-textos",
  // Fase 47 — spec section 50 explicitly calls out these tool shapes for mobile review:
  // resume, cover letter, business card, receipt, calendar, planner, checklist, labels.
  "/herramientas/crear-curriculum-cv",
  "/herramientas/generador-carta-presentacion",
  "/herramientas/generador-tarjetas-presentacion",
  "/herramientas/generador-recibos",
  "/herramientas/generador-calendarios-imprimibles",
  "/herramientas/generador-planificador-semanal-mensual",
  "/herramientas/generador-listas-verificacion",
  "/herramientas/generador-etiquetas-pegatinas",
  // Fase 47 correction — the certificate tool's template count grew from 3 to 6; verify its mobile layout too.
  "/herramientas/generador-certificados-reconocimiento",
  // Fase 48 — spec section 43 explicitly calls out these tool shapes for mobile review:
  // break-even, inventory, profitability, GPA, trip cost, recipes, electricity.
  "/herramientas/calculadora-punto-equilibrio",
  "/herramientas/calculadora-inventario-reposicion",
  "/herramientas/calculadora-rentabilidad-productos",
  "/herramientas/calculadora-gpa-promedio",
  "/herramientas/calculadora-costo-combustible-viaje",
  "/herramientas/escalar-recetas",
  "/herramientas/calculadora-consumo-electrico",
];

/**
 * Runs under the "chromium-mobile" project (Pixel 7 viewport, see
 * playwright.config.ts) — real mobile-viewport checks across the 6
 * representative pages the correction requires (spec section 20).
 */
test.describe("Mobile viewport: no horizontal overflow, controls reachable", () => {
  for (const path of PAGES) {
    test(`${path}: no horizontal scroll, primary controls are visible and tappable`, async ({ page }) => {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(overflow, `${path} overflows horizontally on a mobile viewport`).toBe(false);

      // At least one real, visible, non-zero-size primary action exists (upload/record button).
      const primaryButton = page.getByRole("button").first();
      await expect(primaryButton).toBeVisible();
      const box = await primaryButton.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThan(0);
      expect(box!.height).toBeGreaterThan(0);
    });
  }

  test("recortar-audio: manual time-entry fields (the accessible alternative to dragging) remain usable on a small viewport", async ({ page }) => {
    await page.goto("/herramientas/recortar-audio");
    await page.getByLabel("Seleccionar archivo", { exact: true }).setInputFiles(fixture("tone-a-440hz.wav"));
    const startInput = page.getByLabel("Inicio");
    const endInput = page.getByLabel("Final");
    await expect(startInput).toBeVisible();
    await expect(endInput).toBeVisible();
    const startBox = await startInput.boundingBox();
    expect(startBox!.width).toBeGreaterThan(20); // not collapsed to unusable width
  });
});

test.describe("Themes: Light, Dark, and System all render without breaking layout", () => {
  test("System preference (dark) is honored with no explicit override", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/herramientas/recortar-audio");
    const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    expect(isDark).toBe(true);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
  });

  test("System preference (light) is honored with no explicit override", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/herramientas/recortar-audio");
    const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    expect(isDark).toBe(false);
  });

  test("explicit Dark override renders real dark-mode styling (background/foreground contrast), regardless of OS preference", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("theme", "dark"));
    await page.emulateMedia({ colorScheme: "light" }); // OS says light — explicit override must win
    await page.goto("/herramientas/comprimir-video");
    const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    expect(isDark).toBe(true);

    const colors = await page.evaluate(() => {
      const style = getComputedStyle(document.body);
      return { bg: style.backgroundColor, color: style.color };
    });
    expect(colors.bg).not.toBe(colors.color); // real, distinguishable background vs text color
  });

  test("explicit Light override renders real light-mode styling, regardless of OS preference", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("theme", "light"));
    await page.emulateMedia({ colorScheme: "dark" }); // OS says dark — explicit override must win
    await page.goto("/herramientas/editar-subtitulos");
    const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    expect(isDark).toBe(false);
  });

  test("Fase 47 correction: the résumé builder (now 5 templates) renders correctly under Dark, Light, and System", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("theme", "dark"));
    await page.goto("/herramientas/crear-curriculum-cv");
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(true);
    await expect(page.getByLabel("Plantilla")).toBeVisible();

    await page.addInitScript(() => localStorage.setItem("theme", "light"));
    await page.goto("/herramientas/crear-curriculum-cv");
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(false);

    await page.addInitScript(() => localStorage.removeItem("theme"));
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/herramientas/crear-curriculum-cv");
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(true);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
  });

  test("Fase 48: the break-even calculator renders correctly under Dark, Light, and System", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("theme", "dark"));
    await page.goto("/herramientas/calculadora-punto-equilibrio");
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(true);
    await expect(page.getByLabel("Costes fijos")).toBeVisible();

    await page.addInitScript(() => localStorage.setItem("theme", "light"));
    await page.goto("/herramientas/calculadora-punto-equilibrio");
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(false);

    await page.addInitScript(() => localStorage.removeItem("theme"));
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/herramientas/calculadora-punto-equilibrio");
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(true);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
  });
});
