import { describe, it, expect } from "vitest";
import {
  roundMoney,
  cleanText,
  isValidEmail,
  normalizePhone,
  normalizeVariants,
  variantDisplayLabel,
  parseItems,
  normalizeSku,
  normalizeSkuDashed,
  aggregateStockDelta,
  netStockDelta,
  escapeHtml,
  hitRateLimit,
  pruneRateLimitBucket,
  CLIENT_KEY_REGEX,
} from "../src/helpers";

describe("escapeHtml", () => {
  it("escapa los caracteres peligrosos de HTML", () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"
    );
    expect(escapeHtml("O'Brien & Cía")).toBe("O&#39;Brien &amp; Cía");
  });

  it("devuelve cadena vacía para nulos", () => {
    expect(escapeHtml(undefined)).toBe("");
    expect(escapeHtml(null)).toBe("");
  });
});

describe("hitRateLimit / pruneRateLimitBucket", () => {
  it("permite hasta el máximo y luego bloquea dentro de la ventana", () => {
    const bucket = new Map<string, number[]>();
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) {
      expect(hitRateLimit(bucket, "k", 3, 60_000, now + i)).toBe(false);
    }
    expect(hitRateLimit(bucket, "k", 3, 60_000, now + 3)).toBe(true);
  });

  it("las llamadas viejas ya no cuentan", () => {
    const bucket = new Map<string, number[]>();
    const now = 1_000_000;
    expect(hitRateLimit(bucket, "k", 1, 1_000, now)).toBe(false);
    // 2 s después: la ventana de 1 s ya no la ve.
    expect(hitRateLimit(bucket, "k", 1, 1_000, now + 2_000)).toBe(false);
  });

  it("pruneRateLimitBucket borra claves vacías solo si hay muchas", () => {
    const bucket = new Map<string, number[]>([["vieja", [10]]]);
    pruneRateLimitBucket(bucket, 1_000, 100_000_000); // tamaño < 5000: no poda
    expect(bucket.has("vieja")).toBe(true);
    for (let i = 0; i < 5001; i++) bucket.set(`k${i}`, [10]);
    pruneRateLimitBucket(bucket, 1_000, 100_000_000);
    expect(bucket.has("vieja")).toBe(false);
  });
});

describe("CLIENT_KEY_REGEX", () => {
  it("acepta teléfonos con + y ids de invitado", () => {
    expect(CLIENT_KEY_REGEX.test("+573125866072")).toBe(true);
    expect(CLIENT_KEY_REGEX.test("guest-1763170000-a3f9k2")).toBe(true);
  });

  it("rechaza rutas y caracteres peligrosos", () => {
    expect(CLIENT_KEY_REGEX.test("a/b")).toBe(false);
    expect(CLIENT_KEY_REGEX.test("..")).toBe(false);
    expect(CLIENT_KEY_REGEX.test("guest con espacios")).toBe(false);
    expect(CLIENT_KEY_REGEX.test("")).toBe(false);
    expect(CLIENT_KEY_REGEX.test("+")).toBe(false);
  });
});

describe("roundMoney", () => {
  it("redondea a 2 decimales", () => {
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundMoney(10.004)).toBe(10);
    expect(roundMoney(0)).toBe(0);
    expect(roundMoney(19999.999)).toBe(20000);
  });
});

describe("cleanText", () => {
  it("recorta espacios y limita longitud", () => {
    expect(cleanText("  hola  ", 10)).toBe("hola");
    expect(cleanText("abcdefghij", 4)).toBe("abcd");
  });

  it("devuelve vacío para no-strings", () => {
    expect(cleanText(undefined, 10)).toBe("");
    expect(cleanText(123, 10)).toBe("");
    expect(cleanText(null, 10)).toBe("");
  });
});

describe("isValidEmail", () => {
  it("acepta correos válidos", () => {
    expect(isValidEmail("a@b.com")).toBe(true);
    expect(isValidEmail("cliente+1@tienda.co")).toBe(true);
  });

  it("rechaza correos inválidos", () => {
    expect(isValidEmail("sin-arroba.com")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("a b@c.com")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});

describe("normalizePhone", () => {
  it("acepta formatos colombianos comunes", () => {
    expect(normalizePhone("+57 312 586 6072")).toBe("+573125866072");
    // Sin indicativo el número queda tal cual: la función no agrega "57".
    expect(normalizePhone("3125866072")).toBe("+3125866072");
    expect(normalizePhone("+573125866072")).toBe("+573125866072");
  });

  it("rechaza números muy cortos o muy largos", () => {
    expect(normalizePhone("123456")).toBe("");
    expect(normalizePhone("1".repeat(16))).toBe("");
  });

  it("devuelve vacío para no-strings", () => {
    expect(normalizePhone(undefined)).toBe("");
    expect(normalizePhone(573125866072)).toBe("");
  });
});

describe("normalizeSku / normalizeSkuDashed", () => {
  it("elimina espacios sin agregar guion (regla actual)", () => {
    expect(normalizeSku("A 1")).toBe("A1");
    expect(normalizeSku("  A   B  ")).toBe("AB");
  });

  it("convierte barras en guion", () => {
    expect(normalizeSku("A5511-9/10")).toBe("A5511-9-10");
  });

  it("la variante con guion usa guion por espacio (respaldo legacy)", () => {
    expect(normalizeSkuDashed("A 1")).toBe("A-1");
    expect(normalizeSkuDashed("A5511-9/10")).toBe("A5511-9-10");
  });
});

describe("normalizeVariants", () => {
  it("devuelve [] si no es array", () => {
    expect(normalizeVariants(undefined)).toEqual([]);
    expect(normalizeVariants("x")).toEqual([]);
    expect(normalizeVariants(null)).toEqual([]);
  });

  it("conserva variantes válidas con id y stock", () => {
    const out = normalizeVariants([
      { id: "negro-m", color: "Negro", size: "M", colorHex: "#111111", price: 50000, stock: 3 },
    ]);
    expect(out).toEqual([
      { id: "negro-m", color: "Negro", size: "M", colorHex: "#111111", price: 50000, stock: 3 },
    ]);
  });

  it("descarta variantes sin id o con stock inválido", () => {
    const out = normalizeVariants([
      { id: "", stock: 5 },
      { id: "a", stock: -1 },
      { id: "b", stock: "no-numero" },
      { id: "c", stock: 2 },
      null,
      "basura",
    ]);
    expect(out.map((v) => v.id)).toEqual(["c"]);
  });

  it("stock numérico como string se acepta; precio inválido se omite", () => {
    const out = normalizeVariants([
      { id: "a", stock: "7", price: "caro" },
      { id: "b", stock: 1, price: -100 },
      { id: "c", stock: 1, price: 12345 },
    ]);
    expect(out[0]).toEqual({ id: "a", stock: 7 });
    expect(out[1]).toEqual({ id: "b", stock: 1 });
    expect(out[2]).toEqual({ id: "c", stock: 1, price: 12345 });
  });
});

describe("variantDisplayLabel", () => {
  it("une color y talla con ' / '", () => {
    expect(variantDisplayLabel({ id: "x", color: "Negro", size: "M", stock: 1 })).toBe("Negro / M");
    expect(variantDisplayLabel({ id: "x", size: "L", stock: 1 })).toBe("L");
    expect(variantDisplayLabel({ id: "x", stock: 1 })).toBe("");
  });
});

describe("parseItems", () => {
  it("rechaza carrito vacío o no-array", () => {
    expect(() => parseItems(undefined)).toThrowError(/vacío/);
    expect(() => parseItems([])).toThrowError(/vacío/);
    expect(() => parseItems("no")).toThrowError(/vacío/);
  });

  it("rechaza más de 50 líneas", () => {
    const items = Array.from({ length: 51 }, (_, i) => ({
      sku: `SKU-${i}`,
      catalogId: "catalogo",
      quantity: 1,
    }));
    expect(() => parseItems(items)).toThrowError(/demasiados/);
  });

  it("rechaza items sin sku o sin catálogo", () => {
    expect(() => parseItems([{ quantity: 1, catalogId: "c" }])).toThrowError(/inválido/);
    expect(() => parseItems([{ sku: "S", quantity: 1 }])).toThrowError(/inválido/);
  });

  it("rechaza cantidades no enteras, cero, negativas o mayores a 999", () => {
    for (const quantity of [0, -1, 1.5, 1000, Number.NaN, "tres" as unknown as number]) {
      expect(() =>
        parseItems([{ sku: "S", catalogId: "c", quantity }])
      ).toThrowError(/Cantidad inválida/);
    }
  });

  it("acepta cantidad como string numérico", () => {
    const out = parseItems([{ sku: "S", catalogId: "c", quantity: "2" as unknown as number }]);
    expect(out[0].quantity).toBe(2);
  });

  it("fusiona líneas duplicadas del mismo SKU sumando cantidades", () => {
    const out = parseItems([
      { sku: "S", catalogId: "c", quantity: 1 },
      { sku: "S", catalogId: "c", quantity: 2 },
    ]);
    expect(out).toEqual([{ sku: "S", catalogId: "c", quantity: 3 }]);
  });

  it("no fusiona el mismo SKU con variantes distintas", () => {
    const out = parseItems([
      { sku: "S", catalogId: "c", quantity: 1, variantId: "a" },
      { sku: "S", catalogId: "c", quantity: 1, variantId: "b" },
    ]);
    expect(out).toHaveLength(2);
  });

  it("conserva la nota de la primera línea si la fusión no tenía", () => {
    const out = parseItems([
      { sku: "S", catalogId: "c", quantity: 1 },
      { sku: "S", catalogId: "c", quantity: 1, note: "envolver" },
    ]);
    expect(out[0].note).toBe("envolver");
  });

  it("recorta nota y campos largos", () => {
    const out = parseItems([
      { sku: "S", catalogId: "c", quantity: 1, note: "x".repeat(500) },
    ]);
    expect(out[0].note).toHaveLength(200);
  });
});

describe("aggregateStockDelta", () => {
  it("suma cantidades por SKU sin variantes", () => {
    const { stockDeltaBySku, variantDeltas } = aggregateStockDelta([
      { sku: "A", quantity: 2 },
      { sku: "B", quantity: 1 },
      { sku: "A", quantity: 3 },
    ]);
    expect(stockDeltaBySku.get("A")).toBe(5);
    expect(stockDeltaBySku.get("B")).toBe(1);
    expect(variantDeltas.size).toBe(0);
  });

  it("agrega por variante y conserva el total por SKU", () => {
    const { stockDeltaBySku, variantDeltas } = aggregateStockDelta([
      { sku: "A", quantity: 1, variantId: "negro" },
      { sku: "A", quantity: 2, variantId: "blanco" },
      { sku: "A", quantity: 4, variantId: "negro" },
    ]);
    expect(stockDeltaBySku.get("A")).toBe(7);
    expect(variantDeltas.get("A")?.get("negro")).toBe(5);
    expect(variantDeltas.get("A")?.get("blanco")).toBe(2);
  });

  it("ignora líneas con sku vacío o cantidad no válida", () => {
    const { stockDeltaBySku } = aggregateStockDelta([
      { sku: "", quantity: 3 },
      { sku: "A", quantity: 0 },
      { sku: "A", quantity: 1.5 },
      { quantity: 2 },
      { sku: "B", quantity: 2 },
    ]);
    expect(stockDeltaBySku.size).toBe(1);
    expect(stockDeltaBySku.get("B")).toBe(2);
  });

  it("el total por SKU incluye las líneas con variante (misma cuenta que adjustStock)", () => {
    const items = [
      { sku: "A", quantity: 1, variantId: "negro" },
      { sku: "A", quantity: 2 },
    ];
    const { stockDeltaBySku } = aggregateStockDelta(items);
    // El inventario se descuenta por SKU usando esta misma función tanto al
    // crear como al reponer: las cuentas siempre cuadran.
    expect(stockDeltaBySku.get("A")).toBe(3);
  });
});

describe("netStockDelta", () => {
  it("cantidad reducida devuelve unidades al inventario", () => {
    const { increase, decrease } = netStockDelta(
      [{ sku: "A", quantity: 3 }],
      [{ sku: "A", quantity: 1 }]
    );
    expect(decrease.stockDeltaBySku.get("A")).toBe(2);
    expect(increase.stockDeltaBySku.size).toBe(0);
  });

  it("cantidad aumentada descuenta unidades adicionales", () => {
    const { increase, decrease } = netStockDelta(
      [{ sku: "A", quantity: 1 }],
      [{ sku: "A", quantity: 4 }]
    );
    expect(increase.stockDeltaBySku.get("A")).toBe(3);
    expect(decrease.stockDeltaBySku.size).toBe(0);
  });

  it("renglón borrado devuelve todo su stock", () => {
    const { increase, decrease } = netStockDelta(
      [
        { sku: "A", quantity: 2, variantId: "negro" },
        { sku: "B", quantity: 1 },
      ],
      [{ sku: "B", quantity: 1 }]
    );
    expect(decrease.stockDeltaBySku.get("A")).toBe(2);
    expect(decrease.variantDeltas.get("A")?.get("negro")).toBe(2);
    expect(increase.stockDeltaBySku.size).toBe(0);
  });

  it("edición sin tocar cantidades devuelve ambos grupos vacíos", () => {
    const { increase, decrease } = netStockDelta(
      [{ sku: "A", quantity: 1 }],
      [{ sku: "A", quantity: 1, note: "envolver" } as any]
    );
    expect(increase.stockDeltaBySku.size).toBe(0);
    expect(decrease.stockDeltaBySku.size).toBe(0);
  });

  it("variantes distintas se ajustan por separado", () => {
    const { increase, decrease } = netStockDelta(
      [
        { sku: "A", quantity: 1, variantId: "negro" },
        { sku: "A", quantity: 5, variantId: "blanco" },
      ],
      [
        { sku: "A", quantity: 3, variantId: "negro" },
        { sku: "A", quantity: 4, variantId: "blanco" },
      ]
    );
    expect(increase.variantDeltas.get("A")?.get("negro")).toBe(2);
    expect(decrease.variantDeltas.get("A")?.get("blanco")).toBe(1);
    // El total por SKU solo se usa en productos sin variantes; para variantes
    // las diferencias viven en los mapas por variante.
    expect(increase.stockDeltaBySku.get("A")).toBe(1);
  });

  it("mezcla aumento en una línea y reducción en otra del mismo pedido", () => {
    const { increase, decrease } = netStockDelta(
      [
        { sku: "A", quantity: 1 },
        { sku: "B", quantity: 5 },
      ],
      [
        { sku: "A", quantity: 3 },
        { sku: "B", quantity: 2 },
      ]
    );
    expect(increase.stockDeltaBySku.get("A")).toBe(2);
    expect(decrease.stockDeltaBySku.get("B")).toBe(3);
  });

  it("un renglón nuevo en el pedido descuenta", () => {
    const { increase, decrease } = netStockDelta(
      [],
      [{ sku: "A", quantity: 2 }]
    );
    expect(increase.stockDeltaBySku.get("A")).toBe(2);
    expect(decrease.stockDeltaBySku.size).toBe(0);
  });
});
