import { describe, it, expect } from "vitest";
import { waDigits, waLink } from "./whatsapp";

describe("waDigits", () => {
  it("antepone 57 a un celular nacional de 10 dígitos", () => {
    expect(waDigits("3125866072")).toBe("573125866072");
  });

  it("no duplica el 57 si ya viene en internacional", () => {
    expect(waDigits("573125866072")).toBe("573125866072");
  });

  it("limpia +, espacios, guiones y paréntesis", () => {
    expect(waDigits("+57 312 586 6072")).toBe("573125866072");
    expect(waDigits("+57 (312) 586-6072")).toBe("573125866072");
  });

  it("no toca números con formato distinto (no inventa país)", () => {
    expect(waDigits("+1 (555) 123-4567")).toBe("15551234567");
  });

  it("devuelve cadena vacía para entradas vacías o no-string", () => {
    expect(waDigits("")).toBe("");
    expect(waDigits(undefined as unknown as string)).toBe("");
  });
});

describe("waLink", () => {
  it("genera la URL completa con mensaje", () => {
    expect(waLink("3125866072", "Hola")).toBe(
      `https://wa.me/573125866072?text=${encodeURIComponent("Hola")}`
    );
  });

  it("sin mensaje devuelve la URL limpia", () => {
    expect(waLink("3125866072")).toBe("https://wa.me/573125866072");
  });

  it("devuelve undefined si el número es muy corto", () => {
    expect(waLink("12345")).toBeUndefined();
    expect(waLink("")).toBeUndefined();
  });
});
