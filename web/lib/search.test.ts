import { describe, it, expect } from "vitest";
import { normalizeSearch, tokenize, matchesProduct } from "./search";

describe("normalizeSearch", () => {
  it("quita tildes y pasa a minúsculas", () => {
    expect(normalizeSearch("Tecnología")).toBe("tecnologia");
    expect(normalizeSearch("Camión Ñandú")).toBe("camion nandu");
  });

  it("colapsa espacios múltiples y recorta", () => {
    expect(normalizeSearch("  fundas   para   celular  ")).toBe("fundas para celular");
  });

  it("devuelve cadena vacía para valores no-string", () => {
    expect(normalizeSearch(undefined)).toBe("");
    expect(normalizeSearch(null)).toBe("");
    expect(normalizeSearch(123)).toBe("");
    expect(normalizeSearch({})).toBe("");
  });

  it("deja intactos dígitos y guiones", () => {
    expect(normalizeSearch("A5511-9-10")).toBe("a5511-9-10");
  });
});

describe("tokenize", () => {
  it("divide por espacios y descarta vacíos", () => {
    expect(tokenize("funda  celular")).toEqual(["funda", "celular"]);
    expect(tokenize("   ")).toEqual([]);
    expect(tokenize("")).toEqual([]);
  });

  it("normaliza antes de dividir", () => {
    expect(tokenize("Funda  Celular")).toEqual(["funda", "celular"]);
  });
});

describe("matchesProduct", () => {
  const product = {
    name: "Funda Silicona iPhone 13",
    sku: "FUN-IP13",
    brand: "Celtoons",
    description: "Funda de silicona suave",
    tags: ["funda", "iphone"],
    catalogIds: ["tecnologiaymas"],
  };

  it("encuentra por una palabra del nombre", () => {
    expect(matchesProduct(product, "silicona")).toBe(true);
  });

  it("encuentra sin importar tildes ni mayúsculas", () => {
    expect(matchesProduct(product, "SILICONA")).toBe(true);
    expect(matchesProduct({ ...product, name: "Camión" }, "camion")).toBe(true);
  });

  it("exige TODAS las palabras del query", () => {
    expect(matchesProduct(product, "funda iphone")).toBe(true);
    expect(matchesProduct(product, "funda samsung")).toBe(false);
  });

  it("busca también por SKU, marca, tags y catálogo", () => {
    expect(matchesProduct(product, "fun-ip13")).toBe(true);
    expect(matchesProduct(product, "celtoons")).toBe(true);
    expect(matchesProduct(product, "iphone")).toBe(true);
    expect(matchesProduct(product, "tecnologiaymas")).toBe(true);
  });

  it("query vacío coincide con todo", () => {
    expect(matchesProduct(product, "")).toBe(true);
    expect(matchesProduct(product, "   ")).toBe(true);
  });

  it("tags como string suelto también funciona", () => {
    expect(matchesProduct({ ...product, tags: "viral" }, "viral")).toBe(true);
  });

  it("campos ausentes no rompen la búsqueda", () => {
    expect(matchesProduct({}, "funda")).toBe(false);
    expect(matchesProduct({}, "")).toBe(true);
  });
});
