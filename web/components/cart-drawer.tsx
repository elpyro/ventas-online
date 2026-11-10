"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShoppingCart,
  ShoppingBasket,
  Minus,
  Plus,
  Trash2,
  ArrowRight,
} from "lucide-react";

import { useCart } from "@/lib/cart";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MinimumOrderHint, type MinimumLine } from "@/components/minimum-order-hint";
import { cn } from "@/lib/utils";

export interface CartDrawerCatalog {
  id: string;
  title: string;
  minOrderSubtotal: number;
}

const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 2,
});

export function CartDrawer({
  globalMinOrder,
  catalogs,
}: {
  globalMinOrder: number;
  catalogs: CartDrawerCatalog[];
}) {
  const router = useRouter();
  const { items, total, count, updateQty, removeItem, clear, setNote } = useCart();
  const [open, setOpen] = useState(false);

  const catalogMap = new Map(catalogs.map((c) => [c.id, c]));

  // Subtotal por catálogo presente en el carrito.
  const subtotalByCatalog = new Map<string, number>();
  for (const item of items) {
    const current = subtotalByCatalog.get(item.catalogId) ?? 0;
    subtotalByCatalog.set(
      item.catalogId,
      current + item.price * item.quantity
    );
  }

  const minLines: MinimumLine[] = [
    { label: "Pedido global", current: total, min: globalMinOrder },
    ...[...subtotalByCatalog.entries()].map(([catalogId, subtotal]) => {
      const catalog = catalogMap.get(catalogId);
      return {
        label: `Catálogo ${catalog?.title ?? catalogId}`,
        current: subtotal,
        min: catalog?.minOrderSubtotal ?? 0,
      };
    }),
  ];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          aria-label="Abrir carrito"
          className="group flex items-center gap-2 rounded-full bg-white px-3 py-2 text-sm font-semibold text-foreground shadow-sm ring-1 ring-gray-200 transition-all duration-150 hover:bg-gray-50 hover:shadow-md active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <span className="relative">
            <ShoppingCart className="h-5 w-5" />
            {count > 0 && (
              <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                {count > 99 ? "99+" : count}
              </span>
            )}
          </span>
          <span className="hidden sm:inline">
            {count > 0 ? cop.format(total) : "Carrito"}
          </span>
        </button>
      </SheetTrigger>

      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b p-5">
          <SheetTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            Tu carrito
            {count > 0 && (
              <Badge variant="secondary" className="ml-1">
                {count} {count === 1 ? "ítem" : "ítems"}
              </Badge>
            )}
          </SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="rounded-full bg-muted p-4">
              <ShoppingBasket className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold">Tu carrito está vacío</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Agrega productos desde el catálogo y aparecerá aquí.
              </p>
            </div>
            <Button
              className="w-full"
              onClick={() => {
                setOpen(false);
                router.push("/catalogos");
              }}
            >
              Explorar catálogos
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              {items.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center gap-3 rounded-xl border bg-white p-2.5 shadow-sm"
                >
                  <img
                    src={item.image ?? ""}
                    alt={item.name}
                    className="h-16 w-16 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={item.name}>
                      {item.name}
                    </p>
                    {item.variantLabel && (
                      <p className="text-xs font-medium text-muted-foreground">
                        {item.variantLabel}
                      </p>
                    )}
                    <p className="text-sm font-semibold text-primary">
                      {cop.format(item.price)}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <button
                        aria-label="Quitar uno"
                        onClick={() => updateQty(item.key, item.quantity - 1)}
                        className="flex h-6 w-6 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:bg-muted"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-6 text-center text-sm font-semibold">
                        {item.quantity}
                      </span>
                      <button
                        aria-label="Agregar uno"
                        onClick={() => updateQty(item.key, item.quantity + 1)}
                        className="flex h-6 w-6 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:bg-muted"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                      <button
                        aria-label="Eliminar del carrito"
                        onClick={() => removeItem(item.key)}
                        className="ml-auto rounded-full p-1.5 text-red-500 transition-colors hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <input
                      placeholder="Nota (opcional)"
                      value={item.note ?? ""}
                      onChange={(e) => setNote(item.key, e.target.value)}
                      className="mt-2 w-full rounded-lg border px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <p className="text-sm font-bold">
                    {cop.format(item.price * item.quantity)}
                  </p>
                </div>
              ))}
              <button
                onClick={clear}
                className="ml-auto block text-xs font-medium text-muted-foreground transition-colors hover:text-red-600"
              >
                Vaciar carrito
              </button>
            </div>

            <SheetFooter className="border-t p-5">
              <div className="w-full space-y-3">
                <MinimumOrderHint lines={minLines} />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total</span>
                  <span className="text-xl font-bold">{cop.format(total)}</span>
                </div>
                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => {
                    setOpen(false);
                    router.push("/checkout");
                  }}
                >
                  Ir al checkout
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Link
                  href="/carrito"
                  onClick={() => setOpen(false)}
                  className="block text-center text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Ver carrito completo
                </Link>
              </div>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// Helper usado por la página de carrito completa: misma lógica de mínimos.
export function buildMinimumLines(
  items: { sku: string; price: number; quantity: number; catalogId: string }[],
  globalMinOrder: number,
  catalogs: CartDrawerCatalog[]
): MinimumLine[] {
  const catalogMap = new Map(catalogs.map((c) => [c.id, c]));
  const subtotalByCatalog = new Map<string, number>();
  let total = 0;
  for (const item of items) {
    total += item.price * item.quantity;
    subtotalByCatalog.set(
      item.catalogId,
      (subtotalByCatalog.get(item.catalogId) ?? 0) + item.price * item.quantity
    );
  }
  return [
    { label: "Pedido global", current: total, min: globalMinOrder },
    ...[...subtotalByCatalog.entries()].map(([catalogId, subtotal]) => ({
      label: `Catálogo ${catalogMap.get(catalogId)?.title ?? catalogId}`,
      current: subtotal,
      min: catalogMap.get(catalogId)?.minOrderSubtotal ?? 0,
    })),
  ];
}
