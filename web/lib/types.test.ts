import { describe, it, expect } from "vitest";
import {
  sortProducts,
  productStock,
  productAvailable,
  productVisible,
  effectivePrice,
  statusLabel,
  variantLabel,
  type Product,
} from "./types";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    sku: "SKU-1",
    name: "Producto",
    price: 10000,
    stock: 5,
    isAvailable: true,
    images: [],
    catalogIds: ["tecnologiaymas"],
    ...overrides,
  };
}

describe("productStock", () => {
  it("usa el stock del producto si no hay variantes", () => {
    expect(productStock(makeProduct({ stock: 7 }))).toBe(7);
  });

  it("suma el stock de las variantes cuando existen", () => {
    const p = makeProduct({
      stock: 999, // debe ignorarse
      variants: [
        { id: "negro-m", stock: 2 },
        { id: "negro-l", stock: 3 },
      ],
    });
    expect(productStock(p)).toBe(5);
  });

  it("trata stocks inválidos de variante como 0", () => {
    const p = makeProduct({
      variants: [
        { id: "a", stock: Number.NaN },
        { id: "b", stock: 4 },
      ],
    });
    expect(productStock(p)).toBe(4);
  });

  it("con array de variantes vacío cae al stock del producto", () => {
    expect(productStock(makeProduct({ stock: 8, variants: [] }))).toBe(8);
  });
});

describe("productVisible / productAvailable", () => {
  it("isAvailable false lo oculta aunque haya stock", () => {
    const p = makeProduct({ isAvailable: false, stock: 10 });
    expect(productVisible(p)).toBe(false);
    expect(productAvailable(p)).toBe(false);
  });

  it("isAvailable ausente se trata como visible", () => {
    const p = makeProduct();
    // @ts-expect-error simulamos un documento sin el campo
    delete p.isAvailable;
    expect(productVisible(p)).toBe(true);
  });

  it("stock cero no está disponible pero sí es visible", () => {
    const p = makeProduct({ stock: 0 });
    expect(productVisible(p)).toBe(true);
    expect(productAvailable(p)).toBe(false);
  });

  it("variantes con stock > 0 lo hacen disponible", () => {
    const p = makeProduct({
      stock: 0,
      variants: [{ id: "a", stock: 1 }],
    });
    expect(productAvailable(p)).toBe(true);
  });
});

describe("effectivePrice", () => {
  const p = makeProduct({ price: 50000 });

  it("sin variante usa el precio del producto", () => {
    expect(effectivePrice(p)).toBe(50000);
    expect(effectivePrice(p, null)).toBe(50000);
  });

  it("la variante con precio propio manda", () => {
    expect(effectivePrice(p, { id: "a", price: 60000, stock: 1 })).toBe(60000);
  });

  it("variante sin precio (o inválido) usa el del producto", () => {
    expect(effectivePrice(p, { id: "a", stock: 1 })).toBe(50000);
    expect(effectivePrice(p, { id: "a", price: Number.NaN, stock: 1 })).toBe(50000);
  });
});

describe("sortProducts", () => {
  const a = makeProduct({ sku: "A", name: "Ámbar", price: 30000, stock: 1, priority: 2 });
  const b = makeProduct({ sku: "B", name: "Borneo", price: 10000, stock: 9, priority: 1 });
  const c = makeProduct({ sku: "C", name: "Café", price: 20000, stock: 5, priority: 1, featured: true });

  it("displayOrder respeta priority y desempata por nombre", () => {
    const sorted = sortProducts([a, b, c], "displayOrder");
    expect(sorted.map((p) => p.sku)).toEqual(["B", "C", "A"]); // b y c: priority 1, Borneo < Café
  });

  it("priceAsc ordena de menor a mayor", () => {
    const sorted = sortProducts([a, b, c], "priceAsc");
    expect(sorted.map((p) => p.price)).toEqual([10000, 20000, 30000]);
  });

  it("priceDesc ordena de mayor a menor", () => {
    const sorted = sortProducts([a, b, c], "priceDesc");
    expect(sorted.map((p) => p.price)).toEqual([30000, 20000, 10000]);
  });

  it("nameAsc ordena alfabéticamente en español", () => {
    const sorted = sortProducts([c, a, b], "nameAsc");
    expect(sorted.map((p) => p.name)).toEqual(["Ámbar", "Borneo", "Café"]);
  });

  it("stockDesc ordena por stock total (con variantes)", () => {
    const withVariants = makeProduct({
      sku: "V",
      stock: 0,
      variants: [
        { id: "1", stock: 4 },
        { id: "2", stock: 4 },
      ],
    });
    const sorted = sortProducts([a, withVariants, b], "stockDesc");
    expect(sorted.map((p) => p.sku)).toEqual(["B", "V", "A"]);
  });

  it("featuredFirst pone destacados primero", () => {
    const sorted = sortProducts([a, b, c], "featuredFirst");
    expect(sorted[0].sku).toBe("C");
  });

  it("no muta el array original", () => {
    const input = [a, b, c];
    const copy = [...input];
    sortProducts(input, "priceAsc");
    expect(input).toEqual(copy);
  });
});

describe("statusLabel", () => {
  it("traduce los estados conocidos", () => {
    expect(statusLabel("pending")).toBe("Pendiente");
    expect(statusLabel("dispatched")).toBe("Enviado");
    expect(statusLabel("cancelled")).toBe("Cancelado");
  });

  it("devuelve el valor crudo si no lo conoce", () => {
    expect(statusLabel("otro")).toBe("otro");
  });
});

describe("variantLabel", () => {
  it("une color y talla con ' / '", () => {
    expect(variantLabel({ id: "x", color: "Negro", size: "M", stock: 1 })).toBe("Negro / M");
  });

  it("omite las partes ausentes", () => {
    expect(variantLabel({ id: "x", size: "M", stock: 1 })).toBe("M");
    expect(variantLabel({ id: "x", color: "Negro", stock: 1 })).toBe("Negro");
    expect(variantLabel({ id: "x", stock: 1 })).toBe("");
  });
});
