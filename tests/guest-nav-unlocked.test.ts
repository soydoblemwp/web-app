import { describe, expect, it } from "vitest";
import { guestNavGroups } from "@/lib/navigation";

describe("guest navigation: free modules are never locked", () => {
  it('has exactly three groups: "Herramientas gratuitas", "Organización local", "Cuenta e integraciones"', () => {
    expect(guestNavGroups.map((g) => g.label)).toEqual([
      "Herramientas gratuitas",
      "Organización local",
      "Cuenta e integraciones",
    ]);
  });

  it("every item in Herramientas gratuitas and Organización local has a real href and is not restricted", () => {
    const [tools, local] = guestNavGroups;
    for (const item of [...tools.items, ...local.items]) {
      expect(item.restricted).not.toBe(true);
      expect(item.href).toBeTruthy();
    }
  });

  it("Organización local includes every module the product requires to work without an account", () => {
    const labels = guestNavGroups[1].items.map((i) => i.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        "Proyectos",
        "Historial",
        "Biblioteca",
        "Campañas",
        "Calendario",
        "Automatizaciones",
        "Monitoreo",
        "Configuración de marca",
        "Exportar o eliminar datos",
      ])
    );
  });

  it("only Cuenta e integraciones may require an account, and every item there is restricted with no href", () => {
    const restrictedGroup = guestNavGroups[2];
    for (const item of restrictedGroup.items) {
      expect(item.restricted).toBe(true);
      expect(item.href).toBeUndefined();
    }
  });
});
