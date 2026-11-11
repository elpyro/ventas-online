import { initializeApp } from "firebase-admin/app";
import {
  DocumentReference,
  DocumentSnapshot,
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getMessaging } from "firebase-admin/messaging";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";

initializeApp();

const db = getFirestore();
const storage = getStorage();
const messaging = getMessaging();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Acepta "+57 312 586 6072", "3125866072", etc. Devuelve "+<digitos>". */
function normalizePhone(value: unknown): string {
  if (typeof value !== "string") return "";
  const digits = value.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return "";
  return `+${digits}`;
}

type RawOrderItem = {
  sku?: unknown;
  quantity?: unknown;
  catalogId?: unknown;
  variantId?: unknown;
  note?: unknown;
};

type OrderItemInput = {
  sku: string;
  quantity: number;
  catalogId: string;
  variantId?: string;
  note?: string;
};

type RawVariant = {
  id: string;
  color?: string;
  size?: string;
  colorHex?: string;
  price?: number;
  stock: number;
};

/** Normaliza las variantes leídas desde Firestore (datos confiables del servidor). */
function normalizeVariants(raw: unknown): RawVariant[] {
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

function variantDisplayLabel(variant: RawVariant): string {
  return [variant.color, variant.size].filter(Boolean).join(" / ");
}

function parseItems(raw: unknown): OrderItemInput[] {
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

// ---------------------------------------------------------------------------
// Módulo A: Webhook por SKU
// ---------------------------------------------------------------------------

/** Normaliza un SKU igual que la migración CELTOONS: espacios y barras → guiones. */
function normalizeSku(value: string): string {
  return value.trim().replace(/\s+/g, "-").replace(/\/+/g, "-");
}

export const webhookSku = onRequest(
  { region: "us-central1", cors: true },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const secret = req.headers["x-webhook-secret"];
    const expected = process.env.WEBHOOK_SECRET;
    if (!expected || secret !== expected) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const body = (req.body ?? {}) as {
      sku?: string;
      name?: string;
      price?: number;
      stock?: number;
      catalogIds?: string[];
      images?: string[];
      description?: string;
    };
    const { sku, stock, catalogIds } = body;

    if (!sku || typeof sku !== "string") {
      res.status(400).json({ error: "sku is required" });
      return;
    }

    // Guarda el SKU original tal como llegó (con espacios, si los hay)
    // para el log y la respuesta resolvedFrom.
    const requested = sku.trim();

    // Normaliza el SKU igual que la migración CELTOONS: espacios y barras → guiones.
    // Siempre buscamos el SKU canónico: si envían "CABLE 21" → buscamos "CABLE-21".
    // Esto evita crear duplicados invisibles (el incidente del fondo).
    const normalized = normalizeSku(sku);

    // Buscamos SOLO el SKU normalizado. Si no existe, 404 sin crear nada.
    const snap = await db.collection("products").doc(normalized).get();
    if (!snap.exists) {
      res.status(404).json({
        error: "product not found",
        sku: normalized,
        hint: "the webhook only updates existing products; create new ones from the admin app",
      });
      return;
    }
    const target = snap;

    const existingData = target.data() as { variants?: unknown[] } | undefined;
    const existingVariants = existingData?.variants;
    const hasVariants = Array.isArray(existingVariants) && existingVariants.length > 0;

    // Fotos, descripción, nombre y precio los administra el APK: el webhook
    // no los pisa. Se reportan como ignorados para que quien llama sepa que
    // no surtieron efecto. Blindar nombre y precio evita que un tercero
    // renombre productos o manipule los precios de la tienda.
    const ignored: string[] = [];
    if (body.images !== undefined) ignored.push("images");
    if (body.description !== undefined) ignored.push("description");
    if (body.name !== undefined) ignored.push("name");
    if (body.price !== undefined) ignored.push("price");

    // El stock de un producto con variantes se recalcula desde ellas: pisarlo
    // aquí rompería el inventario.
    if (hasVariants && stock !== undefined) ignored.push("stock");

    // Solo escribimos los campos que llegan y están permitidos: una
    // actualización parcial no borra el resto del documento.
    const payload: Record<string, unknown> = {
      sku: target.id,
      updatedAt: new Date(),
    };

    if (
      !hasVariants &&
      typeof stock === "number" &&
      Number.isInteger(stock) &&
      stock >= 0
    ) {
      payload.stock = stock;
      payload.isAvailable = stock > 0;
    }
    if (Array.isArray(catalogIds)) {
      const valid = catalogIds.filter((id) => typeof id === "string" && id !== "");
      // Un producto sin catálogos desaparece de la web: el webhook nunca lo
      // deja vacío.
      if (valid.length > 0) payload.catalogIds = valid;
      else ignored.push("catalogIds");
    }

    await target.ref.set(payload, { merge: true });

    logger.info("SKU updated", {
      sku: target.id,
      requestedSku: requested,
      resolved: target.id !== requested,
      ignored,
    });
    res.status(200).json({
      ok: true,
      sku: target.id,
      ...(target.id !== requested ? { resolvedFrom: requested } : {}),
      ...(ignored.length > 0 ? { ignored } : {}),
    });
  }
);

// ---------------------------------------------------------------------------
// Módulo B: Crear pedido en el servidor
// ---------------------------------------------------------------------------

export const createOrder = onCall(
  { region: "us-central1" },
  async (request) => {
    const data = (request.data ?? {}) as {
      customer?: {
        name?: unknown;
        email?: unknown;
        phone?: unknown;
        address?: unknown;
      };
      items?: unknown;
    };

    const customer = data.customer ?? {};
    const name = cleanText(customer.name, 120);
    const email = cleanText(customer.email, 200);
    const phone = normalizePhone(customer.phone);
    const address = cleanText(customer.address, 300);

    if (!name) {
      throw new HttpsError("invalid-argument", "Completa tu nombre.");
    }
    if (!address) {
      throw new HttpsError("invalid-argument", "Completa la dirección de entrega.");
    }
    if (!isValidEmail(email)) {
      throw new HttpsError("invalid-argument", "Ingresa un correo válido.");
    }
    if (!phone) {
      throw new HttpsError("invalid-argument", "Ingresa un teléfono válido (7 a 15 dígitos).");
    }

    const items = parseItems(data.items);
    const orderRef = db.collection("orders").doc();

    const result = await db.runTransaction(async (tx) => {
      // 1. Lecturas (todas antes de cualquier escritura).
      const configSnap = await tx.get(db.doc("store_config/general"));
      if (!configSnap.exists) {
        throw new HttpsError("failed-precondition", "La tienda no está configurada.");
      }
      const config = configSnap.data() ?? {};

      const uniqueSkus = [...new Set(items.map((item) => item.sku))];
      const productRefs = new Map<string, DocumentReference>();
      const productSnaps = new Map<string, DocumentSnapshot>();

      // Lectura única por SKU: el mismo producto puede venir en varias líneas (variantes).
      for (const sku of uniqueSkus) {
        const ref = db.doc(`products/${sku}`);
        productRefs.set(sku, ref);
        productSnaps.set(sku, await tx.get(ref));
      }

      const catalogIds = [...new Set(items.map((item) => item.catalogId))];
      const catalogSnaps = new Map<string, DocumentSnapshot>();

      for (const catalogId of catalogIds) {
        const snap = await tx.get(db.doc(`catalogs/${catalogId}`));
        catalogSnaps.set(catalogId, snap);
      }

      const customerRef = db.doc(`customers/${phone}`);
      const customerSnap = await tx.get(customerRef);

      // Borrador "Seleccionando" a borrar al confirmar (lectura ANTES de escribir).
      // Firestore aborta la transacción si hay una lectura después de una escritura.
      // El draft vive en `orders/selecting-{clientKey}` (status selecting) para
      // que el admin lo vea como un pedido en la app.
      const draftRef = db.doc(`orders/selecting-${phone}`);
      const draftSnap = await tx.get(draftRef);

      // 2. Validaciones y cálculo con precios del servidor.
      const lines: Array<{
        sku: string;
        name: string;
        catalogId: string;
        unitPrice: number;
        quantity: number;
        subtotal: number;
        variantId?: string;
        variantLabel?: string;
        note?: string;
      }> = [];

      const subtotalByCatalog: Record<string, number> = {};
      // Descuento de stock agregado por SKU (y por variante si aplica).
      const stockDeltaBySku = new Map<string, number>();
      const variantDeltas = new Map<string, Map<string, number>>();
      let total = 0;

      for (const item of items) {
        const snap = productSnaps.get(item.sku);
        if (!snap?.exists) {
          throw new HttpsError("not-found", `El producto ${item.sku} ya no está disponible.`);
        }

        const product = snap.data() ?? {};
        const productName = typeof product.name === "string" ? product.name : item.sku;
        const price = typeof product.price === "number" ? product.price : NaN;
        const available = product.isAvailable !== false;
        const productCatalogIds = Array.isArray(product.catalogIds) ? product.catalogIds : [];

        if (!available) {
          throw new HttpsError("failed-precondition", `${productName} no está disponible.`);
        }
        if (!productCatalogIds.includes(item.catalogId)) {
          throw new HttpsError("invalid-argument", `${productName} no pertenece a ese catálogo.`);
        }
        if (!Number.isFinite(price) || price < 0) {
          throw new HttpsError("failed-precondition", `${productName} no tiene un precio válido.`);
        }

        const variants = normalizeVariants(product.variants);
        let unitPrice = price;
        let variant: RawVariant | undefined;

        if (variants.length > 0) {
          // Producto con variantes: el stock y el precio salen de la variante elegida.
          if (!item.variantId) {
            throw new HttpsError(
              "invalid-argument",
              `${productName} requiere elegir una opción (color/talla).`
            );
          }
          const match = variants.find((v) => v.id === item.variantId);
          if (!match) {
            throw new HttpsError(
              "failed-precondition",
              `La opción elegida para ${productName} ya no está disponible.`
            );
          }
          if (match.stock < item.quantity) {
            throw new HttpsError(
              "failed-precondition",
              `No hay stock suficiente de ${productName}${
                variantDisplayLabel(match) ? ` (${variantDisplayLabel(match)})` : ""
              }. Disponible: ${match.stock}.`
            );
          }
          unitPrice = typeof match.price === "number" ? match.price : price;
          variant = match;
        } else {
          if (item.variantId) {
            throw new HttpsError(
              "invalid-argument",
              `${productName} no tiene opciones de color/talla.`
            );
          }
          const stock = typeof product.stock === "number" ? product.stock : 0;
          if (stock < item.quantity) {
            throw new HttpsError(
              "failed-precondition",
              `No hay stock suficiente de ${productName}. Disponible: ${stock}.`
            );
          }
        }

        const subtotal = roundMoney(unitPrice * item.quantity);
        total = roundMoney(total + subtotal);
        subtotalByCatalog[item.catalogId] = roundMoney(
          (subtotalByCatalog[item.catalogId] ?? 0) + subtotal
        );

        stockDeltaBySku.set(item.sku, (stockDeltaBySku.get(item.sku) ?? 0) + item.quantity);
        if (variant) {
          const byVariant = variantDeltas.get(item.sku) ?? new Map<string, number>();
          byVariant.set(variant.id, (byVariant.get(variant.id) ?? 0) + item.quantity);
          variantDeltas.set(item.sku, byVariant);
        }

        lines.push({
          sku: item.sku,
          name: productName,
          catalogId: item.catalogId,
          unitPrice,
          quantity: item.quantity,
          subtotal,
          ...(variant
            ? {
                variantId: variant.id,
                variantLabel: variantDisplayLabel(variant) || variant.id,
              }
            : {}),
          ...(item.note ? { note: item.note } : {}),
        });
      }

      // 3. Mínimos globales y por catálogo.
      const globalMin = typeof config.globalMinOrder === "number" ? config.globalMinOrder : 0;
      if (total < globalMin) {
        throw new HttpsError(
          "failed-precondition",
          `La compra mínima es $${globalMin.toFixed(2)}. Tu total es $${total.toFixed(2)}.`
        );
      }

      for (const [catalogId, subtotal] of Object.entries(subtotalByCatalog)) {
        const catalogSnap = catalogSnaps.get(catalogId);
        if (!catalogSnap?.exists) {
          throw new HttpsError("not-found", "Uno de los catálogos ya no existe.");
        }
        const catalog = catalogSnap.data() ?? {};
        if (catalog.isActive === false) {
          throw new HttpsError(
            "failed-precondition",
            `El catálogo ${catalog.title ?? catalogId} no está disponible.`
          );
        }
        const min = typeof catalog.minOrderSubtotal === "number" ? catalog.minOrderSubtotal : 0;
        if (subtotal < min) {
          throw new HttpsError(
            "failed-precondition",
            `El catálogo ${catalog.title ?? catalogId} requiere un mínimo de $${min.toFixed(
              2
            )}. Tu subtotal es $${subtotal.toFixed(2)}.`
          );
        }
      }

      // 4. Escrituras.
      tx.set(orderRef, {
        customerPhone: phone,
        customerName: name,
        customerEmail: email,
        deliveryAddress: address,
        items: lines,
        total,
        status: "pending",
        // El stock se descuenta al pasar a "Listo" (ver onOrderStatusUpdated),
        // no al crear el pedido. stockDecremented marca si ya se descontó.
        stockDecremented: false,
        source: "web",
        ...(request.auth ? { userId: request.auth.uid } : {}),
        createdAt: FieldValue.serverTimestamp(),
      });

      // 5. Borrar el borrador "Seleccionando" de este cliente (si existía).
      if (draftSnap.exists) {
        tx.delete(draftRef);
      }

      // El stock NO se descuenta al crear: se descuenta al pasar a "Listo"
      // (onOrderStatusUpdated) y se repone al cancelar.

      // Solo actualizamos el perfil si el pedido pertenece al usuario autenticado.
      if (request.auth?.token.phone_number === phone) {
        tx.set(
          customerRef,
          {
            phone,
            name,
            email,
            address,
            ...(customerSnap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      return { orderId: orderRef.id, total, itemCount: lines.length };
    });

    logger.info("Order created", {
      orderId: result.orderId,
      total: result.total,
      items: result.itemCount,
      guest: !request.auth,
    });

    return result;
  }
);

// ---------------------------------------------------------------------------
// Módulo B.1: Borrador "Seleccionando" (uno por cliente, sin stock)
// ---------------------------------------------------------------------------

export const saveSelectingDraft = onCall(
  { region: "us-central1" },
  async (request) => {
    const data = (request.data ?? {}) as {
      clientKey?: unknown;
      customerPhone?: unknown;
      items?: unknown;
    };
    const clientKey = cleanText(data.clientKey, 120);
    if (!clientKey) {
      throw new HttpsError("invalid-argument", "Falta identificar al cliente.");
    }
    const items = parseItems(data.items);
    const phone = normalizePhone(data.customerPhone);
    const ref = db.doc(`orders/selecting-${clientKey}`);

    // Enriquecer líneas con nombre/precio/subtotal reales (antes solo se
    // guardaba sku; por eso veías el SKU sin montos en el APK).
    const lines: Array<{
      sku: string;
      name: string;
      catalogId: string;
      unitPrice: number;
      quantity: number;
      subtotal: number;
      variantId?: string;
      variantLabel?: string;
      note?: string;
    }> = [];
    let total = 0;
    for (const item of items) {
      const snap = await db.doc(`products/${item.sku}`).get();
      const product = snap.data() ?? {};
      const name = snap.exists && typeof product.name === "string" ? product.name : item.sku;
      let unitPrice = typeof product.price === "number" ? product.price : 0;
      let variantLabel: string | undefined;
      if (item.variantId) {
        const vs = normalizeVariants(product.variants);
        const match = vs.find((v: any) => v.id === item.variantId);
        if (match) {
          unitPrice = typeof match.price === "number" ? match.price : unitPrice;
          variantLabel = variantDisplayLabel(match) || match.id;
        }
      }
      const subtotal = roundMoney(unitPrice * item.quantity);
      total = roundMoney(total + subtotal);
      lines.push({
        sku: item.sku,
        name,
        catalogId: item.catalogId,
        unitPrice,
        quantity: item.quantity,
        subtotal,
        ...(item.variantId ? { variantId: item.variantId } : {}),
        ...(variantLabel ? { variantLabel } : {}),
        ...(item.note ? { note: item.note } : {}),
      });
    }
    // Si el cliente ya está registrado con ese teléfono, relacionamos el
    // draft con su ficha (nombre/email) para que aparezca ligado al cliente.
    let linkedName = "";
    let linkedEmail = "";
    if (phone) {
      try {
        const cust = await db.doc(`customers/${phone}`).get();
        if (cust.exists) {
          linkedName = String(cust.data()?.name ?? "");
          linkedEmail = String(cust.data()?.email ?? "");
        }
      } catch {
        // Sin ficha: se guarda solo con el teléfono.
      }
    }
    await ref.set(
      {
        status: "selecting",
        customerPhone: phone || null,
        ...(linkedName ? { customerName: linkedName } : {}),
        ...(linkedEmail ? { customerEmail: linkedEmail } : {}),
        items: lines,
        itemCount: lines.length,
        total,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { ok: true, draftId: clientKey };
  }
);

// Descuento/reposición de stock según el estado (Listo / Cancelado).
async function adjustStock(order: any, delta: 1 | -1): Promise<void> {
  const items = Array.isArray(order.items) ? order.items : [];
  await db.runTransaction(async (tx) => {
    const perSku = new Map<string, { qty: number; variants: Map<string, number> }>();
    for (const it of items) {
      const sku = String(it.sku ?? "");
      if (!sku) continue;
      const qty = Number(it.quantity ?? 0);
      if (!Number.isInteger(qty) || qty < 1) continue;
      const entry = perSku.get(sku) ?? { qty: 0, variants: new Map() };
      entry.qty += qty;
      if (typeof it.variantId === "string" && it.variantId) {
        entry.variants.set(it.variantId, (entry.variants.get(it.variantId) ?? 0) + qty);
      }
      perSku.set(sku, entry);
    }
    // Lecturas primero (una por SKU), luego escrituras (Firestore aborta
    // la transacción si hay una lectura después de una escritura).
    const snaps = new Map<string, DocumentSnapshot>();
    for (const sku of perSku.keys()) {
      snaps.set(sku, await tx.get(db.doc(`products/${sku}`)));
    }
    for (const [sku, entry] of perSku) {
      const ref = db.doc(`products/${sku}`);
      const snap = snaps.get(sku);
      if (!snap?.exists) continue;
      const product = snap.data() ?? {};
      const variants = normalizeVariants(product.variants);
      if (variants.length > 0) {
        const newVariants = variants.map((v) => ({
          ...v,
          stock: Math.max(0, v.stock - delta * (entry.variants.get(v.id) ?? 0)),
        }));
        const newStock = newVariants.reduce((s, v) => s + v.stock, 0);
        tx.update(ref, {
          variants: newVariants,
          stock: newStock,
          isAvailable: newStock > 0,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        const stock = typeof product.stock === "number" ? product.stock : 0;
        const newStock = Math.max(0, stock - delta * entry.qty);
        tx.update(ref, {
          stock: newStock,
          isAvailable: newStock > 0,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }
  });
}

export const onOrderStatusUpdated = onDocumentUpdated(
  { document: "orders/{orderId}", region: "us-central1" },
  async (event) => {
    const before = event.data?.before.data() ?? {};
    const after = event.data?.after.data() ?? {};
    const orderRef = event.data?.after.ref;
    if (!orderRef) return;
    const orderId = event.params.orderId;
    const beforeStatus = String(before.status ?? "");
    const afterStatus = String(after.status ?? "");

    // Regenerar PDF si cambiaron items/total (edición del pedido).
    const beforeItems = JSON.stringify(before.items ?? []);
    const afterItems = JSON.stringify(after.items ?? []);
    if (beforeItems !== afterItems || Number(before.total ?? 0) !== Number(after.total ?? 0)) {
      try {
        const buf = await buildOrderPdf(after, orderId);
        const bucket = storage.bucket();
        const existing = String(after.pdfPath ?? `orders/${orderId}.pdf`);
        await bucket.file(existing).save(buf, { contentType: "application/pdf", metadata: { orderId } });
        await orderRef.set({ pdfPath: existing, pdfUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
      } catch (e) {
        logger.error("onOrderStatusUpdated: no se pudo regenerar el PDF", e);
      }
    }

    if (beforeStatus === afterStatus) return;
    const decremented = after.stockDecremented === true;

    if ((afterStatus === "ready" || afterStatus === "dispatched") && beforeStatus !== "ready" && beforeStatus !== "dispatched" && !decremented) {
      try {
        await adjustStock(after, 1);
        await orderRef.set({ stockDecremented: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      } catch (e) {
        logger.error("onOrderStatusUpdated: no se pudo descontar stock", e);
      }
    } else if (afterStatus === "cancelled" && decremented) {
      try {
        await adjustStock(after, -1);
        await orderRef.set({ stockDecremented: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      } catch (e) {
        logger.error("onOrderStatusUpdated: no se pudo reponer stock", e);
      }
    }
  }
);

// ---------------------------------------------------------------------------
// Módulo C: Automatizaciones Backend (trigger on order created)
// ---------------------------------------------------------------------------

export const onOrderCreated = onDocumentCreated(
  { document: "orders/{orderId}", region: "us-central1" },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const order = snap.data() as Record<string, any>;
    // Los drafts "Seleccionando" no generan PDF ni avisos.
    if (String(order.status ?? "") === "selecting") return;
    const orderId = event.params.orderId;
    const orderRef = snap.ref;
    const bucket = storage.bucket();

    let pdfPath = typeof order.pdfPath === "string" ? order.pdfPath : "";
    let pdfBuffer: Buffer | undefined;

    // 1. Generar el PDF solo si aún no existe (idempotencia).
    if (!pdfPath) {
      pdfBuffer = await buildOrderPdf(order, orderId);
      pdfPath = `orders/${orderId}.pdf`;
      await bucket.file(pdfPath).save(pdfBuffer, {
        contentType: "application/pdf",
        metadata: { orderId },
      });
      await orderRef.set({ pdfPath }, { merge: true });
    }

    // 2. Enviar correo una sola vez. El PDF es privado: viaja como adjunto.
    if (!order.emailSentAt && process.env.RESEND_API_KEY && order.customerEmail) {
      try {
        const buffer = pdfBuffer ?? (await bucket.file(pdfPath).download())[0];
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: process.env.RESEND_FROM ?? "pedidos@ventas.online",
          to: order.customerEmail,
          subject: `Confirmación de pedido #${orderId}`,
          html: `<p>Hola ${order.customerName},</p><p>Gracias por tu pedido. Adjuntamos el PDF con el detalle.</p>`,
          attachments: [
            {
              filename: `pedido-${orderId}.pdf`,
              content: buffer,
            },
          ],
        });
        await orderRef.set({ emailSentAt: FieldValue.serverTimestamp() }, { merge: true });
      } catch (e) {
        logger.error("Resend error", e);
      }
    }

    // 3. Notificación push una sola vez.
    if (!order.pushSentAt) {
      try {
        const tokensSnap = await db.collection("admin_tokens").get();
        const tokens = tokensSnap.docs.map((d) => d.id).filter(Boolean);
        if (tokens.length) {
          await messaging.sendEachForMulticast({
            tokens,
            notification: {
              title: "Nuevo pedido",
              body: `Pedido #${orderId} - $${order.total}`,
            },
            data: { orderId: String(orderId), type: "new_order" },
          });
        }
        await orderRef.set({ pushSentAt: FieldValue.serverTimestamp() }, { merge: true });
      } catch (e) {
        logger.error("FCM error", e);
      }
    }
  }
);

// ---------------------------------------------------------------------------
// Módulo E: Consulta de pedido sin sesión (pedido + teléfono deben coincidir)
// ---------------------------------------------------------------------------

export const getOrderDetails = onCall(
  { region: "us-central1" },
  async (request) => {
    const data = (request.data ?? {}) as {
      orderId?: unknown;
      customerPhone?: unknown;
    };

    const orderId = cleanText(data.orderId, 128);
    const phone = normalizePhone(data.customerPhone);

    if (!orderId || !phone) {
      throw new HttpsError("invalid-argument", "Ingresa el número de pedido y tu teléfono.");
    }

    const snap = await db.doc(`orders/${orderId}`).get();
    // Mismo mensaje para "no existe" y "teléfono no coincide":
    // no damos pistas de qué IDs existen.
    if (!snap.exists || snap.data()?.customerPhone !== phone) {
      throw new HttpsError("not-found", "No encontramos ese pedido con ese teléfono.");
    }

    const order = snap.data() ?? {};
    const items = Array.isArray(order.items)
      ? order.items.map((it: any) => ({
          sku: String(it.sku ?? ""),
          name: String(it.name ?? ""),
          quantity: Number(it.quantity ?? 0),
          unitPrice: Number(it.unitPrice ?? 0),
          subtotal: Number(it.subtotal ?? 0),
          ...(typeof it.variantLabel === "string" && it.variantLabel
            ? { variantLabel: it.variantLabel }
            : {}),
        }))
      : [];

    return {
      orderId,
      customerName: String(order.customerName ?? ""),
      deliveryAddress: String(order.deliveryAddress ?? ""),
      status: String(order.status ?? "pending"),
      total: Number(order.total ?? 0),
      itemCount: items.length,
      items,
      createdAt:
        typeof order.createdAt?.toDate === "function"
          ? order.createdAt.toDate().toISOString()
          : null,
    };
  }
);

export const getOrdersByPhone = onCall(
  { region: "us-central1" },
  async (request) => {
    const phone = normalizePhone(
      (request.data as { customerPhone?: unknown })?.customerPhone
    );
    if (!phone) {
      throw new HttpsError("invalid-argument", "Ingresa un teléfono válido.");
    }

    // Sin orderBy para no requerir índices compuestos; ordenamos en memoria.
    const snap = await db
      .collection("orders")
      .where("customerPhone", "==", phone)
      .limit(50)
      .get();

    const orders = snap.docs
      .map((doc) => {
        const order = doc.data();
        return {
          orderId: doc.id,
          status: String(order.status ?? "pending"),
          total: Number(order.total ?? 0),
          itemCount: Array.isArray(order.items) ? order.items.length : 0,
          createdAt:
            typeof order.createdAt?.toDate === "function"
              ? order.createdAt.toDate().toISOString()
              : null,
        };
      })
      .sort((a, b) => {
        if (!a.createdAt) return 1;
        if (!b.createdAt) return -1;
        return b.createdAt.localeCompare(a.createdAt);
      });

    return { orders };
  }
);

// ---------------------------------------------------------------------------
// Módulo D: URL firmada para el PDF (solo dueño o admin)
// ---------------------------------------------------------------------------

export const getOrderPdfUrl = onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Inicia sesión para ver el PDF.");
    }

    const orderId = cleanText((request.data as { orderId?: unknown })?.orderId, 200);
    if (!orderId) {
      throw new HttpsError("invalid-argument", "Falta el pedido.");
    }

    const snap = await db.doc(`orders/${orderId}`).get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "El pedido no existe.");
    }

    const order = snap.data() ?? {};
    const isAdmin = request.auth.token.admin === true;
    const isOwner =
      typeof request.auth.token.phone_number === "string" &&
      order.customerPhone === request.auth.token.phone_number;

    if (!isAdmin && !isOwner) {
      throw new HttpsError("permission-denied", "No puedes ver el PDF de este pedido.");
    }

    let pdfPath = typeof order.pdfPath === "string" ? order.pdfPath : "";
    const bucket = storage.bucket();
    if (!pdfPath) {
      // Generación bajo demanda: incluso los pedidos "Seleccionando" pueden
      // compartir el PDF (antes no se generaba y daba "PDF no listo").
      try {
        const buf = await buildOrderPdf(order, orderId);
        pdfPath = `orders/${orderId}.pdf`;
        await bucket.file(pdfPath).save(buf, {
          contentType: "application/pdf",
          metadata: { orderId },
        });
        await snap.ref.set({ pdfPath }, { merge: true });
      } catch (e) {
        logger.error("getOrderPdfUrl: on-demand PDF error", e);
        throw new HttpsError("failed-precondition", "El PDF todavía no está listo.");
      }
    }

    const file = bucket.file(pdfPath);
    try {
      const [url] = await file.getSignedUrl({
        action: "read",
        expires: Date.now() + 15 * 60 * 1000,
      });
      return { url };
    } catch (e: any) {
      // Fallback: la cuenta de servicio no tiene iam.serviceAccounts.signBlob
      // (causa del 500). Dejamos el PDF con lectura pública temporal como
      // deuda técnica conocida y devolvemos la URL pública de Google Storage.
      logger.warn("getOrderPdfUrl: signed URL failed, usando URL pública temporal", e);
      await file.makePublic().catch(() => undefined);
      return { url: `https://storage.googleapis.com/${bucket.name}/${pdfPath}` };
    }
  }
);

// ---------------------------------------------------------------------------
// Helper: PDF
// ---------------------------------------------------------------------------

async function buildOrderPdf(order: any, orderId: string): Promise<Buffer> {
  const PDFDocument = (await import("pdfkit")).default;
  // Datos básicos de la empresa para el encabezado del PDF.
  let store: Record<string, unknown> = {};
  try {
    const cfg = await db.doc("store_config/general").get();
    store = cfg.exists ? (cfg.data() ?? {}) : {};
  } catch {
    store = {};
  }
  const company = String(store.companyName ?? "Ventas Online");
  const phone = String(store.phoneContact ?? "");
  const city = String(store.city ?? "");
  const logoUrl = String(store.logoUrl ?? "");
  const statusEs: Record<string, string> = {
    selecting: "Seleccionando",
    pending: "Pendiente",
    preparing: "Preparando",
    ready: "Listo",
    dispatched: "Enviado",
    cancelled: "Cancelado",
  };
  const statusLabelEs = statusEs[String(order.status ?? "")] ?? String(order.status ?? "");
  // Logo para el encabezado.
  let logoBuf: Buffer | null = null;
  if (logoUrl.startsWith("http")) {
    try {
      const r = await fetch(logoUrl);
      if (r.ok) logoBuf = Buffer.from(await r.arrayBuffer());
    } catch {
      logoBuf = null;
    }
  }
  const cop = (n: number) =>
    new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 2,
    }).format(n);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Encabezado Minimalist Emerald-Contrast: dos columnas — empresa izq, factura der.
    const startY = doc.y;
    if (logoBuf) {
      try {
        doc.image(logoBuf, 50, startY, { width: 56, height: 56, fit: [56, 56] });
      } catch { /* logo opcional */ }
    }
    const textX = logoBuf ? 116 : 50;
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#047857").text(company, textX, startY, { width: 230 });
    doc.font("Helvetica").fontSize(9).fillColor("#64748b");
    const contact = [phone, city].filter(Boolean).join(" · ");
    if (contact) doc.text(contact, textX, doc.y);
    if (order.status) {
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#059669").text(`Estado: ${statusLabelEs}`, textX, doc.y);
    }
    // Detalles de factura a la derecha (segunda columna).
    const rightX = 360;
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#047857").text("FACTURA", rightX, startY, { width: 185, align: "right" });
    doc.font("Helvetica").fontSize(9).fillColor("#64748b");
    doc.text(`Pedido #${orderId}`, rightX, doc.y, { width: 185, align: "right" });
    doc.text(`Fecha: ${order.createdAt?.toDate?.() ?? new Date()}`, rightX, doc.y, { width: 185, align: "right" });
    doc.moveTo(50, Math.max(startY + 64, doc.y + 8)).lineTo(545, Math.max(startY + 64, doc.y + 8)).strokeColor("#d1fae5").lineWidth(1).stroke();
    doc.y = Math.max(startY + 76, doc.y + 16);
    doc.fillColor("#047857");
    doc.font("Helvetica-Bold").fontSize(16).text("Orden de Compra", { align: "center" });
    doc.moveDown(0.8);
    doc.fontSize(11).fillColor("#1e293b");
    doc.font("Helvetica-Bold").text(`Cliente: ${order.customerName ?? ""}`);
    doc.font("Helvetica").text(`Teléfono: ${order.customerPhone ?? ""}`);
    doc.text(`Email: ${order.customerEmail ?? ""}`);
    doc.text(`Dirección: ${order.deliveryAddress ?? ""}`);
    doc.moveDown();

    const items = Array.isArray(order.items) ? order.items : [];
    let y = doc.y;
    // Cabecera de tabla esmeralda suave.
    const tableX = 50;
    const tableW = 495;
    doc.save();
    doc.roundedRect(tableX, y, tableW, 22, 6).fill("#ecfdf5");
    doc.restore();
    doc.fillColor("#047857").font("Helvetica-Bold").fontSize(9);
    doc.text("Foto", tableX + 8, y + 6);
    doc.text("SKU", tableX + 48, y + 6);
    doc.text("Producto", tableX + 108, y + 6);
    doc.text("Cant.", tableX + 270, y + 6);
    doc.text("P. Unit", tableX + 305, y + 6);
    doc.text("Subtotal", tableX + 360, y + 6, { width: 120, align: "right" });
    doc.fillColor("#1e293b");
    y += 30;
    doc.font("Helvetica").fontSize(10);
    // Fotos pequeñas: se intenta incrustar la primera imagen del producto.
    const thumbCache = new Map<string, Buffer | null>();
    const getThumb = async (sku: string): Promise<Buffer | null> => {
      if (thumbCache.has(sku)) return thumbCache.get(sku) ?? null;
      try {
        const s = await db.doc(`products/${sku}`).get();
        const url = Array.isArray(s.data()?.images) ? s.data()?.images[0] : null;
        if (typeof url !== "string" || !url.startsWith("http")) return null;
        const res = await fetch(url);
        if (!res.ok) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        thumbCache.set(sku, buf);
        return buf;
      } catch {
        return null;
      }
    };
    // Pre-descarga en paralelo para no bloquear el flujo del PDF.
    const thumbsPromise = Promise.all(items.map((it: any) => getThumb(String(it.sku ?? ""))));
    let started = false;
    const draw = (thumbs: (Buffer | null)[]) => {
      if (started) return;
      started = true;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const label = typeof it.variantLabel === "string" && it.variantLabel ? ` · ${it.variantLabel}` : "";
        const nameText = `${it.name ?? ""}${label}`;
        const thumb = thumbs[i];
        const rowH = Math.max(34, doc.heightOfString(nameText, { width: 155 }) + 18);
        // Zebra sutil para relieves en la tabla.
        if (i % 2 === 0) {
          doc.save();
          doc.roundedRect(tableX, y, tableW, rowH, 4).fill("#f8fafc");
          doc.restore();
        }
        if (thumb) {
          try {
            doc.image(thumb, tableX + 4, y + 2, { width: 30, height: 30, fit: [30, 30] });
          } catch { /* foto opcional */ }
        }
        doc.fillColor("#1e293b").font("Helvetica").fontSize(9);
        doc.text(String(it.sku ?? ""), tableX + 48, y + 8, { width: 55 });
        doc.text(nameText, tableX + 108, y + 8, { width: 155 });
        doc.text(String(it.quantity ?? 0), tableX + 270, y + 8);
        doc.text(cop(Number(it.unitPrice ?? 0)), tableX + 305, y + 8);
        doc.font("Helvetica-Bold").text(cop(Number(it.subtotal ?? 0)), tableX + 360, y + 8, { width: 120, align: "right" });
        doc.font("Helvetica").fontSize(10);
        const note = typeof it.note === "string" && it.note ? ` Nota: ${it.note}` : "";
        if (note) {
          doc.fillColor("#64748b").fontSize(8).text(note, tableX + 108, y + 8 + doc.heightOfString(nameText, { width: 155 }) + 12, { width: 155 });
          doc.fillColor("#1e293b").fontSize(10);
        }
        // Separador horizontal suave (sin grilla completa).
        doc.moveTo(tableX, y + rowH).lineTo(tableX + tableW, y + rowH).strokeColor("#f1f5f9").lineWidth(0.5).stroke();
        y += rowH + 4;
        if (y > doc.page.height - 100) {
          doc.addPage();
          y = 50;
        }
      }
      // Gran Total esmeralda sólido.
      y += 8;
      const totalText = `TOTAL  ${cop(Number(order.total ?? 0))}`;
      doc.save();
      doc.roundedRect(340, y, 205, 34, 10).fill("#10b981");
      doc.restore();
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(14).text(totalText, 340, y + 9, { width: 205, align: "center" });
      doc.y = y + 44;
      doc.moveTo(50, doc.y + 6).lineTo(545, doc.y + 6).strokeColor("#e2e8f0").lineWidth(0.5).stroke();
      doc.font("Helvetica").fontSize(8).fillColor("#94a3b8").text(`Gracias por su compra. ${company}${contact ? " · " + contact : ""} · Pago contra entrega / transferencia.`, { align: "center" });
      doc.end();
    };
    thumbsPromise.then(draw).catch(() => draw(items.map(() => null)));
  });
}

// ---------------------------------------------------------------------------
// Módulo F: Generación de descripción de producto con Gemini (solo texto)
// ---------------------------------------------------------------------------

export const generateProductDescription = onCall(
  { region: "us-central1" },
  async (request) => {
    if (request.auth?.token.admin !== true) {
      throw new HttpsError("unauthenticated", "Solo el admin puede generar descripciones.");
    }
    // Llave desde secreto/env (privada) o Config privada (solo admins) para probar rápido.
    // El contexto de la tienda se lee de Config/SEO (companyName, city,
    // metaTitle, metaDescription, keywords, slogan) para no fijar un rubro
    // en el prompt: la tienda puede cambiar de rubro.
    let geminiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
    let storeCity = "";
    let storeName = "";
    let storeMetaTitle = "";
    let storeMetaDescription = "";
    let storeKeywords = "";
    let storeSlogan = "";
    try {
      const cfgSnap = await db.doc("store_config/general").get();
      const cfg = cfgSnap.data() ?? {};
      // Prioridad: env -> private_config (solo admins) -> store_config (legacy público, transición).
      if (!geminiKey) {
        try {
          const privSnap = await db.doc("private_config/gemini").get();
          const priv = privSnap.data() ?? {};
          const rawPriv = priv["geminiApiKey"];
          if (typeof rawPriv === "string" && rawPriv.trim().length > 0) {
            geminiKey = rawPriv.trim();
          }
        } catch {
          // Sin doc privado: se intenta el legacy.
        }
      }
      if (!geminiKey) {
        const raw = cfg["geminiApiKey"];
        if (typeof raw === "string" && raw.trim().length > 0) {
          geminiKey = raw.trim();
        }
      }
      if (typeof cfg["city"] === "string") storeCity = cfg["city"].trim();
      if (typeof cfg["companyName"] === "string") storeName = cfg["companyName"].trim();
      if (typeof cfg["metaTitle"] === "string") storeMetaTitle = cfg["metaTitle"].trim();
      if (typeof cfg["metaDescription"] === "string") storeMetaDescription = cfg["metaDescription"].trim();
      if (typeof cfg["slogan"] === "string") storeSlogan = cfg["slogan"].trim();
      if (Array.isArray(cfg["keywords"])) {
        storeKeywords = cfg["keywords"].map((k) => String(k).trim()).filter(Boolean).join(", ");
      } else if (typeof cfg["keywords"] === "string") {
        storeKeywords = cfg["keywords"].trim();
      }
    } catch {
      // Sin Config: se continúa con el contexto vacío (prompt genérico).
    }
    if (!geminiKey) {
      throw new HttpsError("failed-precondition", "Falta configurar la clave de Gemini en Config (privado) o GEMINI_API_KEY.");
    }
    const storeContextParts: string[] = [];
    if (storeName) storeContextParts.push(`Tienda: "${storeName}"`);
    if (storeCity) storeContextParts.push(`ciudad: "${storeCity}"`);
    if (storeMetaTitle) storeContextParts.push(`título SEO de la tienda: "${storeMetaTitle}"`);
    if (storeMetaDescription) storeContextParts.push(`descripción de la tienda: "${storeMetaDescription}"`);
    if (storeKeywords) storeContextParts.push(`palabras clave de la tienda: "${storeKeywords}"`);
    if (storeSlogan) storeContextParts.push(`eslogan: "${storeSlogan}"`);
    const storeContext = storeContextParts.length > 0
      ? `CONTEXTO_TIENDA: ${storeContextParts.join(". ")}. `
      : "";

    const data = (request.data ?? {}) as {
      name?: unknown;
      brand?: unknown;
      description?: unknown;
      category?: unknown;
      tone?: unknown;
      imageBase64?: unknown;
      imageMimeType?: unknown;
      includeDescription?: unknown;
      includeSeo?: unknown;
      includeTags?: unknown;
    };
    const name = cleanText(data.name, 120);
    const brand = cleanText(data.brand, 60);
    const category = cleanText(data.category, 80);
    const tone = cleanText(data.tone, 40) || "profesional";
    const imageBase64 =
      typeof data.imageBase64 === "string" ? data.imageBase64.trim() : "";
    const imageMimeType =
      typeof data.imageMimeType === "string" ? data.imageMimeType.trim() : "";
    const allowedMime = new Set(["image/jpeg", "image/png", "image/webp"]);
    const hasImage =
      imageBase64.length > 0 &&
      imageBase64.length < 5_500_000 &&
      allowedMime.has(imageMimeType);
    const includeDescription =
      data.includeDescription === undefined
        ? true
        : data.includeDescription === true;
    const includeSeo = data.includeSeo === true;
    const includeTags = data.includeTags === true;
    logger.info("AI request", {
      name,
      brand,
      category,
      hasImage,
      includeDescription,
      includeSeo,
      includeTags,
    });
    if (!includeDescription && !includeSeo && !includeTags) {
      throw new HttpsError(
        "invalid-argument",
        "Selecciona al menos un campo para generar."
      );
    }
    if (!name && !hasImage) {
      throw new HttpsError(
        "invalid-argument",
        "Necesitas nombre o foto principal para generar."
      );
    }

    const parts: Array<Record<string, unknown>> = [];
    const example: Record<string, string> = {};
    if (includeDescription)
      example["description"] =
        "texto en espanol 80-120 palabras, beneficios y uso, sin prefijos";
    if (includeSeo) {
      example["seoTitle"] = "titulo SEO 50-60 caracteres";
      example["seoDescription"] = "descripcion SEO 140-160 caracteres";
    }
    if (includeTags)
      example["tags"] =
        "etiquetas en minusculas separadas por coma, sin #, sin tildes, 5-8, ej: limpiador, multiusos, hogar";
    const exampleJson = JSON.stringify(example);
    const basePrompt = `Eres un copywriter. ${storeContext}Producto: "${name || "ver foto"}". Marca: "${brand || "sin marca"}". Categoria: "${category || "general"}". Tono: ${tone}. Si hay foto, describe lo que ves (color, forma, material, marca visible). Usa nombre y foto si existen. Responde SOLO un objeto JSON sin markdown ni prefijos. FORMATO EXACTO ejemplo: ${exampleJson}. No agregues campos extra. Todo en espanol.`;
    logger.info("AI prompt", { prompt: basePrompt.slice(0, 2000), storeContext: storeContext.slice(0, 1000) });
    parts.push({ text: basePrompt });
    if (hasImage) {
      parts.push({ inlineData: { mimeType: imageMimeType, data: imageBase64 } });
    }

    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent";

    const callGemini = async (
      promptParts: Array<Record<string, unknown>>,
      useJson: boolean,
    ): Promise<string> => {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": geminiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: promptParts }],
          generationConfig: useJson
            ? { maxOutputTokens: 1500, temperature: 0.5, responseMimeType: "application/json" }
            : { maxOutputTokens: 500, temperature: 0.5 },
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        logger.error("Gemini generateContent failed", { status: res.status, body: txt.slice(0, 500) });
        throw new HttpsError("unavailable", "No se pudo generar con IA. Intentelo de nuevo.");
      }
      const json = (await res.json()) as unknown as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const allParts = json.candidates?.[0]?.content?.parts ?? [];
      const joined = allParts
        .map((p) => (typeof p.text === "string" ? p.text : ""))
        .join("")
        .trim();
      logger.info("Gemini raw (200)", { joinedSnippet: joined.slice(0, 2000), partsCount: allParts.length });
      return joined;
    };

    const stripAccents = (s: string): string =>
      s
        .replaceAll("á", "a")
        .replaceAll("é", "e")
        .replaceAll("í", "i")
        .replaceAll("ó", "o")
        .replaceAll("ú", "u")
        .replaceAll("ü", "u")
        .replaceAll("ñ", "n")
        .replaceAll("Á", "a")
        .replaceAll("É", "e")
        .replaceAll("Í", "i")
        .replaceAll("Ó", "o")
        .replaceAll("Ú", "u")
        .replaceAll("Ñ", "n");

    const buildSeoTitle = (n: string, b: string, city: string, company: string = ""): string => {
      const base = `${b ? b + " " : ""}${n}`.trim() || "Producto";
      // Sin rubro fijo: se usa la tienda/ciudad de Config si existen.
      const suffix = company ? ` - ${company}` : (city ? ` - ${city}` : "");
      const title = (base + suffix).trim();
      return title.length > 60 ? title.slice(0, 57) + "..." : title;
    };
    const buildSeoDescription = (desc: string): string => {
      if (!desc) return "";
      const clean = desc.replace(/\s+/g, " ").trim();
      if (clean.length <= 160) return clean;
      const cut = clean.slice(0, 160);
      const lastSpace = cut.lastIndexOf(" ");
      return (lastSpace > 80 ? cut.slice(0, lastSpace) : cut) + "...";
    };
    const buildTags = (n: string, b: string, cat: string, desc: string): string => {
      const stop = new Set(["de", "la", "el", "en", "y", "para", "con", "sin", "un", "una", "los", "las", "del", "por", "que", "se", "su", "al", "es", "lo"]);
      const raw = `${n} ${b} ${cat} ${desc}`.toLowerCase();
      const clean = stripAccents(raw);
      const words = clean
        .replace(/[^a-z0-9\s,]/g, " ")
        .split(/[\s,]+/)
        .map((w) => w.trim())
        .filter((w) => w.length >= 4 && !stop.has(w));
      const seen = new Set<string>();
      const out: string[] = [];
      for (const w of words) {
        if (!seen.has(w)) {
          seen.add(w);
          out.push(w);
        }
        if (out.length >= 8) break;
      }
      return out.join(", ");
    };

    type LogPayload = {
      name: string;
      brand: string;
      category: string;
      hasImage: boolean;
      includeDescription: boolean;
      includeSeo: boolean;
      includeTags: boolean;
      rawText: string;
      parsed: Record<string, unknown>;
      description: string;
      seoTitle: string;
      seoDescription: string;
      tags: string;
      status: string;
    };
    const logGeneration = async (p: LogPayload): Promise<void> => {
      logger.info("AI generation result", {
        name: p.name,
        hasImage: p.hasImage,
        includeDescription: p.includeDescription,
        includeSeo: p.includeSeo,
        includeTags: p.includeTags,
        rawSnippet: p.rawText.slice(0, 2000),
        parsedKeys: Object.keys(p.parsed),
        descriptionLen: p.description.length,
        seoTitleLen: p.seoTitle.length,
        seoDescriptionLen: p.seoDescription.length,
        tags: p.tags,
        status: p.status,
      });
      try {
        await db.collection("ai_generation_logs").add({
          createdAt: FieldValue.serverTimestamp(),
          name: p.name,
          brand: p.brand,
          category: p.category,
          hasImage: p.hasImage,
          includeDescription: p.includeDescription,
          includeSeo: p.includeSeo,
          includeTags: p.includeTags,
          rawSnippet: p.rawText.slice(0, 4000),
          parsedKeys: Object.keys(p.parsed),
          parsedPreview: JSON.stringify(p.parsed).slice(0, 4000),
          descriptionSnippet: p.description.slice(0, 500),
          seoTitle: p.seoTitle,
          seoDescription: p.seoDescription,
          tags: p.tags,
          status: p.status,
        });
      } catch (e) {
        logger.warn("No se pudo escribir log en Firestore", { error: String(e) });
      }
    };

    let rawText = await callGemini(parts, true);
    if (!rawText) {
      logger.warn("Gemini vacio en JSON, reintentando texto plano");
      const plainPrompt = `Genera una descripcion atractiva en espanol (80-120 palabras) para "${name || "producto de la foto"}" marca "${brand || "sin marca"}", tono ${tone}. ${storeContext}Responde SOLO la descripcion, sin prefijos ni JSON.`;
      const plainParts: Array<Record<string, unknown>> = [{ text: plainPrompt }];
      if (hasImage) {
        plainParts.push({ inlineData: { mimeType: imageMimeType, data: imageBase64 } });
      }
      rawText = await callGemini(plainParts, false);
      logger.info("Gemini plain retry raw", { snippet: rawText.slice(0, 2000) });
      if (!rawText) {
        throw new HttpsError("unavailable", "Gemini no devolvio texto.");
      }
      // Si el reintento fue texto plano, devolvemos estructura minima para descripcion.
      if (includeDescription) {
        const desc = rawText;
        const seoTitleFallback = includeSeo
          ? buildSeoTitle(name, brand, storeCity, storeName)
          : "";
        const seoDescFallback = includeSeo
          ? buildSeoDescription(desc)
          : "";
        const tagsFallback = includeTags
          ? buildTags(name, brand, category, desc)
          : "";
        await logGeneration({
          name,
          brand,
          category,
          hasImage,
          includeDescription,
          includeSeo,
          includeTags,
          rawText,
          parsed: { fallbackPlain: true },
          description: desc,
          seoTitle: seoTitleFallback,
          seoDescription: seoDescFallback,
          tags: tagsFallback,
          status: "plain-retry",
        });
        return {
          description: desc,
          seoTitle: seoTitleFallback,
          seoDescription: seoDescFallback,
          tags: tagsFallback,
          keywords: tagsFallback,
        };
      }
      throw new HttpsError("unavailable", "Gemini no devolvio texto.");
    }
    logger.info("Gemini JSON raw", { snippet: rawText.slice(0, 2000) });
    // Limpieza: quitar fences ```json ... ```
    rawText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    // Extraer objeto JSON (puede venir con texto alrededor)
    let parsed: Record<string, unknown> = {};
    const start = rawText.indexOf("{");
    const end = rawText.lastIndexOf("}");
    let jsonSlice = start >= 0 && end > start ? rawText.slice(start, end + 1) : rawText;
    try {
      parsed = JSON.parse(jsonSlice) as Record<string, unknown>;
    } catch {
      // Intentos de reparacion: JSON truncado o comillas simples.
      try {
        parsed = JSON.parse(jsonSlice + "}") as Record<string, unknown>;
      } catch {
        try {
          // Extraccion tolerante por regex si el parseo falla por truncado.
          const grab = (key: string): string => {
            const m = jsonSlice.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, "i"));
            return m ? m[1].replace(/\\"/g, '"').replace(/\\n/g, " ").trim() : "";
          };
          parsed = {
            description: grab("description"),
            seoTitle: grab("seoTitle"),
            seoDescription: grab("seoDescription"),
            tags: grab("tags"),
          };
        } catch {
          parsed = {};
        }
      }
    }
    const asStr = (v: unknown) => {
      if (typeof v === "string") return v.trim();
      if (Array.isArray(v)) return v.map((e) => String(e).trim()).filter(Boolean).join(", ");
      return "";
    };
    // Claves tolerantes por si el modelo abrevia (descriptio, seo_title, etc.)
    const pick = (...keys: string[]): string => {
      for (const k of keys) {
        const lower = Object.keys(parsed).find((pk) => pk.toLowerCase() === k.toLowerCase());
        if (lower) {
          const v = asStr(parsed[lower]);
          if (v) return v;
        }
      }
      return "";
    };
    let description = pick("description", "descripcion", "descriptio", "desc");
    let seoTitle = includeSeo ? pick("seoTitle", "seo_title", "title") : "";
    let seoDescription = includeSeo ? pick("seoDescription", "seo_description", "seoDesc") : "";
    const tagsRaw = includeTags ? pick("tags", "tag", "keywords", "keyword") : "";
    if (includeDescription && !description) {
      logger.warn("Sin descripcion tras JSON, reintentando texto plano");
      const plainPrompt = `Genera una descripcion atractiva en espanol (80-120 palabras) para "${name || "producto de la foto"}" marca "${brand || "sin marca"}", tono ${tone}. ${storeContext}Responde SOLO la descripcion.`;
      const plainParts: Array<Record<string, unknown>> = [{ text: plainPrompt }];
      if (hasImage) {
        plainParts.push({ inlineData: { mimeType: imageMimeType, data: imageBase64 } });
      }
      const plainText = await callGemini(plainParts, false);
      description = plainText;
    }
    if (includeDescription && !description) {
      throw new HttpsError("unavailable", "Gemini no devolvio descripcion.");
    }
    const normalizeTags = (raw: string): string => {
      if (!raw) return "";
      return raw
        .split(",")
        .map((t) => t.trim().toLowerCase().replace(/^#/, "").replaceAll("á", "a").replaceAll("é", "e").replaceAll("í", "i").replaceAll("ó", "o").replaceAll("ú", "u").replaceAll("ñ", "n"))
        .filter(Boolean)
        .slice(0, 8)
        .join(", ");
    };
    let tags = normalizeTags(tagsRaw);
    // Fallback SEO/tags cuando Gemini no los devuelve (p.ej. segundo intento con modelo parcial)
    if (includeSeo && !seoTitle) {
      seoTitle = buildSeoTitle(name, brand, storeCity, storeName);
      logger.warn("SEO title fallback", { seoTitle });
    }
    if (includeSeo && !seoDescription) {
      const base = description || seoTitle;
      seoDescription = buildSeoDescription(base);
      logger.warn("SEO description fallback", { len: seoDescription.length });
    }
    if (includeTags && !tags) {
      tags = buildTags(name, brand, category, description);
      logger.warn("Tags fallback", { tags });
    }
    await logGeneration({
      name,
      brand,
      category,
      hasImage,
      includeDescription,
      includeSeo,
      includeTags,
      rawText,
      parsed,
      description,
      seoTitle,
      seoDescription,
      tags,
      status: "ok",
    });
    return {
      description,
      seoTitle,
      seoDescription,
      tags,
      keywords: tags,
    };
  }
);
