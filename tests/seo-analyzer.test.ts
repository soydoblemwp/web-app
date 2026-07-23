import { describe, expect, it } from "vitest";
import { analyzeSeo } from "@/lib/seo/analyzer";

describe("analyzeSeo", () => {
  it("scores a well-optimized page highly", () => {
    const body = [
      "# Guía completa de marketing de contenidos",
      "",
      "El marketing de contenidos ayuda a las marcas a conectar con su audiencia. ".repeat(3),
      "",
      "## Por qué importa el marketing de contenidos",
      "Una estrategia de marketing de contenidos bien definida genera confianza. ".repeat(3),
      "",
      "## Cómo empezar con marketing de contenidos",
      "Empieza por conocer a tu audiencia y sus necesidades reales antes de escribir. ".repeat(3),
    ].join("\n");

    const result = analyzeSeo({
      title: "Guía de marketing de contenidos para pequeñas marcas",
      metaDescription:
        "Aprende a diseñar una estrategia de marketing de contenidos eficaz para tu marca, paso a paso y sin jerga innecesaria hoy.",
      targetKeyword: "marketing de contenidos",
      contentText: body,
    });

    expect(result.score).toBeGreaterThan(70);
    expect(result.checks.find((c) => c.id === "h1")?.status).toBe("pass");
    expect(result.checks.find((c) => c.id === "title-keyword")?.status).toBe("pass");
  });

  it("flags a missing title and empty content as failing", () => {
    const result = analyzeSeo({
      title: "",
      metaDescription: "",
      targetKeyword: "algo",
      contentText: "Texto muy corto.",
    });

    expect(result.score).toBeLessThan(50);
    expect(result.checks.find((c) => c.id === "title-length")?.status).toBe("fail");
    expect(result.checks.find((c) => c.id === "meta-length")?.status).toBe("fail");
  });

  it("flags keyword stuffing as a warning, not a pass", () => {
    const keyword = "zapatos baratos";
    const body = `${keyword} `.repeat(40) + "y nada más que texto de relleno para acompañar.";

    const result = analyzeSeo({
      title: "Los mejores zapatos baratos del mercado",
      metaDescription: "Encuentra zapatos baratos de calidad con envío rápido y garantía extendida incluida hoy.",
      targetKeyword: keyword,
      contentText: body,
    });

    const densityCheck = result.checks.find((c) => c.id === "density");
    expect(densityCheck?.status).toBe("warning");
  });

  it("never produces a negative score or a score above 100", () => {
    const result = analyzeSeo({
      title: "x".repeat(200),
      metaDescription: "",
      targetKeyword: "",
      contentText: "",
    });

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
