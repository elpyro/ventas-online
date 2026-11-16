import { HttpsError } from "firebase-functions/v2/https";

// ---------------------------------------------------------------------------
// Helpers puros (sin acceso a Firestore): compartidos por index.ts y por los
// tests unitarios. Mantenerlos libres de dependencias de red/admin.
// ---------------------------------------------------------------------------

/**
 * Limita llamadas por clave en memoria (por instancia Cloud Function).
 * Devuelve true si se superó el máximo dentro de la ventana. No es un límite
 * perfecto entre instancias; es un freno de coste/abuso casual, no un muro.
 */
export function hitRateLimit(
  bucket: Map<string, number[]>,
  key: string,
  max: number,
  windowMs: number,
  now: number = Date.now()
): boolean {
  const windowStart = now - windowMs;
  const calls = (bucket.get(key) ?? []).filter((t) => t > windowStart);
  if (calls.length >= max) {
    bucket.set(key, calls);
    return true;
  }
  calls.push(now);
  bucket.set(key, calls);
  return false;
}

/** Limpieza oportunista del bucket (evita crecer sin límite con claves viejas). */
export function pruneRateLimitBucket(
  bucket: Map<string, number[]>,
  maxAgeMs: number,
  now: number = Date.now()
): void {
  if (bucket.size <= 5000) return;
  const cutoff = now - maxAgeMs;
  for (const [k, v] of bucket) {
    const calls = v.filter((t) => t > cutoff);
    if (calls.length === 0) bucket.delete(k);
    else bucket.set(k, calls);
  }
}

/** Escapa texto controlado por el usuario para interpolar en HTML (correos, etc.). */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * clientKey de saveSelectingDraft: teléfono internacional ("+<dígitos>", 7-15)
 * o un id de invitado ("guest-<ts>-<rand>", alfanumérico y guiones).
 */
export const CLIENT_KEY_REGEX = /^(\+[0-9]{7,15}|[A-Za-z0-9-]{1,64})$/;

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Acepta "+57 312 586 6072", "3125866072", etc. Devuelve "+<digitos>". */
export function normalizePhone(value: unknown): string {
  if (typeof value !== "string") return "";
  const digits = value.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return "";
  return `+${digits}`;
}

export type RawOrderItem = {
  sku?: unknown;
  quantity?: unknown;
  catalogId?: unknown;
  variantId?: unknown;
  note?: unknown;
};

export type OrderItemInput = {
  sku: string;
  quantity: number;
  catalogId: string;
  variantId?: string;
  note?: string;
};

export type RawVariant = {
  id: string;
  color?: string;
  size?: string;
  colorHex?: string;
  price?: number;
  stock: number;
};

/** Normaliza las variantes leídas desde Firestore (datos confiables del servidor). */
export function normalizeVariants(raw: unknown): RawVariant[] {
  if (!Array.isArray(raw)) return [];
  const out: RawVariant[] = [];
  for (const value of raw) {
    if (!value || typeof value !== "object") continue;
    const o = value as Record<string, unknown>;
    const id = cleanText(o.id, 80);
    const stockRaw = typeof o.stock === "number" ? o.stock : Number(o.stock);
    if (!id || !Number.isFinite(stockRaw) || stockRaw < 0) continue;
    const color = cleanText(o.color, 40);
    const size = cleanText(o.size, 40);
    const colorHex = cleanText(o.colorHex, 20);
    const priceRaw = typeof o.price === "number" ? o.price : Number(o.price);
    const price =
      Number.isFinite(priceRaw) && priceRaw >= 0 ? priceRaw : undefined;
    out.push({
      id,
      stock: stockRaw,
      ...(color ? { color } : {}),
      ...(size ? { size } : {}),
      ...(colorHex ? { colorHex } : {}),
      ...(price !== undefined ? { price } : {}),
    });
  }
  return out;
}

export function variantDisplayLabel(variant: RawVariant): string {
  return [variant.color, variant.size].filter(Boolean).join(" / ");
}

export function parseItems(raw: unknown): OrderItemInput[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new HttpsError("invalid-argument", "El carrito está vacío.");
  }
  if (raw.length > 50) {
    throw new HttpsError("invalid-argument", "El pedido tiene demasiados productos.");
  }

  const merged = new Map<string, OrderItemInput>();

  for (const value of raw) {
    const item = (value ?? {}) as RawOrderItem;
    const sku = cleanText(item.sku, 120);
    const catalogId = cleanText(item.catalogId, 120);
    const variantId = cleanText(item.variantId, 80);
    const note = cleanText(item.note, 200);
    const quantity = typeof item.quantity === "number" ? item.quantity : Number(item.quantity);

    if (!sku || !catalogId) {
      throw new HttpsError("invalid-argument", "Hay un producto inválido en el carrito.");
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      throw new HttpsError("invalid-argument", `Cantidad inválida para ${sku}.`);
    }

    // Se permite comprar el mismo SKU con variantes distintas: líneas separadas.
    const mergeKey = variantId ? `${sku}::${variantId}` : sku;
    const existing = merged.get(mergeKey);
    if (existing) {
      existing.quantity += quantity;
      if (!existing.note && note) existing.note = note;
    } else {
      merged.set(mergeKey, {
        sku,
        quantity,
        catalogId,
        ...(variantId ? { variantId } : {}),
        ...(note ? { note } : {}),
      });
    }
  }

  return [...merged.values()];
}

// Desglose agregado del inventario a descontar/reponer por SKU y variante.
export type StockDeltaBySku = Map<string, number>;
export type VariantDeltas = Map<string, Map<string, number>>;

/**
 * Agrega las cantidades por SKU (y por variante) de las líneas de un pedido.
 * Es la base única del descuento al crear el pedido y de la reposición al
 * cancelar, para que ambas cuentas siempre cuadren. Pura y testeable.
 */
export function aggregateStockDelta(
  items: Array<{ sku?: unknown; quantity?: unknown; variantId?: unknown }>
): { stockDeltaBySku: StockDeltaBySku; variantDeltas: VariantDeltas } {
  const stockDeltaBySku: StockDeltaBySku = new Map();
  const variantDeltas: VariantDeltas = new Map();
  for (const it of items) {
    const sku = String(it.sku ?? "");
    if (!sku) continue;
    const qty = Number(it.quantity ?? 0);
    if (!Number.isInteger(qty) || qty < 1) continue;
    stockDeltaBySku.set(sku, (stockDeltaBySku.get(sku) ?? 0) + qty);
    if (typeof it.variantId === "string" && it.variantId) {
      const byVariant = variantDeltas.get(sku) ?? new Map<string, number>();
      byVariant.set(it.variantId, (byVariant.get(it.variantId) ?? 0) + qty);
      variantDeltas.set(sku, byVariant);
    }
  }
  return { stockDeltaBySku, variantDeltas };
}

// Grupos de ajuste: lo que se descuenta de más (aumento) y lo que se
// devuelve al inventario (reducción). Cada uno se pasa a applyStockDeltaInTx.
export type StockDeltaGroup = {
  stockDeltaBySku: StockDeltaBySku;
  variantDeltas: VariantDeltas;
};

function newStockDeltaGroup(): StockDeltaGroup {
  return { stockDeltaBySku: new Map(), variantDeltas: new Map() };
}

/**
 * Ajuste NETO entre dos versiones de las líneas de un pedido (la edición
 * desde "Preparar Pedido" en el APK). Devuelve por separado el aumento a
 * descontar y la reducción a devolver al inventario; si ninguna cantidad
 * cambió, ambos grupos vienen vacíos y no se escribe nada.
 */
export function netStockDelta(
  beforeItems: Array<{ sku?: unknown; quantity?: unknown; variantId?: unknown }>,
  afterItems: Array<{ sku?: unknown; quantity?: unknown; variantId?: unknown }>
): { increase: StockDeltaGroup; decrease: StockDeltaGroup } {
  const before = aggregateStockDelta(beforeItems);
  const after = aggregateStockDelta(afterItems);
  const increase = newStockDeltaGroup();
  const decrease = newStockDeltaGroup();
  const bucket = (delta: number): StockDeltaGroup =>
    delta > 0 ? increase : decrease;
  const skus = new Set([
    ...before.stockDeltaBySku.keys(),
    ...after.stockDeltaBySku.keys(),
  ]);
  for (const sku of skus) {
    // Total por SKU: lo usan los productos SIN variantes; para variantes el
    // servidor recalcula el stock total desde ellas y este valor se ignora.
    const dSku =
      (after.stockDeltaBySku.get(sku) ?? 0) - (before.stockDeltaBySku.get(sku) ?? 0);
    if (dSku !== 0) {
      bucket(dSku).stockDeltaBySku.set(sku, Math.abs(dSku));
    }
    // Deltas por variante: lo usan los productos CON variantes.
    const bVar = before.variantDeltas.get(sku) ?? new Map<string, number>();
    const aVar = after.variantDeltas.get(sku) ?? new Map<string, number>();
    for (const variantId of new Set([...bVar.keys(), ...aVar.keys()])) {
      const dv = (aVar.get(variantId) ?? 0) - (bVar.get(variantId) ?? 0);
      if (dv === 0) continue;
      const group = bucket(dv);
      const byVariant = group.variantDeltas.get(sku) ?? new Map<string, number>();
      byVariant.set(variantId, Math.abs(dv));
      group.variantDeltas.set(sku, byVariant);
    }
  }
  return { increase, decrease };
}

/**
 * Normaliza un SKU: los espacios SOLO se eliminan ("A 1" → "A1"). Casi todos
 * los productos se importaron con el SKU sin espacios y el ERP los manda con
 * espacios, así que la regla es quitarlos, no ponerles guion. Las barras
 * siguen siendo guion, como en la migración CELTOONS ("A5511-9/10" → "A5511-9-10").
 */
export function normalizeSku(value: string): string {
  return value.trim().replace(/\s+/g, "").replace(/\/+/g, "-");
}

/**
 * Variante con guion ("A 1" → "A-1"): la regla anterior. Se usa como respaldo
 * para los pocos SKUs que en la migración CELTOONS quedaron con guion.
 */
export function normalizeSkuDashed(value: string): string {
  return value.trim().replace(/\s+/g, "-").replace(/\/+/g, "-");
}
