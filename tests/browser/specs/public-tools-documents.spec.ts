import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { trackRequests } from "../helpers";
import { extractPdfDrawnText } from "../../helpers/pdf-text";

test.describe.configure({ mode: "serial" });

const RESUME_TEMPLATES = ["Sencilla", "Profesional", "Moderna", "Compacta", "Académica"];

test.describe("crear-curriculum-cv: real PDF generation across all 5 required minimum templates, JSON round trip", () => {
  test("creates a resume with an experience entry, downloads a real, distinct PDF for each of the 5 templates, exports and re-imports JSON", async ({ page }) => {
    await page.goto("/herramientas/crear-curriculum-cv");
    await page.getByLabel("Nombre completo").fill("CandidataPlaywrightReal");
    await page.getByLabel("Correo electrónico").fill("candidata@example.com");
    await page.getByLabel("Resumen profesional").fill("ResumenPlaywrightReal");

    await page.getByRole("button", { name: "Añadir entrada" }).first().click();
    await page.getByPlaceholder("Título / puesto").first().fill("PuestoPlaywrightReal");
    await page.getByPlaceholder("Organización").first().fill("EmpresaPlaywrightReal");

    const pdfSizes = new Set<number>();
    for (const templateLabel of RESUME_TEMPLATES) {
      await page.getByLabel("Plantilla").click();
      await page.getByRole("option", { name: templateLabel }).click();

      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "Descargar PDF" }).click();
      const download = await downloadPromise;
      const path = await download.path();
      expect(path, templateLabel).toBeTruthy();
      const bytes = fs.readFileSync(path!);
      expect(bytes.subarray(0, 4).toString(), templateLabel).toBe("%PDF");
      const text = extractPdfDrawnText(bytes);
      expect(text, templateLabel).toContain("CandidataPlaywrightReal");
      expect(text, templateLabel).toContain("PuestoPlaywrightReal");
      expect(text, templateLabel).toContain("EmpresaPlaywrightReal");
      pdfSizes.add(bytes.length);
    }
    // 5 genuinely different templates should not all serialize to the exact same byte count.
    expect(pdfSizes.size).toBeGreaterThan(1);

    const jsonDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar JSON" }).click();
    const jsonDownload = await jsonDownloadPromise;
    const jsonPath = await jsonDownload.path();
    const jsonContent = fs.readFileSync(jsonPath!, "utf8");
    expect(jsonContent).toContain("CandidataPlaywrightReal");

    await page.getByRole("button", { name: "Reiniciar" }).click();
    await expect(page.getByLabel("Nombre completo")).toHaveValue("");

    const fileInput = page.locator('input[type="file"][accept="application/json"]');
    await fileInput.setInputFiles(jsonPath!);
    await expect(page.getByLabel("Nombre completo")).toHaveValue("CandidataPlaywrightReal");
  });
});

const COVER_LETTER_MODES = ["Carta tradicional", "Carta moderna", "Carta breve", "Candidatura espontánea", "Seguimiento posterior a entrevista"];

test.describe("generador-carta-presentacion: placeholder detection, real PDF", () => {
  test("detects an unfilled placeholder and downloads a real PDF with the written paragraph", async ({ page }) => {
    await page.goto("/herramientas/generador-carta-presentacion");
    await page.getByLabel("Tu nombre").fill("CandidataCartaPlaywright");
    await page.locator("#cl-openingParagraph").fill("Escribo para el puesto de [Puesto solicitado].");
    // Scoped to the real warning list item — a bare "marcador" text match also hits unrelated FAQ/use-case copy on the page.
    await expect(page.getByText(/Hay \d+ marcador\(es\) sin sustituir/)).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar PDF" }).click();
    const download = await downloadPromise;
    const bytes = fs.readFileSync((await download.path())!);
    const text = extractPdfDrawnText(bytes);
    expect(text).toContain("CandidataCartaPlaywright");
  });
});

test.describe("generador-carta-presentacion: all 5 required minimum modes genuinely differ", () => {
  test("each mode shows its own paragraph labels and produces a real, distinct PDF", async ({ page }) => {
    await page.goto("/herramientas/generador-carta-presentacion");
    await page.getByLabel("Tu nombre").fill("CandidataModosPlaywright");
    await page.getByLabel("Puesto solicitado").fill("Analista de Datos");

    const paragraphLabelSets = new Set<string>();
    const pdfSizes = new Set<number>();
    for (const modeLabel of COVER_LETTER_MODES) {
      await page.getByLabel("Modo").click();
      await page.getByRole("option", { name: modeLabel }).click();

      // The first paragraph textarea's own accessible label changes per mode (e.g. "Apertura" vs "Gancho inicial" vs "Quién soy") —
      // the id stays "cl-openingParagraph" across modes, only the visible label text (and hint) changes.
      const firstLabelText = await page.locator('label[for="cl-openingParagraph"]').textContent();
      paragraphLabelSets.add((firstLabelText ?? "").trim());

      const openingField = page.locator("#cl-openingParagraph");
      await openingField.fill(`Párrafo real para el modo ${modeLabel}.`);

      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "Descargar PDF" }).click();
      const download = await downloadPromise;
      const bytes = fs.readFileSync((await download.path())!);
      expect(bytes.subarray(0, 4).toString(), modeLabel).toBe("%PDF");
      const text = extractPdfDrawnText(bytes);
      expect(text, modeLabel).toContain("CandidataModosPlaywright");
      pdfSizes.add(bytes.length);
    }
    expect(paragraphLabelSets.size, "opening-paragraph labels should differ across modes").toBeGreaterThan(1);
    expect(pdfSizes.size).toBeGreaterThan(1);
  });
});

test.describe("generador-tarjetas-presentacion: reuses the QR core, real PDF and PNG", () => {
  test("creates a card with a QR code, downloads a real PDF and a real PNG", async ({ page }) => {
    await page.goto("/herramientas/generador-tarjetas-presentacion");
    await page.getByLabel("Nombre").fill("NombreTarjetaPlaywright");
    await page.getByLabel("Empresa").fill("EmpresaTarjetaPlaywright");
    await page.getByRole("checkbox", { name: "Incluir código QR" }).click();
    await page.getByLabel("Contenido del QR").fill("https://example.com");

    const pdfDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar tarjeta (PDF)" }).click();
    const pdfDownload = await pdfDownloadPromise;
    const pdfBytes = fs.readFileSync((await pdfDownload.path())!);
    expect(pdfBytes.subarray(0, 4).toString()).toBe("%PDF");
    const text = extractPdfDrawnText(pdfBytes);
    expect(text).toContain("NombreTarjetaPlaywright");

    const pngDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar PNG" }).click();
    const pngDownload = await pngDownloadPromise;
    const pngBytes = fs.readFileSync((await pngDownload.path())!);
    expect(pngBytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  });
});

const CARD_TEMPLATES = ["Minimalista", "Profesional", "Corporativa", "Creativa", "Vertical"];

test.describe("generador-tarjetas-presentacion: all 5 required minimum templates, JSON round trip", () => {
  test("each template downloads a real, distinct PDF and PNG", async ({ page }) => {
    await page.goto("/herramientas/generador-tarjetas-presentacion");
    await page.getByLabel("Nombre").fill("NombrePlantillasPlaywright");

    const pdfSizes = new Set<number>();
    for (const templateLabel of CARD_TEMPLATES) {
      await page.getByLabel("Plantilla").click();
      await page.getByRole("option", { name: templateLabel }).click();

      const pdfDownloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "Descargar tarjeta (PDF)" }).click();
      const pdfDownload = await pdfDownloadPromise;
      const pdfBytes = fs.readFileSync((await pdfDownload.path())!);
      expect(pdfBytes.subarray(0, 4).toString(), templateLabel).toBe("%PDF");
      expect(extractPdfDrawnText(pdfBytes), templateLabel).toContain("NombrePlantillasPlaywright");
      pdfSizes.add(pdfBytes.length);

      const pngDownloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "Descargar PNG" }).click();
      const pngDownload = await pngDownloadPromise;
      const pngBytes = fs.readFileSync((await pngDownload.path())!);
      expect(pngBytes.subarray(0, 8).toString("hex"), templateLabel).toBe("89504e470d0a1a0a");
    }
    expect(pdfSizes.size).toBeGreaterThan(1);

    const jsonDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar JSON" }).click();
    const jsonDownload = await jsonDownloadPromise;
    const jsonPath = await jsonDownload.path();
    expect(fs.readFileSync(jsonPath!, "utf8")).toContain("NombrePlantillasPlaywright");
  });
});

test.describe("generador-recibos: real total and change calculation", () => {
  test("computes a real total and change from entered line items", async ({ page }) => {
    await page.goto("/herramientas/generador-recibos");
    await page.getByLabel("Emitido por").fill("TiendaPlaywright");
    await page.getByPlaceholder("Concepto").fill("ProductoPlaywright");
    await page.getByPlaceholder("Cant.").fill("2");
    await page.getByPlaceholder("Precio").fill("5");
    await page.getByLabel("Importe recibido (opcional)").fill("20");
    // Real formatting is es-ES/EUR (comma decimal, € suffix) — "10,00 €", not "$10.00".
    await expect(page.getByText(/Total: 10,00\s?€/)).toBeVisible();
    await expect(page.getByText(/Cambio: 10,00\s?€/)).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar PDF" }).click();
    const download = await downloadPromise;
    const text = extractPdfDrawnText(fs.readFileSync((await download.path())!));
    expect(text).toContain("TiendaPlaywright");
    expect(text).toContain("no verifica una transacción real");
  });
});

test.describe("generador-ordenes-compra: real PDF and CSV export", () => {
  test("creates an order and downloads a real PDF and CSV of the lines", async ({ page }) => {
    await page.goto("/herramientas/generador-ordenes-compra");
    await page.getByPlaceholder("Nombre").first().fill("CompradorPlaywright");
    await page.getByPlaceholder("Nombre").nth(1).fill("ProveedorPlaywright");
    await page.getByPlaceholder("Descripción").fill("MaterialPlaywright");
    await page.getByPlaceholder("Cant.").fill("3");
    await page.getByPlaceholder("Precio").fill("10");

    const csvDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar CSV" }).click();
    const csvDownload = await csvDownloadPromise;
    const csv = fs.readFileSync((await csvDownload.path())!, "utf8");
    expect(csv).toContain("MaterialPlaywright");

    const pdfDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar PDF" }).click();
    const pdfDownload = await pdfDownloadPromise;
    const text = extractPdfDrawnText(fs.readFileSync((await pdfDownload.path())!));
    expect(text).toContain("CompradorPlaywright");
    expect(text).toContain("ProveedorPlaywright");
  });
});

test.describe("generador-notas-entrega: works without prices shown", () => {
  test("creates a delivery note with prices hidden by default and downloads a real PDF", async ({ page }) => {
    await page.goto("/herramientas/generador-notas-entrega");
    // exact:true — a substring match would also hit "Dirección del remitente"/"Dirección de entrega".
    await page.getByLabel("Remitente", { exact: true }).fill("RemitentePlaywright");
    await page.getByLabel("Destinatario", { exact: true }).fill("DestinatarioPlaywright");
    await expect(page.getByRole("checkbox", { name: "Mostrar precios" })).not.toBeChecked();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar PDF" }).click();
    const download = await downloadPromise;
    const text = extractPdfDrawnText(fs.readFileSync((await download.path())!));
    expect(text).toContain("RemitentePlaywright");
    expect(text).toContain("DestinatarioPlaywright");
    expect(text).toContain("no verifica una entrega real");
  });
});

test.describe("generador-calendarios-imprimibles: real leap-year February, PDF download", () => {
  test("generates February of a leap year and downloads a real PDF", async ({ page }) => {
    await page.goto("/herramientas/generador-calendarios-imprimibles");
    await page.getByLabel("Año").fill("2028");
    await page.getByLabel("Mes").fill("2");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar PDF" }).click();
    const download = await downloadPromise;
    const bytes = fs.readFileSync((await download.path())!);
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
    const text = extractPdfDrawnText(bytes);
    expect(text).toContain("febrero");
  });
});

test.describe("generador-calendarios-imprimibles: all 4 required minimum modes", () => {
  test("multi-month mode downloads a real multi-page PDF", async ({ page }) => {
    await page.goto("/herramientas/generador-calendarios-imprimibles");
    await page.getByLabel("Modo").click();
    await page.getByRole("option", { name: "Varios meses" }).click();
    await page.getByLabel("Cantidad de meses").fill("3");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar PDF" }).click();
    const download = await downloadPromise;
    const bytes = fs.readFileSync((await download.path())!);
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(3);
  });

  test("annual mode downloads a real 12-page PDF", async ({ page }) => {
    await page.goto("/herramientas/generador-calendarios-imprimibles");
    await page.getByLabel("Modo").click();
    await page.getByRole("option", { name: "Anual" }).click();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar PDF" }).click();
    const download = await downloadPromise;
    const bytes = fs.readFileSync((await download.path())!);
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(12);
  });

  test("school mode: manually-defined start/end dates, a period, and a break produce a real PDF (never a downloaded academic calendar)", async ({ page }) => {
    await page.goto("/herramientas/generador-calendarios-imprimibles");
    await page.getByLabel("Modo").click();
    await page.getByRole("option", { name: "Escolar personalizado" }).click();

    await page.getByLabel("Fecha inicial").fill("2026-09-01");
    await page.getByLabel("Fecha final").fill("2026-10-31");

    await page.getByRole("button", { name: "Añadir periodo" }).click();
    await page.getByPlaceholder("Nombre del periodo").fill("1er trimestre PW");

    await page.getByRole("button", { name: "Añadir descanso" }).click();
    await page.getByPlaceholder("Nombre del descanso").fill("Puente PW");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar PDF" }).click();
    const download = await downloadPromise;
    const bytes = fs.readFileSync((await download.path())!);
    const text = extractPdfDrawnText(bytes);
    expect(text).toContain("1er trimestre PW");
    expect(text).toContain("Puente PW");

    const jsonDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar JSON" }).click();
    const jsonDownload = await jsonDownloadPromise;
    expect(fs.readFileSync((await jsonDownload.path())!, "utf8")).toContain("1er trimestre PW");
  });
});

test.describe("generador-planificador-semanal-mensual: real weekly planner PDF", () => {
  test("creates a weekly planner and downloads a real PDF", async ({ page }) => {
    await page.goto("/herramientas/generador-planificador-semanal-mensual");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar PDF" }).click();
    const download = await downloadPromise;
    const bytes = fs.readFileSync((await download.path())!);
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
  });
});

test.describe("generador-planificador-semanal-mensual: all 5 required minimum modes, incl. block-schedule and goals", () => {
  test("monthly and daily modes each download a real PDF", async ({ page }) => {
    await page.goto("/herramientas/generador-planificador-semanal-mensual");
    for (const modeLabel of ["Mensual", "Diario"]) {
      await page.getByLabel("Modo").click();
      await page.getByRole("option", { name: modeLabel, exact: true }).click();
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "Descargar PDF" }).click();
      const download = await downloadPromise;
      expect(fs.readFileSync((await download.path())!).subarray(0, 4).toString(), modeLabel).toBe("%PDF");
    }
  });

  test("block-schedule mode: a real named time block downloads a real PDF containing its label and range", async ({ page }) => {
    await page.goto("/herramientas/generador-planificador-semanal-mensual");
    await page.getByLabel("Modo").click();
    await page.getByRole("option", { name: "Horario por bloques" }).click();
    await page.getByPlaceholder("Nombre del bloque").fill("EnfoqueProfundoPlaywright");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar PDF" }).click();
    const download = await downloadPromise;
    const text = extractPdfDrawnText(fs.readFileSync((await download.path())!));
    expect(text).toContain("EnfoqueProfundoPlaywright");
  });

  test("goals mode: a real objective with a step and manual progress downloads a real PDF", async ({ page }) => {
    await page.goto("/herramientas/generador-planificador-semanal-mensual");
    await page.getByLabel("Modo").click();
    await page.getByRole("option", { name: "Planificador de objetivos" }).click();
    await page.getByPlaceholder("Objetivo").fill("AprenderPlaywrightReal");
    await page.getByRole("button", { name: "Añadir paso" }).click();
    await page.getByPlaceholder("Paso").fill("PasoPlaywrightReal");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar PDF" }).click();
    const download = await downloadPromise;
    const text = extractPdfDrawnText(fs.readFileSync((await download.path())!));
    expect(text).toContain("AprenderPlaywrightReal");
    expect(text).toContain("PasoPlaywrightReal");

    const jsonDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar JSON" }).click();
    const jsonDownload = await jsonDownloadPromise;
    expect(fs.readFileSync((await jsonDownload.path())!, "utf8")).toContain("AprenderPlaywrightReal");
  });
});

test.describe("generador-listas-verificacion: create and mark items", () => {
  test("adds an item, marks it complete, and downloads a real PDF and a real TXT", async ({ page }) => {
    await page.goto("/herramientas/generador-listas-verificacion");
    await page.getByPlaceholder("Elemento").first().fill("ElementoChecklistPlaywright");
    await page.getByLabel("Marcar elemento").first().check();
    await expect(page.getByText("1 de 1 elementos completados")).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar PDF" }).click();
    const download = await downloadPromise;
    const text = extractPdfDrawnText(fs.readFileSync((await download.path())!));
    expect(text).toContain("ElementoChecklistPlaywright");

    const txtDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar TXT" }).click();
    const txtDownload = await txtDownloadPromise;
    const txtContent = fs.readFileSync((await txtDownload.path())!, "utf8");
    expect(txtContent).toContain("ElementoChecklistPlaywright");
  });
});

test.describe("generador-agendas-actas-reunion: agenda -> minutes conversion", () => {
  test("creates an agenda topic, converts it to minutes, and downloads real PDFs for both", async ({ page }) => {
    await page.goto("/herramientas/generador-agendas-actas-reunion");
    await page.getByLabel("Título", { exact: true }).fill("ReunionPlaywrightReal");
    await page.getByPlaceholder("Tema").fill("TemaPlaywrightReal");

    const agendaDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar agenda (PDF)" }).click();
    const agendaDownload = await agendaDownloadPromise;
    const agendaText = extractPdfDrawnText(fs.readFileSync((await agendaDownload.path())!));
    expect(agendaText).toContain("ReunionPlaywrightReal");
    expect(agendaText).toContain("TemaPlaywrightReal");

    const agendaTxtDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar TXT" }).click();
    const agendaTxtDownload = await agendaTxtDownloadPromise;
    expect(fs.readFileSync((await agendaTxtDownload.path())!, "utf8")).toContain("TemaPlaywrightReal");

    const agendaJsonDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar JSON" }).click();
    const agendaJsonDownload = await agendaJsonDownloadPromise;
    expect(fs.readFileSync((await agendaJsonDownload.path())!, "utf8")).toContain("ReunionPlaywrightReal");

    await page.getByRole("button", { name: "Convertir en plantilla de acta" }).click();
    // The switch to the minutes view is proven by these minutes-only fields becoming interactable.
    await page.getByPlaceholder("Acción").fill("AccionPlaywrightReal");
    await page.getByPlaceholder("Responsable").fill("ResponsablePlaywrightReal");

    const minutesDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar acta (PDF)" }).click();
    const minutesDownload = await minutesDownloadPromise;
    const minutesText = extractPdfDrawnText(fs.readFileSync((await minutesDownload.path())!));
    expect(minutesText).toContain("ReunionPlaywrightReal");
    expect(minutesText).toContain("AccionPlaywrightReal");

    const minutesTxtDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar TXT" }).click();
    const minutesTxtDownload = await minutesTxtDownloadPromise;
    expect(fs.readFileSync((await minutesTxtDownload.path())!, "utf8")).toContain("AccionPlaywrightReal");

    const minutesJsonDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar JSON" }).click();
    const minutesJsonDownload = await minutesJsonDownloadPromise;
    expect(fs.readFileSync((await minutesJsonDownload.path())!, "utf8")).toContain("ReunionPlaywrightReal");
  });
});

test.describe("generador-certificados-reconocimiento: never an official document", () => {
  test("creates a certificate and shows the not-official notice, downloads a real PDF", async ({ page }) => {
    await page.goto("/herramientas/generador-certificados-reconocimiento");
    await expect(page.getByText("Plantilla de reconocimiento no oficial creada con los datos introducidos por el usuario.")).toBeVisible();
    await page.getByLabel("Nombre de la persona").fill("PersonaCertificadoPlaywright");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar PDF" }).click();
    const download = await downloadPromise;
    const text = extractPdfDrawnText(fs.readFileSync((await download.path())!));
    expect(text).toContain("PersonaCertificadoPlaywright");
    expect(text).toContain("Plantilla de reconocimiento no oficial");
  });
});

const CERTIFICATE_TEMPLATES = ["Formal", "Moderna", "Escolar informal", "Voluntariado", "Agradecimiento", "Participación"];

test.describe("generador-certificados-reconocimiento: all 6 required minimum templates, always the not-official notice", () => {
  test("each of the 6 templates downloads a real, distinct PDF that still includes the not-official notice", async ({ page }) => {
    await page.goto("/herramientas/generador-certificados-reconocimiento");
    await page.getByLabel("Nombre de la persona").fill("PersonaPlantillasPlaywright");

    const pdfSizes = new Set<number>();
    for (const templateLabel of CERTIFICATE_TEMPLATES) {
      await page.getByLabel("Plantilla").click();
      await page.getByRole("option", { name: templateLabel, exact: true }).click();
      await expect(page.getByText("Plantilla de reconocimiento no oficial creada con los datos introducidos por el usuario.")).toBeVisible();

      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "Descargar PDF" }).click();
      const download = await downloadPromise;
      const bytes = fs.readFileSync((await download.path())!);
      const text = extractPdfDrawnText(bytes);
      expect(text, templateLabel).toContain("PersonaPlantillasPlaywright");
      expect(text, templateLabel).toContain("Plantilla de reconocimiento no oficial");
      pdfSizes.add(bytes.length);
    }
    expect(pdfSizes.size).toBeGreaterThan(1);
  });
});

test.describe("generador-etiquetas-pegatinas: CSV import, real barcode-embedded PDF", () => {
  test("imports a CSV of labels, maps columns, and downloads a real sheet PDF", async ({ page }) => {
    await page.goto("/herramientas/generador-etiquetas-pegatinas");
    const csvContent = "Nombre,Precio\nManzanas Playwright,1.50\nPeras Playwright,2.00";
    await page.setInputFiles('input[type="file"][accept=".csv,text/csv"]', { name: "etiquetas.csv", mimeType: "text/csv", buffer: Buffer.from(csvContent) });
    await expect(page.getByText(/2 filas/)).toBeVisible();
    await page.getByRole("button", { name: /Generar etiquetas desde CSV/ }).click();
    await expect(page.getByText("Etiquetas (2)")).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar hoja (PDF)" }).click();
    const download = await downloadPromise;
    const bytes = fs.readFileSync((await download.path())!);
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
    const text = extractPdfDrawnText(bytes);
    expect(text).toContain("Manzanas Playwright");
    expect(text).toContain("Peras Playwright");

    const zipDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar ZIP (todas, PNG+SVG)" }).click();
    const zipDownload = await zipDownloadPromise;
    const zipBytes = fs.readFileSync((await zipDownload.path())!);
    // Real local-file-header ZIP signature ("PK\x03\x04") — proves a genuine archive, not an empty stub.
    expect(zipBytes.subarray(0, 4).toString("hex")).toBe("504b0304");

    const jsonDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar plantilla (JSON)" }).click();
    const jsonDownload = await jsonDownloadPromise;
    expect(fs.readFileSync((await jsonDownload.path())!, "utf8")).toContain("Manzanas Playwright");
  });
});

test.describe("privacy: no Fase 47 tool ever sends its input data to the server", () => {
  test("the resume builder never issues a network request containing the entered name", async ({ page }) => {
    const requests = trackRequests(page);
    await page.goto("/herramientas/crear-curriculum-cv");
    await page.getByLabel("Nombre completo").fill("NombrePrivacidadUnico999");
    await page.waitForTimeout(300);
    const leaked = requests.filter((r) => r.url().includes("NombrePrivacidadUnico999") || (r.postData() ?? "").includes("NombrePrivacidadUnico999"));
    expect(leaked).toEqual([]);
    const external = requests.filter((r) => !r.url().startsWith(new URL(page.url()).origin) && !r.url().startsWith("data:") && !r.url().startsWith("blob:"));
    expect(external.map((r) => r.url())).toEqual([]);
  });
});
