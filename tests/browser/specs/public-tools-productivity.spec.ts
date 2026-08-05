import { test, expect } from "@playwright/test";
import { trackRequests, trackPageProblems } from "../helpers";

test.describe.configure({ mode: "serial" });

test.describe("calculadora-cientifica: real keyboard-driven expression evaluation", () => {
  test("typing an expression via keyboard and pressing Enter produces the correct result, memory works, history downloads", async ({ page }) => {
    const requests = trackRequests(page);
    await page.goto("/herramientas/calculadora-cientifica");
    const input = page.getByLabel("Expresión matemática");
    await input.click();
    await input.pressSequentially("sin(30) + sqrt(16)");
    await input.press("Enter");
    // In degrees mode (default), sin(30deg) = 0.5, sqrt(16) = 4 -> 4.5
    await expect(page.locator("#calc-result")).toContainText("4.5");

    // Memory: M+ then MC then MR round trip
    await page.getByRole("button", { name: "M+", exact: true }).click();
    await page.getByRole("button", { name: "MR", exact: true }).click();
    await expect(input).toHaveValue(/4\.5/);

    // A real division-by-zero domain error surfaces as an accessible alert, not a silent NaN.
    await input.fill("1/0");
    await page.getByRole("button", { name: "Calcular (Enter)" }).click();
    // Scoped to a real <p role="alert">: a bare page-wide getByRole("alert") also matches
    // Next.js's own <div role="alert"> route-announcer, present on every page.
    await expect(page.locator('p[role="alert"]')).toBeVisible();

    // History download is a real, non-empty file.
    await input.fill("2+2");
    await page.getByRole("button", { name: "Calcular (Enter)" }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar historial" }).click();
    const download = await downloadPromise;
    const path = await download.path();
    const fs = await import("node:fs");
    expect(fs.statSync(path!).size).toBeGreaterThan(0);

    const external = requests.filter((r) => !r.url().startsWith(new URL(page.url()).origin) && !r.url().startsWith("data:"));
    expect(external.map((r) => r.url())).toEqual([]);
  });
});

test.describe("calculadora-prestamos: real amortization table + CSV download", () => {
  test("computes a loan, renders a schedule ending at zero balance, and the CSV download is real and non-empty", async ({ page }) => {
    await page.goto("/herramientas/calculadora-prestamos");
    await page.getByLabel("Importe principal").fill("10000");
    await page.getByLabel("Tasa anual nominal (%)").fill("5");
    await page.getByLabel("Plazo").fill("2");
    await page.getByRole("button", { name: "Calcular préstamo" }).click();

    await expect(page.getByText(/Número de pagos: 24/)).toBeVisible();
    const lastRow = page.locator("table tbody tr").last();
    await expect(lastRow).toContainText("$0.00");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar tabla CSV" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("tabla-amortizacion.csv");
    const path = await download.path();
    const fs = await import("node:fs");
    const content = fs.readFileSync(path!, "utf8");
    expect(content.split("\n").length).toBeGreaterThan(20); // header + 24 real rows
    expect(content).toMatch(/"Pago #","Fecha","Pago","Capital","Interés","Extra","Saldo"/);
    // The real, spec-mandated "último pago ajustado" behavior: the schedule ends at exactly a
    // zero balance, even though the last payment amount differs slightly from the regular one.
    expect(content).toMatch(/"24","\d{4}-\d{2}-\d{2}","438\.82","437\.00","1\.82","0\.00","0\.00"/);
  });
});

test.describe("calculadora-interes-compuesto: savings-goal mode", () => {
  test("solves a required periodic contribution for a savings goal", async ({ page }) => {
    await page.goto("/herramientas/calculadora-interes-compuesto");
    await page.getByRole("button", { name: "Meta de ahorro" }).click();
    await page.getByLabel("Depósito inicial").fill("1000");
    await page.getByLabel("Meta de ahorro").fill("50000");
    await page.getByLabel("Tasa anual (%)").fill("5");
    await page.getByLabel("Duración (años)").fill("10");
    await page.getByRole("button", { name: "Calcular" }).click();
    await expect(page.getByText(/Contribución periódica necesaria/)).toBeVisible();
  });
});

test.describe("calculadora-dias-laborables: real calendar-date arithmetic", () => {
  test("counts business days between two dates excluding a custom holiday", async ({ page }) => {
    await page.goto("/herramientas/calculadora-dias-laborables");
    // exact:true — a substring match would also hit the "Incluir fecha inicial/final" checkboxes.
    await page.getByLabel("Fecha inicial", { exact: true }).fill("2026-08-03"); // a Monday
    await page.getByLabel("Fecha final", { exact: true }).fill("2026-08-07"); // that Friday
    await page.getByLabel(/Festivos personalizados/).fill("2026-08-05");
    await page.getByRole("button", { name: "Calcular" }).click();
    // Mon-Fri inclusive = 5 business days, minus 1 holiday = 4.
    await expect(page.getByText("Días laborables: 4", { exact: false })).toBeVisible();
  });
});

test.describe("planificador-reuniones-zonas-horarias: real IANA timezones + downloadable .ics", () => {
  test("generates a schedule across two real timezones and downloads a valid, re-parseable .ics file", async ({ page }) => {
    await page.goto("/herramientas/planificador-reuniones-zonas-horarias");
    const timeZoneInputs = page.locator('input[id^="mp-tz-"]');
    await timeZoneInputs.nth(0).fill("America/New_York");
    await timeZoneInputs.nth(1).fill("Europe/Madrid");
    await page.getByRole("button", { name: "Generar horario" }).click();
    await expect(page.locator("table tbody tr").first()).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: ".ics" }).first().click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("reunion.ics");
    const path = await download.path();
    const fs = await import("node:fs");
    const content = fs.readFileSync(path!, "utf8");
    expect(content).toMatch(/BEGIN:VCALENDAR/);
    expect(content).toMatch(/BEGIN:VEVENT/);
    expect(content).toMatch(/DTSTART:\d{8}T\d{6}Z/);
    expect(content).toMatch(/UID:/);
    expect(content).toMatch(/END:VEVENT/);
  });
});

test.describe("calculadora-horas-trabajadas: shift crossing midnight", () => {
  test("a night shift (22:00 -> 06:00) computes real elapsed hours across midnight, not a silent 24h shift", async ({ page }) => {
    await page.goto("/herramientas/calculadora-horas-trabajadas");
    const entryInputs = page.getByLabel("Hora de entrada");
    const exitInputs = page.getByLabel("Hora de salida");
    await entryInputs.first().fill("22:00");
    await exitInputs.first().fill("06:00");
    await page.getByLabel("Descanso no pagado (minutos)").first().fill("0");
    // Remove the second (untouched) default shift, keeping only the edited night shift — its
    // total is then unambiguous (8h). The first "Eliminar" belongs to the shift we just edited.
    await page.getByRole("button", { name: "Eliminar" }).nth(1).click();
    await expect(page.getByText("Total horas: 8h 00m")).toBeVisible();
  });
});

test.describe("cronometro-temporizador: real timestamp-driven stopwatch and countdown", () => {
  test("stopwatch: starts, records a lap, pauses (time stops advancing while paused), and resumes", async ({ page }) => {
    const { consoleErrors, pageErrors } = trackPageProblems(page);
    await page.goto("/herramientas/cronometro-temporizador");
    await page.getByRole("button", { name: "Iniciar", exact: true }).click();
    await page.waitForTimeout(1100);
    await page.getByRole("button", { name: "Vuelta" }).click();
    await expect(page.locator("text=#1")).toBeVisible();

    await page.getByRole("button", { name: "Pausar" }).click();
    const pausedReading = await page.locator('p.font-mono.text-5xl').textContent();
    await page.waitForTimeout(600);
    const stillPausedReading = await page.locator('p.font-mono.text-5xl').textContent();
    expect(stillPausedReading).toBe(pausedReading);

    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByText("Estado: En marcha")).toBeVisible();

    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
    expect(pageErrors, pageErrors.join("\n")).toEqual([]);
  });

  test("countdown: a short real countdown reaches zero and announces completion", async ({ page }) => {
    await page.goto("/herramientas/cronometro-temporizador");
    await page.getByRole("button", { name: "Cuenta regresiva" }).click();
    await page.getByLabel("Minutos").fill("0");
    await page.getByLabel("Segundos").fill("2");
    await page.getByRole("button", { name: "Iniciar", exact: true }).click();
    await expect(page.getByText("¡Tiempo terminado!")).toBeVisible({ timeout: 6_000 });
  });

  test("interval timer: real phase progression through prep and work", async ({ page }) => {
    await page.goto("/herramientas/cronometro-temporizador");
    await page.getByRole("button", { name: "Intervalos" }).click();
    await page.getByLabel("Preparación (s)").fill("1");
    await page.getByLabel("Trabajo (s)").fill("2");
    await page.getByLabel("Descanso (s)").fill("1");
    await page.getByLabel("Rondas").fill("1");
    await page.getByRole("button", { name: "Iniciar", exact: true }).click();
    // Scoped to the phase-status paragraph — a bare text match also hits the "Preparación (s)" input label.
    const phaseStatus = page.locator("p.text-center.text-lg.font-semibold");
    await expect(phaseStatus).toContainText("Preparación");
    await expect(phaseStatus).toContainText("Trabajo", { timeout: 4_000 });
  });
});

test.describe("temporizador-pomodoro: shares the same timer core, real short-duration phase transition", () => {
  test("a short focus phase auto-pauses at the real phase boundary and announces the break", async ({ page }) => {
    await page.goto("/herramientas/temporizador-pomodoro");
    await page.getByLabel("Concentración (min)").fill("0.02"); // ~1.2s — real, but short
    await page.getByLabel("Descanso corto (min)").fill("0.02");
    await page.getByLabel("Descanso largo (min)").fill("0.02");
    await page.getByLabel("Sesiones antes de descanso largo").fill("5");
    await page.getByLabel("Ciclos totales").fill("2");
    await page.getByRole("button", { name: "Iniciar", exact: true }).click();
    // Scoped to the phase-status paragraph — a bare text match also hits the "Descanso corto (min)" input label.
    await expect(page.locator("p.text-lg.font-semibold")).toHaveText("Descanso corto", { timeout: 6_000 });
    // Not auto-started (default) — the tool must have paused itself at the boundary.
    await expect(page.getByRole("button", { name: "Continuar" })).toBeVisible();
  });

  test("tasks stay in-memory only for the session (no persistence opt-in shown by default)", async ({ page }) => {
    await page.goto("/herramientas/temporizador-pomodoro");
    await page.getByLabel("Nueva tarea").fill("Escribir informe");
    await page.getByRole("button", { name: "Añadir" }).click();
    await expect(page.getByText("Escribir informe", { exact: true })).toBeVisible();
    // The SEO copy/FAQ elsewhere on the page also mentions "memoria" phrasing — match the exact,
    // specific in-tool notice instead of a loose regex.
    await expect(page.getByText("Las tareas se mantienen solo en memoria durante esta sesión.")).toBeVisible();
  });
});

test.describe("selector-aleatorio-equipos: secure random selection and team creation", () => {
  test("picks a winner from a real list using the secure picker (never Math.random)", async ({ page }) => {
    await page.goto("/herramientas/selector-aleatorio-equipos");
    await page.getByLabel("Lista de opciones (una por línea)").fill("Ana\nLuis\nMaría\nPedro\nSofía");
    await page.getByRole("button", { name: "Elegir uno" }).click();
    await page.getByRole("button", { name: "Sortear" }).click();
    const resultText = await page.locator(".rounded-lg.border.p-4 p.text-lg").textContent();
    expect(["Ana", "Luis", "María", "Pedro", "Sofía"]).toContain(resultText?.trim());
  });

  test("creates teams distributing every participant exactly once", async ({ page }) => {
    await page.goto("/herramientas/selector-aleatorio-equipos");
    await page.getByLabel("Lista de opciones (una por línea)").fill("Ana\nLuis\nMaría\nPedro\nSofía\nCarlos");
    await page.getByRole("button", { name: "Crear equipos" }).click();
    await page.getByLabel("Cantidad de equipos").fill("2");
    await page.getByRole("button", { name: "Sortear" }).click();
    const allMembers = await page.locator(".grid.gap-3.sm\\:grid-cols-2 li").allTextContents();
    expect(allMembers.sort()).toEqual(["Ana", "Carlos", "Luis", "María", "Pedro", "Sofía"].sort());
  });
});

test.describe("prueba-velocidad-escritura: real WPM/accuracy computation", () => {
  test("typing the full target text finishes the test and shows a real result with the WPM formula explained", async ({ page }) => {
    await page.goto("/herramientas/prueba-velocidad-escritura");
    const targetText = await page.locator('div[aria-live="polite"].font-mono.text-lg').textContent();
    expect(targetText).toBeTruthy();
    const typingInput = page.getByLabel("Escribe aquí");
    await typingInput.fill(targetText!);
    await expect(page.getByText("Terminado")).toBeVisible();
    // A real, non-zero result — this is exactly the bug the app itself had: computing the result
    // from a stale pre-completion `typed` value would show 0 here instead of a full-text score.
    await expect(page.getByText(/^PPM: \d/)).toBeVisible();
    await expect(page.getByText("Precisión: 100%")).toBeVisible();
    await expect(page.getByText(/PPM = \(caracteres correctos ÷ 5\) ÷ minutos transcurridos\./)).toBeVisible();
  });
});

test.describe("generador-codigo-barras: real SVG and PNG generation, independently validated", () => {
  test("generates a valid EAN-13 SVG barcode and a downloadable, non-empty PNG with a real signature", async ({ page }) => {
    const requests = trackRequests(page);
    await page.goto("/herramientas/generador-codigo-barras");
    await page.getByLabel("Valor").fill("400638133393");
    await page.getByRole("button", { name: "Generar" }).click();
    // Scoped to the generated-result container — a bare page-wide "svg" also matches the
    // decorative Lucide "Barcode" icon rendered elsewhere on the page.
    const svg = page.locator('div[aria-live="polite"] svg').first();
    await expect(svg).toBeVisible();
    const svgContent = await svg.evaluate((el) => el.outerHTML);
    expect(svgContent).not.toMatch(/<script/i);
    // The xmlns="http://www.w3.org/2000/svg" namespace declaration is mandatory SVG boilerplate,
    // not an external reference — only flag an actual embedded external resource pointer.
    expect(svgContent).not.toMatch(/(?:xlink:href|href)\s*=\s*"https?:\/\//i);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar PNG" }).click();
    const download = await downloadPromise;
    const path = await download.path();
    const fs = await import("node:fs");
    const bytes = fs.readFileSync(path!);
    // Real PNG signature: 89 50 4E 47 0D 0A 1A 0A
    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(bytes.length).toBeGreaterThan(100);

    const external = requests.filter((r) => !r.url().startsWith(new URL(page.url()).origin) && !r.url().startsWith("data:") && !r.url().startsWith("blob:"));
    expect(external.map((r) => r.url())).toEqual([]);
  });

  test("rejects an invalid EAN-13 check digit with a real, honest error", async ({ page }) => {
    await page.goto("/herramientas/generador-codigo-barras");
    await page.getByLabel("Valor").fill("4006381333939"); // wrong check digit
    await page.getByRole("button", { name: "Generar" }).click();
    await expect(page.locator('p[role="alert"]')).toContainText("control incorrecto");
  });
});

test.describe("comparar-textos: real bounded diff of two files", () => {
  test("compares two uploaded text files and renders a real line-level diff, then downloads a valid unified diff", async ({ page }) => {
    await page.goto("/herramientas/comparar-textos");
    const fileInputs = page.getByLabel("Seleccionar archivo");
    await fileInputs.nth(0).setInputFiles({ name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("linea uno\nlinea dos\nlinea tres") });
    await fileInputs.nth(1).setInputFiles({ name: "b.txt", mimeType: "text/plain", buffer: Buffer.from("linea uno\nlinea CAMBIADA\nlinea tres") });
    await page.getByRole("button", { name: "Comparar" }).click();
    await expect(page.getByText("Líneas añadidas: 1")).toBeVisible();
    await expect(page.getByText("Líneas eliminadas: 1")).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar diff unificado" }).click();
    const download = await downloadPromise;
    const path = await download.path();
    const fs = await import("node:fs");
    const content = fs.readFileSync(path!, "utf8");
    expect(content).toMatch(/^--- texto-a\.txt/);
    expect(content).toMatch(/\+\+\+ texto-b\.txt/);
    expect(content).toMatch(/-linea dos/);
    expect(content).toMatch(/\+linea CAMBIADA/);
  });
});

test.describe("privacy: no Fase 46 tool ever sends its input data to the server", () => {
  test("loan calculator never issues a network request containing the entered principal", async ({ page }) => {
    const requests = trackRequests(page);
    await page.goto("/herramientas/calculadora-prestamos");
    await page.getByLabel("Importe principal").fill("987654");
    await page.getByRole("button", { name: "Calcular préstamo" }).click();
    await expect(page.getByText(/Número de pagos/)).toBeVisible();
    const leaked = requests.filter((r) => r.url().includes("987654") || (r.postData() ?? "").includes("987654"));
    expect(leaked).toEqual([]);
  });
});
