import { describe, expect, it } from "vitest";
import { analyzePost } from "@/lib/content/post-analyzer";

describe("analyzePost", () => {
  it("scores an empty post as zero", () => {
    const result = analyzePost({ text: "", platform: "INSTAGRAM" });
    expect(result.score).toBe(0);
    expect(result.checks[0].status).toBe("fail");
  });

  it("passes the CTA check when a known CTA phrase is present", () => {
    const result = analyzePost({
      text: "Descubre nuestra nueva colección. Comenta tu color favorito y guarda este post para más tarde. #moda #estilo",
      platform: "INSTAGRAM",
    });
    expect(result.checks.find((c) => c.id === "cta")?.status).toBe("pass");
  });

  it("warns when there is no CTA and no hashtags", () => {
    const result = analyzePost({
      text: "Hoy ha sido un día normal en la oficina, nada especial que contar realmente por aquí.",
      platform: "X",
    });
    expect(result.checks.find((c) => c.id === "cta")?.status).toBe("warning");
    expect(result.checks.find((c) => c.id === "hashtags")?.status).toBe("warning");
  });

  it("never produces a negative score or a score above 100", () => {
    const result = analyzePost({ text: "a".repeat(2000), platform: "UNKNOWN_PLATFORM" });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
