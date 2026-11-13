import { describe, it, expect } from "vitest";
import { hexToHsl, getPalette, formatPrice, defaultPalette } from "./palette";

describe("hexToHsl", () => {
  it("convierte colores conocidos", () => {
    expect(hexToHsl("#000000")).toBe("0 0% 0%");
    expect(hexToHsl("#FFFFFF")).toBe("0 0% 100%");
    expect(hexToHsl("#FF0000")).toBe("0 100% 50%");
    expect(hexToHsl("#00FF00")).toBe("120 100% 50%");
    expect(hexToHsl("#0000FF")).toBe("240 100% 50%");
  });

  it("acepta formato corto #RGB", () => {
    expect(hexToHsl("#F00")).toBe("0 100% 50%");
  });

  it("acepta minúsculas y espacios alrededor", () => {
    expect(hexToHsl("  #ff0000  ")).toBe("0 100% 50%");
  });

  it("convierte el primario esmeralda de la tienda", () => {
    // #10B981 → hsl(160, 84%, 39%) aprox.
    expect(hexToHsl("#10B981")).toBe("160 84% 39%");
  });

  it("rechaza hex inválidos", () => {
    expect(hexToHsl("rojo")).toBeNull();
    expect(hexToHsl("#GG0000")).toBeNull();
    expect(hexToHsl("#12345")).toBeNull();
    expect(hexToHsl("")).toBeNull();
  });
});

describe("getPalette", () => {
  it("sin config devuelve la paleta base", () => {
    expect(getPalette()).toEqual(defaultPalette);
    expect(getPalette({})).toEqual(defaultPalette);
  });

  it("aplica overrides válidos de store_config", () => {
    const p = getPalette({ themePrimary: "#FF0000", themeBackground: "#111111" });
    expect(p.primary).toBe("#FF0000");
    expect(p.background).toBe("#111111");
    expect(p.surface).toBe(defaultPalette.surface); // intacto
  });

  it("ignora overrides inválidos y usa el valor por defecto", () => {
    const p = getPalette({ themePrimary: "rojo", themeText: "#XYZ" });
    expect(p.primary).toBe(defaultPalette.primary);
    expect(p.text).toBe(defaultPalette.text);
  });
});

describe("formatPrice", () => {
  it("formatea como pesos colombianos", () => {
    expect(formatPrice(650000)).toContain("650.000");
  });

  it("con valor inválido muestra 0", () => {
    expect(formatPrice(undefined)).toContain("0");
    expect(formatPrice("abc")).toContain("0");
  });
});
