"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Product, ProductVariant, effectivePrice, variantLabel } from "./types";

export interface CartItem {
  /** Clave estable: "SKU" o "SKU::variantId". */
  key: string;
  sku: string;
  name: string;
  price: number;
  quantity: number;
  catalogId: string;
  image?: string;
  variantId?: string;
  variantLabel?: string;
  /** Nota opcional del cliente para este producto. */
  note?: string;
}

export function cartKey(sku: string, variantId?: string): string {
  return variantId ? `${sku}::${variantId}` : sku;
}

interface CartContextValue {
  items: CartItem[];
  addItem: (
    product: Product,
    catalogId: string,
    qty?: number,
    variant?: ProductVariant | null
  ) => void;
  removeItem: (key: string) => void;
  updateQty: (key: string, qty: number) => void;
  setNote: (key: string, note: string) => void;
  clear: () => void;
  total: number;
  count: number;
}

const CartContext = createContext<CartContextValue | null>(null);

/** Reconstruye la clave de carritos guardados antes de los variantes. */
function migrateLegacyItem(raw: any): CartItem | null {
  if (!raw || typeof raw.sku !== "string") return null;
  const variantId = typeof raw.variantId === "string" ? raw.variantId : undefined;
  return {
    ...raw,
    key: typeof raw.key === "string" ? raw.key : cartKey(raw.sku, variantId),
  };
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("cart");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setItems(parsed.map(migrateLegacyItem).filter(Boolean) as CartItem[]);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("cart", JSON.stringify(items));
    } catch {}
  }, [items]);

  function addItem(
    product: Product,
    catalogId: string,
    qty = 1,
    variant: ProductVariant | null = null
  ) {
    const variantId = variant?.id;
    const key = cartKey(product.sku, variantId);
    const price = effectivePrice(product, variant);
    const label = variant ? variantLabel(variant) : undefined;

    setItems((prev) => {
      const existing = prev.find((i) => i.key === key);
      if (existing) {
        return prev.map((i) =>
          i.key === key ? { ...i, quantity: i.quantity + qty } : i
        );
      }
      return [
        ...prev,
        {
          key,
          sku: product.sku,
          name: product.name,
          price,
          quantity: qty,
          catalogId,
          image: product.images?.[0],
          ...(variantId ? { variantId, variantLabel: label } : {}),
        },
      ];
    });
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  function updateQty(key: string, qty: number) {
    if (qty <= 0) return removeItem(key);
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, quantity: qty } : i)));
  }

  function setNote(key: string, note: string) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, note } : i)));
  }

  function clear() {
    setItems([]);
  }

  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const count = items.reduce((s, i) => s + i.quantity, 0);

  // Borrador "Seleccionando": uno por cliente, sin tocar stock.
  // Debounce simple: espera 600ms tras el último cambio.
  useEffect(() => {
    if (items.length === 0) return;
    const t = setTimeout(async () => {
      try {
        const { httpsCallable } = await import("firebase/functions");
        const { functions } = await import("./firebase");
        const fn = httpsCallable(functions, "saveSelectingDraft");
        // clientKey: teléfono del perfil si existe, si no un id de invitado.
        const raw = localStorage.getItem("customerProfile");
        let clientKey = "";
        let customerPhone = "";
        if (raw) {
          try {
            const c = JSON.parse(raw);
            customerPhone = typeof c?.phone === "string" ? c.phone : "";
            clientKey = customerPhone;
          } catch {}
        }
        if (!clientKey) {
          let guest = localStorage.getItem("guestClientKey");
          if (!guest) {
            guest = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            localStorage.setItem("guestClientKey", guest);
          }
          clientKey = guest;
        }
        await fn({
          clientKey,
          customerPhone,
          items: items.map((i) => ({
            sku: i.sku,
            quantity: i.quantity,
            catalogId: i.catalogId,
            ...(i.variantId ? { variantId: i.variantId } : {}),
            ...(i.note ? { note: i.note } : {}),
          })),
        });
      } catch {
        // El borrador es opcional: si falla, el checkout igual crea el pedido.
      }
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQty, setNote, clear, total, count }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
