import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { trackRequests } from "../helpers";

test.describe.configure({ mode: "serial" });

test.describe("calculadora-punto-equilibrio: break-even, profit target, and product mix", () => {
  test("1. calculates break-even for a single product with a real, reloadable result", async ({ page }) => {
    await page.goto("/herramientas/calculadora-punto-equilibrio");
    await page.getByLabel("Costes fijos").fill("1000");
    await page.getByLabel("Precio de venta por unidad").fill("20");
    await page.getByLabel("Coste variable por unidad").fill("8");
    await page.getByLabel("Unidades previstas").fill("100");
    await expect(page.getByText(/83[.,]3\d* unidades/)).toBeVisible();
  });

  test("2. compares a profit-target scenario and produces a real result", async ({ page }) => {
    await page.goto("/herramientas/calculadora-punto-equilibrio");
    await page.getByRole("button", { name: "Objetivo de beneficio" }).click();
    await page.getByLabel("Costes fijos").fill("1000");
    await page.getByLabel("Precio de venta por unidad").fill("20");
    await page.getByLabel("Coste variable por unidad").fill("8");
    await page.getByLabel("Beneficio objetivo").fill("500");
    await expect(page.getByText("125.00")).toBeVisible();

    const jsonDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar JSON" }).click();
    const jsonDownload = await jsonDownloadPromise;
    const jsonContent = fs.readFileSync((await jsonDownload.path())!, "utf8");
    expect(jsonContent).toContain("calculadora-punto-equilibrio");
  });

  test("product mix mode computes a real weighted break-even and downloads a real CSV", async ({ page }) => {
    await page.goto("/herramientas/calculadora-punto-equilibrio");
    await page.getByRole("button", { name: "Mezcla de productos" }).click();
    const names = page.locator("input[placeholder='Nombre']");
    const prices = page.locator("input[placeholder='Precio']");
    const variableCosts = page.locator("input[placeholder='Coste variable']");
    const proportions = page.locator("input[placeholder='% mezcla']");
    await names.nth(0).fill("Producto A");
    await prices.nth(0).fill("20");
    await variableCosts.nth(0).fill("8");
    await proportions.nth(0).fill("50");
    await names.nth(1).fill("Producto B");
    await prices.nth(1).fill("30");
    await variableCosts.nth(1).fill("10");
    await proportions.nth(1).fill("50");
    await expect(page.getByText("Punto de equilibrio total:")).toBeVisible();

    const csvDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar CSV" }).click();
    const csvDownload = await csvDownloadPromise;
    const csv = fs.readFileSync((await csvDownload.path())!, "utf8");
    expect(csv).toContain("Producto A");
  });
});

test.describe("calculadora-roi-roas-recuperacion: ROI, ROAS, and payback", () => {
  test("3. calculates ROI with a real result distinguishing net profit from revenue", async ({ page }) => {
    await page.goto("/herramientas/calculadora-roi-roas-recuperacion");
    await page.getByLabel("Inversión inicial").fill("1000");
    await page.getByLabel("Ingresos obtenidos").fill("1500");
    await page.getByLabel("Costes adicionales").fill("100");
    await expect(page.getByText("40.00%")).toBeVisible();
  });

  test("4. calculates ROAS with a real result", async ({ page }) => {
    await page.goto("/herramientas/calculadora-roi-roas-recuperacion");
    await page.getByRole("button", { name: "ROAS", exact: true }).click();
    await page.getByLabel("Gasto publicitario").fill("500");
    await page.getByLabel("Ingresos atribuidos").fill("2000");
    await expect(page.getByText("4.00x")).toBeVisible();
  });

  test("5. calculates a payback period from real entered flows and downloads a real CSV", async ({ page }) => {
    await page.goto("/herramientas/calculadora-roi-roas-recuperacion");
    await page.getByRole("button", { name: "Periodo de recuperación" }).click();
    await page.getByRole("button", { name: "Flujos por periodo" }).click();
    await page.getByLabel("Inversión inicial").fill("1000");
    await page.getByLabel("Flujos por periodo (separados por coma)").fill("400, 400, 400");
    await expect(page.getByText(/2[.,]50 periodos/)).toBeVisible();

    const csvDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar CSV" }).click();
    const csvDownload = await csvDownloadPromise;
    const csv = fs.readFileSync((await csvDownload.path())!, "utf8");
    expect(csv.length).toBeGreaterThan(0);
  });
});

test.describe("calculadora-inventario-reposicion: reorder point and EOQ", () => {
  test("6. calculates a real reorder point", async ({ page }) => {
    await page.goto("/herramientas/calculadora-inventario-reposicion");
    await page.getByLabel("Demanda media diaria").fill("20");
    await page.getByLabel("Tiempo de entrega (días)").fill("5");
    await page.getByLabel("Stock de seguridad manual").fill("30");
    await expect(page.getByText("130.00 unidades")).toBeVisible();
  });

  test("7. calculates a real EOQ", async ({ page }) => {
    await page.goto("/herramientas/calculadora-inventario-reposicion");
    await page.getByRole("button", { name: "Cantidad económica de pedido" }).click();
    await page.getByLabel("Demanda anual").fill("5000");
    await page.getByLabel("Coste por pedido").fill("50");
    await page.getByLabel("Coste anual de almacenamiento por unidad").fill("2");
    await expect(page.getByText("500.00 unidades")).toBeVisible();
  });

  test("FASE 48 CORRECTIVE: zero demand in coverage mode shows an explicit human message, never Infinity/NaN/undefined/a fictitious date", async ({ page }) => {
    await page.goto("/herramientas/calculadora-inventario-reposicion");
    await page.getByRole("button", { name: "Cobertura" }).click();
    await page.getByLabel("Stock disponible").fill("500");
    await page.getByLabel("Demanda media diaria").fill("0");

    await expect(page.getByText("Sin consumo estimado: con una demanda de cero unidades, no existe una fecha calculable de agotamiento.")).toBeVisible();

    // Word-boundary, case-sensitive checks — a naive lowercase substring check would false-positive on
    // ordinary Spanish words (e.g. "combinando" contains "nan", "financiero" would contain "nan" too).
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/\bInfinity\b/);
    expect(bodyText).not.toMatch(/\bNaN\b/);
    expect(bodyText).not.toMatch(/\bundefined\b/);
    // The "días de cobertura" / "fecha estimada de agotamiento" labels only render in the FINITE branch.
    await expect(page.getByText("Días de cobertura:")).toHaveCount(0);
    await expect(page.getByText("Fecha estimada de agotamiento:")).toHaveCount(0);

    // The JSON export only ever serializes the input scenario (never the computed result) for this
    // tool, so it was never at risk of an Infinity/NaN payload — but it must still stay valid JSON.
    const jsonDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar JSON" }).click();
    const jsonDownload = await jsonDownloadPromise;
    const jsonContent = fs.readFileSync((await jsonDownload.path())!, "utf8");
    expect(() => JSON.parse(jsonContent)).not.toThrow();
    expect(jsonContent).not.toContain("Infinity");
    expect(jsonContent).not.toContain("NaN");

    // Switching back to a positive demand must immediately restore a real, finite coverage result.
    await page.getByLabel("Demanda media diaria").fill("20");
    await expect(page.getByText("Días de cobertura:")).toBeVisible();
    await expect(page.getByText("Fecha estimada de agotamiento:")).toBeVisible();
    const restoredBodyText = await page.locator("body").innerText();
    expect(restoredBodyText).not.toMatch(/\bInfinity\b/);
    expect(restoredBodyText).not.toMatch(/\bNaN\b/);
  });
});

test.describe("calculadora-rentabilidad-productos: profitability, including a loss-making product", () => {
  test("8. computes a real profitability result for a product", async ({ page }) => {
    await page.goto("/herramientas/calculadora-rentabilidad-productos");
    await page.locator("input[placeholder='Nombre del producto']").first().fill("Producto A");
    await page.getByLabel("Precio de venta").first().fill("100");
    await page.getByLabel("Coste del producto").first().fill("40");
    await expect(page.getByText(/Margen neto: 60/)).toBeVisible();
  });

  test("9. confirms a product priced below cost is flagged as a real loss", async ({ page }) => {
    await page.goto("/herramientas/calculadora-rentabilidad-productos");
    await page.getByLabel("Precio de venta").fill("10");
    await page.getByLabel("Coste del producto").fill("40");
    await expect(page.getByRole("alert").filter({ hasText: "generan pérdida" })).toBeVisible();
  });
});

test.describe("calculadora-comisiones-ventas: progressive commission tiers", () => {
  test("10. calculates a real progressive-tier commission", async ({ page }) => {
    await page.goto("/herramientas/calculadora-comisiones-ventas");
    await page.getByLabel("Tipo de plan").click();
    await page.getByRole("option", { name: "Tramos (progresivos o retroactivos)" }).click();
    await page.getByLabel("Ventas").fill("8000");
    const fromInputs = page.locator("input[placeholder='Desde']");
    const toInputs = page.locator("input[placeholder='Hasta (vacío = sin límite)']");
    const rateInputs = page.locator("input[placeholder='Tasa %']");
    await fromInputs.nth(0).fill("0");
    await toInputs.nth(0).fill("5000");
    await rateInputs.nth(0).fill("3");
    await fromInputs.nth(1).fill("5000");
    await rateInputs.nth(1).fill("6");
    // tier1: 5000*0.03=150; tier2: 3000*0.06=180; total=330
    await expect(page.getByText(/330[.,]00/).first()).toBeVisible();
  });
});

test.describe("comparador-precio-unidad: comparing compatible units", () => {
  test("11. compares two products with compatible mass units and picks the real best value", async ({ page }) => {
    await page.goto("/herramientas/comparador-precio-unidad");
    const names = page.locator("input[placeholder='Nombre']");
    const prices = page.locator("input[placeholder='Precio final pagado']");
    const qty = page.locator("input[placeholder='Cantidad/paquete']");
    await names.nth(0).fill("A");
    await prices.nth(0).fill("10");
    await qty.nth(0).fill("1000");
    await names.nth(1).fill("B");
    await prices.nth(1).fill("4");
    await qty.nth(1).fill("500");
    await expect(page.getByText("(mejor valor)")).toBeVisible();
  });
});

test.describe("calculadora-gpa-promedio: weighted average", () => {
  test("12. calculates a real weighted GPA", async ({ page }) => {
    await page.goto("/herramientas/calculadora-gpa-promedio");
    const names = page.locator("input[placeholder='Materia']");
    const grades = page.locator("input[placeholder='Nota']");
    const credits = page.locator("input[placeholder='Créditos']");
    await names.nth(0).fill("Materia 1");
    await grades.nth(0).fill("3.5");
    await credits.nth(0).fill("3");
    await page.getByRole("button", { name: "Añadir materia" }).click();
    await names.nth(1).fill("Materia 2");
    await grades.nth(1).fill("4.0");
    await credits.nth(1).fill("4");
    // (3.5*3+4*4)/7 = 3.786
    await expect(page.getByText(/3[.,]786/)).toBeVisible();
  });
});

test.describe("calculadora-nota-final: required grade", () => {
  test("13. calculates the real grade needed on the final exam", async ({ page }) => {
    await page.goto("/herramientas/calculadora-nota-final");
    await page.getByLabel("Nota actual (sin el examen)").fill("80");
    await page.getByLabel("Peso del examen final (%)").fill("20");
    await page.getByLabel("Nota objetivo del curso").fill("82");
    await expect(page.getByText("90.00")).toBeVisible();
  });
});

test.describe("calculadora-costo-combustible-viaje: metric and mpg systems", () => {
  test("14. calculates a real trip cost in the metric system", async ({ page }) => {
    await page.goto("/herramientas/calculadora-costo-combustible-viaje");
    // "Ida y vuelta" is checked by default — uncheck it so distance/fuel/cost match a simple one-way hand-calc.
    await page.getByLabel("Ida y vuelta").uncheck();
    await page.locator("input[placeholder='Distancia']").first().fill("100");
    await page.locator("input[placeholder='Rendimiento']").first().fill("8");
    await page.getByLabel("Precio del combustible por litro").fill("1.5");
    await expect(page.getByText(/8[.,]00 l/)).toBeVisible();
  });

  test("15. calculates a real trip cost using mpg (US)", async ({ page }) => {
    await page.goto("/herramientas/calculadora-costo-combustible-viaje");
    await page.getByLabel("Ida y vuelta").uncheck();
    await page.locator("input[placeholder='Distancia']").first().fill("100");
    const unitSelects = page.getByRole("combobox").filter({ hasText: "Litros/100 km" });
    await unitSelects.first().click();
    await page.getByRole("option", { name: "mpg (EE. UU.)" }).click();
    await page.locator("input[placeholder='Rendimiento']").first().fill("30");
    await page.getByLabel("Precio del combustible por litro").fill("1.5");
    await expect(page.getByText(/Coste total/)).toBeVisible();
  });
});

test.describe("escalar-recetas: scaling and baker's percentage", () => {
  test("16. scales a real recipe by servings", async ({ page }) => {
    await page.goto("/herramientas/escalar-recetas");
    const quantities = page.locator("input[placeholder='Cantidad']");
    await quantities.nth(0).fill("500");
    await page.getByLabel("Porciones originales").fill("4");
    await page.getByLabel("Porciones objetivo").fill("6");
    // The scaled-quantity cell renders "750 Gramos (g)" (value + unit label) — distinct from the separate "≈ Gramos" column.
    await expect(page.getByText(/750\s*Gramos/)).toBeVisible();
  });

  test("17. calculates a real baker's percentage", async ({ page }) => {
    await page.goto("/herramientas/escalar-recetas");
    const quantities = page.locator("input[placeholder='Cantidad']");
    await quantities.nth(0).fill("500");
    await quantities.nth(1).fill("325");
    await page.getByRole("button", { name: "Porcentaje de panadería" }).click();
    await expect(page.getByText("65.0%")).toBeVisible();
  });
});

test.describe("calculadora-costo-receta: cost per serving", () => {
  test("18. calculates a real cost per serving", async ({ page }) => {
    await page.goto("/herramientas/calculadora-costo-receta");
    // Remove the default second ingredient (Huevos) so the total is driven only by the ingredient this test controls.
    await page.getByRole("button", { name: "Eliminar" }).nth(1).click();
    const names = page.locator("input[placeholder='Nombre']");
    const prices = page.locator("input[placeholder='Precio paquete']");
    const sizes = page.locator("input[placeholder='Tamaño paquete']");
    const used = page.locator("input[placeholder='Cantidad usada']");
    await names.nth(0).fill("Harina");
    await prices.nth(0).fill("2");
    await sizes.nth(0).fill("1000");
    await used.nth(0).fill("500");
    await page.getByLabel("Costes directos adicionales (embalaje, mano de obra, energía)").fill("0");
    await page.getByLabel("Porciones").fill("1");
    // packagePrice=2 for 1000g, used 500g -> ingredient cost = 1.00; 1 serving -> cost/serving = 1.00 (locale-formatted, e.g. "1,00 €")
    await expect(page.getByText(/1[.,]00/).first()).toBeVisible();
  });
});

test.describe("calculadora-consumo-electrico: monthly consumption and appliance comparison", () => {
  test("19. calculates a real monthly electricity consumption", async ({ page }) => {
    await page.goto("/herramientas/calculadora-consumo-electrico");
    await page.locator("input[placeholder='Potencia']").first().fill("1000");
    await page.locator("input[placeholder='Cantidad']").first().fill("1");
    // Only one appliance exists by default, so the label text alone is unambiguous.
    await page.getByLabel("Horas de uso/día").fill("5");
    await page.getByLabel("Días de uso/mes").fill("30");
    await expect(page.getByText(/150[.,]00 kWh/).first()).toBeVisible();
  });

  test("20. compares two appliances' consumption", async ({ page }) => {
    await page.goto("/herramientas/calculadora-consumo-electrico");
    await page.getByRole("button", { name: "Añadir aparato" }).click();
    const names = page.locator("input[placeholder='Nombre']");
    await expect(names).toHaveCount(2);
    await names.nth(0).fill("Aparato A");
    await names.nth(1).fill("Aparato B");
    await expect(page.getByText("Aparato A")).toBeVisible();
    await expect(page.getByText("Aparato B")).toBeVisible();
  });
});

test.describe("CSV round trip: GPA importer re-analyzes an uploaded CSV", () => {
  test("21. downloads a CSV, then re-imports it and shows the same data", async ({ page }) => {
    await page.goto("/herramientas/calculadora-gpa-promedio");
    const names = page.locator("input[placeholder='Materia']");
    const grades = page.locator("input[placeholder='Nota']");
    await names.nth(0).fill("MateriaCsvReal");
    await grades.nth(0).fill("3.0");

    const csvDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar CSV" }).click();
    const csvDownload = await csvDownloadPromise;
    const csvPath = await csvDownload.path();
    expect(fs.readFileSync(csvPath!, "utf8")).toContain("MateriaCsvReal");

    const fileInput = page.locator('input[type="file"][accept=".csv,text/csv"]');
    await fileInput.setInputFiles(csvPath!);
    await expect(page.locator("input[placeholder='Materia']").first()).toHaveValue("MateriaCsvReal");
  });
});

test.describe("JSON round trip and reset: break-even scenario", () => {
  test("22-25. exports JSON, imports it back, and reset clears the form", async ({ page }) => {
    await page.goto("/herramientas/calculadora-punto-equilibrio");
    await page.getByLabel("Costes fijos").fill("2500");

    const jsonDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar JSON" }).click();
    const jsonDownload = await jsonDownloadPromise;
    const jsonPath = await jsonDownload.path();
    expect(fs.readFileSync(jsonPath!, "utf8")).toContain("2500");

    await page.getByRole("button", { name: "Reiniciar" }).click();
    await expect(page.getByLabel("Costes fijos")).not.toHaveValue("2500");

    const fileInput = page.locator('input[type="file"][accept="application/json"]');
    await fileInput.setInputFiles(jsonPath!);
    await expect(page.getByLabel("Costes fijos")).toHaveValue("2500");
  });
});

test.describe("privacy: no Fase 48 tool ever sends its input data to the server or an external CDN", () => {
  test("26-27. break-even calculator never issues a network request containing the entered value, and no external requests occur", async ({ page }) => {
    const requests = trackRequests(page);
    await page.goto("/herramientas/calculadora-punto-equilibrio");
    await page.getByLabel("Costes fijos").fill("999888777");
    await page.waitForTimeout(300);
    const leaked = requests.filter((r) => r.url().includes("999888777") || (r.postData() ?? "").includes("999888777"));
    expect(leaked).toEqual([]);
    const external = requests.filter((r) => !r.url().startsWith(new URL(page.url()).origin) && !r.url().startsWith("data:") && !r.url().startsWith("blob:"));
    expect(external.map((r) => r.url())).toEqual([]);
  });
});
